// DemoThat's Wayland helper.
//
// Why a separate process exists at all: on Wayland the only way to get the
// pointer's position is to own the ScreenCast session, and the only way to own it
// is to speak the portal's D-Bus API and read PipeWire — neither of which is
// reachable from Electron's JavaScript. So this binary does that part, and hands
// the app two things it can use: raw video frames on a file descriptor (piped
// into the app's bundled FFmpeg) and cursor samples as JSON lines on stdout.
//
// Usage: demothat-cursor-helper '{"videoFd":3,"fps":30}'
//
// stdout  NDJSON events (see protocol.rs)
// fd 3    raw video frames, tightly packed rows
// stdin   control words: pause, resume, stop (EOF also stops)
//
// Exit codes: 0 finished cleanly, 2 nothing could be captured (the app then falls
// back to its browser capture path), 64 bad usage.

mod capture;
mod input;
mod portal;
mod protocol;

use anyhow::{Context, Result};
use protocol::{Control, Emitter, Event};
use std::sync::atomic::AtomicBool;
use std::sync::mpsc;
use std::sync::{Arc, Mutex};
use std::time::Duration;

/// The udev rule that makes clicks readable, quoted verbatim in the log so a user
/// who wants click effects knows exactly what to install. The same text is in the
/// app's Wayland notes.
const UDEV_HINT: &str = "clicks need read access to your pointer devices: create \
/etc/udev/rules.d/70-demothat-mouse.rules with KERNEL==\"event*\", SUBSYSTEM==\"input\", \
ENV{ID_INPUT_MOUSE}==\"1\", ENV{ID_INPUT_KEYBOARD}!=\"1\", TAG+=\"uaccess\" then run \
'sudo udevadm control --reload-rules && sudo udevadm trigger --subsystem-match=input'. \
Recording works without it; clicks are simply not reported.";

#[derive(Debug, serde::Deserialize)]
struct Config {
    #[serde(rename = "videoFd", default = "default_video_fd")]
    video_fd: i32,
    #[serde(default = "default_fps")]
    #[allow(dead_code)]
    fps: u32,
    #[serde(rename = "clickIdleTimeoutMs", default = "default_click_idle_timeout")]
    click_idle_timeout_ms: u64,
}

fn default_video_fd() -> i32 {
    3
}
fn default_fps() -> u32 {
    30
}
fn default_click_idle_timeout() -> u64 {
    2000
}

fn main() {
    let code = match run() {
        Ok(()) => 0,
        Err(error) => {
            let mut events = Emitter::new(std::io::stdout());
            events.emit(Event::Error {
                message: format!("{error:#}"),
            });
            2
        }
    };
    std::process::exit(code);
}

fn run() -> Result<()> {
    let raw_config = std::env::args().nth(1).context("missing config argument")?;
    let config: Config =
        serde_json::from_str(&raw_config).context("the config argument is not valid JSON")?;

    let mut events = Emitter::new(std::io::stdout());
    let clicks_available = start_click_reader(&config, &mut events);

    // The portal call is async; the capture loop that follows is not, and owns the
    // thread from here on.
    let runtime = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .context("could not start an async runtime for the portal call")?;
    let capture_stream = runtime
        .block_on(portal::open_capture_stream())
        .context("the desktop would not share a screen")?;

    let cursor = Arc::new(Mutex::new(capture::CursorState::default()));
    let paused = Arc::new(AtomicBool::new(false));

    let (click_tx, click_rx) = mpsc::channel::<(String, bool)>();
    let click_devices = input::candidate_devices();
    let _click_handle = spawn_click_thread(click_tx, click_devices.0, config.click_idle_timeout_ms);

    let (control_tx, control_rx) = mpsc::channel::<Control>();
    // Control commands are read on stdin; they arrive from the app, never from a
    // terminal, so a parse failure is not worth a message.
    std::thread::spawn(move || {
        use std::io::BufRead;
        let stdin = std::io::stdin();
        for line in stdin.lock().lines() {
            let Ok(line) = line else { break };
            if let Some(control) = protocol::parse_control(&line) {
                if control_tx.send(control).is_err() {
                    break;
                }
            }
        }
        // EOF: the app exited, so stop rather than spin.
        let _ = control_tx.send(Control::Stop);
    });

    if capture_stream.cursor_is_metadata {
        events.emit(Event::Warning {
            message: "capturing with the pointer as data (it will be drawn by the editor)".into(),
        });
    }
    if let Some(notice) = &capture_stream.notice {
        events.emit(Event::Warning {
            message: notice.clone(),
        });
    }

    capture::run(
        capture_stream.fd,
        capture_stream.node_id,
        config.video_fd,
        cursor,
        click_rx,
        control_rx,
        paused,
        capture_stream.cursor_is_metadata,
        clicks_available,
        config.fps.clamp(1, 240),
    )
}

/// Finds pointer devices and reports whether clicks will be available. Failing
/// here is normal (no permission) and never fatal.
fn start_click_reader(config: &Config, events: &mut Emitter<std::io::Stdout>) -> bool {
    let (devices, error) = input::candidate_devices();
    if devices.is_empty() {
        let detail = error.unwrap_or_else(|| "no pointer devices found".to_string());
        events.emit(Event::Warning {
            message: format!("{detail}. {UDEV_HINT}"),
        });
        let _ = config;
        return false;
    }
    true
}

fn spawn_click_thread(
    tx: mpsc::Sender<(String, bool)>,
    devices: Vec<(std::path::PathBuf, evdev::raw_stream::RawDevice)>,
    idle_timeout_ms: u64,
) -> std::thread::JoinHandle<()> {
    // Run returns after spawning one reader thread per device; the threads
    // themselves live until the process exits (the app stops the helper at the
    // end of a recording). The former 2s/10min idle self-stop no longer
    // applies: with a blocking read there is no poll loop to time out.
    let idle = Duration::from_millis(idle_timeout_ms.max(500));
    std::thread::spawn(move || input::run(devices, tx, idle))
}
