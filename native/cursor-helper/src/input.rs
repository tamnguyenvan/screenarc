// Clicks, from the kernel.
//
// Wayland has no portal for button events, so this is the only source: the same
// one OpenScreen uses. It is deliberately the smallest possible reader — left
// button only, pointer devices only — because reading input devices is a
// privileged thing to do and the app must never look like a keylogger.
//
// Consequences, all of which the app is told about:
//   * no read permission -> clicks are simply unavailable, moves still work
//   * the pointer position does NOT come from here (evdev reports relative
//     motion); it comes from the portal's cursor metadata. A click is stamped
//     with the position of the nearest sample the portal has given us.

use evdev::{Device, EventSummary, KeyCode, RelativeAxisCode};
use std::path::PathBuf;
use std::sync::mpsc::Sender;
use std::time::{Duration, Instant};

/// Buttons we care about. Anything else — including every key on a keyboard — is
/// ignored, and only *pointer* devices are ever opened.
pub fn button_name(code: KeyCode) -> Option<&'static str> {
    match code {
        KeyCode::BTN_LEFT => Some("left"),
        KeyCode::BTN_RIGHT => Some("right"),
        KeyCode::BTN_MIDDLE => Some("middle"),
        _ => None,
    }
}

/// True when a device should be read: it has the left button, and it is not a
/// keyboard. Keyboards report a wide key range, so any of those disqualifies the
/// device — that check is why this rule does not just look for BTN_LEFT.
pub fn is_pointer_device(keys: &[KeyCode], has_relative_motion: bool) -> bool {
    const KEYBOARD_KEYS: [KeyCode; 4] = [
        KeyCode::KEY_A,
        KeyCode::KEY_ENTER,
        KeyCode::KEY_SPACE,
        KeyCode::KEY_ESC,
    ];
    if !keys.contains(&KeyCode::BTN_LEFT) {
        return false;
    }
    if KEYBOARD_KEYS.iter().any(|key| keys.contains(key)) {
        return false;
    }
    // Touchscreens and tablets report absolute positions and no relative axes;
    // they are not what the udev rule targets and their events would be nonsense
    // as pointer clicks.
    has_relative_motion || keys.contains(&KeyCode::BTN_TOUCH)
}

/// Devices that look like a pointer. Errors are returned so the caller can tell
/// the user about permissions instead of silently producing no clicks.
pub fn candidate_devices() -> (Vec<(PathBuf, Device)>, Option<String>) {
    let mut devices = Vec::new();
    let mut first_error = None;

    for (path, device) in evdev::enumerate() {
        let supported = device.supported_keys();
        let keys: Vec<KeyCode> = supported
            .map(|keys| keys.iter().collect())
            .unwrap_or_default();
        let relative = device
            .supported_relative_axes()
            .map(|axes| axes.contains(RelativeAxisCode::REL_X))
            .unwrap_or(false);
        if !is_pointer_device(&keys, relative) {
            continue;
        }
        // Opening is where permission is decided; a device we cannot read is not
        // fatal, it just means no clicks.
        match Device::open(&path) {
            Ok(handle) => {
                // evdev's Device::open leaves the fd BLOCKING, but input::run
                // polls several devices in a loop (4ms) expecting non-blocking
                // reads. A blocking fetch blocks forever on the first idle
                // device (usually the touchpad) and starves every other one —
                // the mouse being clicked never gets read, so "clicks on" but
                // zero click events. Without this, a recording with the
                // touchpad in the device list has no clicks at all.
                if handle.set_nonblocking(true).is_ok() {
                    devices.push((path, handle));
                }
            }
            Err(error) => {
                if first_error.is_none() {
                    first_error = Some(format!("{}: {}", path.display(), error));
                }
            }
        }
    }

    (devices, first_error)
}

/// Polls the pointer devices and reports button transitions.
///
/// Blocking and long-lived: it runs on its own thread and stops when the process
/// does, or as soon as `stop_after` has passed with no events (the app's way of
/// ending the reader when a recording is stopped).
pub fn run(devices: Vec<(PathBuf, Device)>, tx: Sender<(String, bool)>, stop_after: Duration) {
    let mut readables: Vec<Device> = devices.into_iter().map(|(_, device)| device).collect();
    let mut last_event = Instant::now();

    loop {
        if last_event.elapsed() > stop_after {
            return;
        }

        for device in readables.iter_mut() {
            let events = match device.fetch_events() {
                Ok(events) => events,
                Err(_) => continue,
            };
            for event in events {
                last_event = Instant::now();
                // Matching the summary rather than the raw type keeps this working
                // across evdev versions that renamed their event kinds.
                if let EventSummary::Key(_, code, value) = event.destructure() {
                    if let Some(button) = button_name(code) {
                        let pressed = value == 1;
                        if tx.send((button.to_string(), pressed)).is_err() {
                            return;
                        }
                    }
                }
            }
        }

        // Nothing to wait on: fetch_events is non-blocking, so this is a poll
        // loop. 4 ms keeps clicks aligned with a 60 fps sample stream.
        std::thread::sleep(Duration::from_millis(4));
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn left_button_is_the_one_we_report() {
        assert_eq!(button_name(KeyCode::BTN_LEFT), Some("left"));
        assert_eq!(button_name(KeyCode::BTN_RIGHT), Some("right"));
        assert_eq!(button_name(KeyCode::BTN_MIDDLE), Some("middle"));
    }

    #[test]
    fn keyboard_keys_are_never_buttons() {
        assert_eq!(button_name(KeyCode::KEY_A), None);
        assert_eq!(button_name(KeyCode::KEY_ENTER), None);
        assert_eq!(button_name(KeyCode::KEY_LEFTSHIFT), None);
    }

    #[test]
    fn a_mouse_is_a_pointer() {
        assert!(is_pointer_device(
            &[KeyCode::BTN_LEFT, KeyCode::BTN_RIGHT],
            true
        ));
    }

    #[test]
    fn a_keyboard_is_not_a_pointer_even_with_a_button_like_code() {
        // Some keyboards advertise BTN_LEFT for their media keys; the key range
        // is what gives them away.
        assert!(!is_pointer_device(
            &[KeyCode::BTN_LEFT, KeyCode::KEY_A, KeyCode::KEY_ENTER],
            false
        ));
    }

    #[test]
    fn a_device_without_the_left_button_is_ignored() {
        assert!(!is_pointer_device(&[KeyCode::KEY_A], true));
        assert!(!is_pointer_device(&[], true));
    }

    #[test]
    fn a_touchpad_without_relative_axes_but_with_touch_is_a_pointer() {
        assert!(is_pointer_device(
            &[KeyCode::BTN_LEFT, KeyCode::BTN_TOUCH],
            false
        ));
    }

    #[test]
    fn an_absolute_only_device_is_not_treated_as_a_mouse() {
        // A graphics tablet's pen reports absolute coordinates; treating its
        // BTN_LEFT-style events as clicks would put them in the wrong place.
        assert!(!is_pointer_device(&[KeyCode::BTN_LEFT], false));
    }
}
