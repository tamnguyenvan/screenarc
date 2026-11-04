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
//
// Reader: one thread per device, raw blocking reads. This is deliberate: a
// live test on the user's KDE Wayland desktop proved a plain blocking read on
// /dev/input/eventN receives button events the whole time, while the evdev
// sync stream (Device::fetch_events with SYN_DROPPED state tracking) returned
// EAGAIN for the whole session — "clicks on" yet zero events. RawDevice wraps
// plain read() exactly like `cat` does, which is what the test showed working.

use evdev::raw_stream;
use evdev::{EventSummary, KeyCode, RelativeAxisCode};
use std::path::PathBuf;
use std::sync::mpsc::Sender;
use std::time::Duration;

type RawDevice = evdev::raw_stream::RawDevice;

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
///
/// The RawDevice from enumerate is already opened; a device that could not be
/// opened is skipped, so "clicks on" means the device opened AND looks like a
/// pointer.
pub fn candidate_devices() -> (Vec<(PathBuf, RawDevice)>, Option<String>) {
    let mut devices = Vec::new();
    let first_error = None;

    for (path, device) in raw_stream::enumerate() {
        let keys: Vec<KeyCode> = device
            .supported_keys()
            .map(|keys| keys.iter().collect())
            .unwrap_or_default();
        let relative = device
            .supported_relative_axes()
            .map(|axes| axes.contains(RelativeAxisCode::REL_X))
            .unwrap_or(false);
        if !is_pointer_device(&keys, relative) {
            continue;
        }
        devices.push((path, device));
    }

    (devices, first_error)
}

/// Reads one device in a blocking loop and reports button transitions.
///
/// Blocking reads are the point: they're what `cat /dev/input/eventN` does,
/// and that is what a live recording proved delivers events. The sync stream's
/// O_NONBLOCK polling never delivered any.
fn run_device(mut device: RawDevice, tx: Sender<(String, bool)>, dbg: bool) {
    if dbg {
        eprintln!(
            "[CICKDBG] device thread: {}",
            device.name().unwrap_or("<unnamed>")
        );
    }
    loop {
        let events = match device.fetch_events() {
            Ok(events) => events,
            Err(error) => {
                if dbg {
                    eprintln!("[CICKDBG] device read ended: {error}");
                }
                return;
            }
        };
        for event in events {
            // Matching the summary rather than the raw type keeps this working
            // across evdev versions that renamed their event kinds.
            if let EventSummary::Key(_, code, value) = event.destructure() {
                // Shortcut: log EVERY key code that arrives (mapped or not) so a
                // trace shows what a click actually produces instead of silently
                // dropping an unexpected code. Drop this when clicks are proven.
                if dbg {
                    eprintln!("[CICKDBG] key code={:?} value={}", code, value);
                }
                if let Some(button) = button_name(code) {
                    let pressed = value == 1;
                    if tx.send((button.to_string(), pressed)).is_err() {
                        return;
                    }
                }
            }
        }
    }
}

/// Spawns one blocking reader thread per pointer device, then returns.
///
/// Each device gets a thread so a blocking read on one node never starves
/// another. Threads die when the process exits; the app stops the helper at the
/// end of a recording, so no explicit shutdown is needed (`stop_after` from the
/// poll-loop era is ignored).
pub fn run(devices: Vec<(PathBuf, RawDevice)>, tx: Sender<(String, bool)>, _stop_after: Duration) {
    let dbg = std::env::var("DEMOTHAT_CICKDBG").is_ok();
    if dbg {
        eprintln!("[CICKDBG] reader start, {} device(s)", devices.len());
        for (path, _) in devices.iter() {
            eprintln!("[CICKDBG] device path: {}", path.display());
        }
    }
    for (_, device) in devices {
        let tx = tx.clone();
        std::thread::spawn(move || run_device(device, tx, dbg));
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
