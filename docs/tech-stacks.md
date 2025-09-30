# ScreenArc - Technology Stack

This document outlines the primary technologies chosen for the development of ScreenArc. The stack is selected to facilitate rapid development, ensure cross-platform compatibility, and leverage the modern JavaScript/TypeScript ecosystem.

## Core Framework

*   **[Electron](https://www.electronjs.org/):** The foundation of our desktop application. It allows us to build a cross-platform app (Linux, Windows, macOS) using web technologies.
*   **[Vite](https://vitejs.dev/):** A next-generation frontend tooling that provides an extremely fast development server and optimized build process, configured for an Electron and TypeScript workflow.

## Language & UI

*   **[TypeScript](https://www.typescriptlang.org/):** Superset of JavaScript that adds static types. This is crucial for building a large, maintainable application by catching errors early and improving developer experience.
*   **[React](https://reactjs.org/):** A declarative UI library for building the user interface for both the recorder controls and the main editor studio.
*   **[TailwindCSS](https://tailwindcss.com/):** A utility-first CSS framework for rapidly building the custom user interface of the editor.

## State Management

*   **[Zustand](https://github.com/pmndrs/zustand):** A small, fast, and scalable state-management solution. Its hook-based API is used to manage the complex state of the editor (timeline position, frame styles, zoom/cut regions, etc.).

## Backend & System Interaction

*   **[Node.js](https://nodejs.org/):** The runtime for Electron's main process. Used for all system-level operations like file access, process management, and video processing orchestration.
*   **[FFmpeg](https://ffmpeg.org/) (via `child_process`):** The core video processing engine. It is spawned directly from Node.js for two key tasks:
    1.  **Recording:** Capturing the screen content using platform-specific inputs (e.g., `x11grab` on Linux).
    2.  **Exporting:** Encoding the final video by receiving a stream of raw pixel data from the render worker via `stdin`.
*   **[Python](https://www.python.org/) with `pynput`:**
    *   **Reasoning:** `pynput` provides a reliable, cross-platform solution for low-level mouse and keyboard event listening, which can be challenging to achieve robustly in Node.js alone.
    *   **Implementation:** A small Python script runs as a child process during recording. It monitors mouse movements and clicks, writing event data (position, timestamp, type) as JSON to `stdout`. The Electron main process captures this stream and saves it to a metadata file.

## Build & Packaging

*   **[Electron Builder](https://www.electron.build/):** A complete solution to package and build a ready-for-distribution Electron app with auto-update support.
