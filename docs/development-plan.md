# ScreenArc - Development Plan

...

## Phase 1: Core Recording Engine & MVP

**Goal:** Establish a functional recording application that can capture the screen and mouse/click metadata.

*   **Tasks:**
    1.  **Project Setup:** Initialize Electron project with Vite, TypeScript, React, and TailwindCSS.
    2.  **Recording UI:** Create the initial control bar UI (`RecorderPage`) for initiating a recording.
    3.  **Screen Capture:**
        *   Implement basic screen recording by spawning `ffmpeg` as a child process.
        *   **Multi-Monitor Support:** Use Electron's `screen` module to detect all connected displays. Allow the user to select which monitor to record in "Full Screen" mode. The `ffmpeg` command is dynamically adjusted based on the selected display's position and size (`x11grab` on Linux, `gdigrab` on Windows, `avfoundation` index on macOS).
        *   The output is a raw video file (e.g., `.mp4`).
    4.  **Mouse/Click Tracking:**
        *   Integrate the `pynput` Python script (`tracker.py`).
        *   Create the logic in the Electron main process to spawn the script as a child process when recording starts.
        *   Capture the streamed JSON data from the script's `stdout` and save it to a separate metadata file (e.g., `recording.json`) synchronized with the video.
    5.  **System Tray Controls:** Implement the system tray icon with "Stop Recording" and "Cancel Recording" options.

*   **Outcome:** A user can record their screen, choosing a specific monitor if they have multiple, producing two files: a video file and a JSON file containing a timeline of mouse positions and click events.

...