# ScreenArc - Cinematic Screen Recording & Editing Studio

![ScreenArc Banner](https://raw.githubusercontent.com/tamnguyenvan/screenarc/main/docs/assets/banner.png?raw=true)

<div align="center">
  <img src="https://img.shields.io/github/v/release/tamnguyenvan/screenarc?style=for-the-badge" alt="Latest Release" />
  <img src="https://img.shields.io/github/license/tamnguyenvan/screenarc?style=for-the-badge" alt="License" />
  <img src="https://img.shields.io/github/downloads/tamnguyenvan/screenarc/total?style=for-the-badge&color=green" alt="Total Downloads" />
</div>

<p align="center">
  <a href="#-overview">Overview</a> •
  <a href="#-key-features">Key Features</a> •
  <a href="#-installation">Installation</a> •
  <a href="#-how-to-use">How To Use</a> •
  <a href="#-technologies-used">Tech Stack</a> •
  <a href="#-contributing">Contributing</a>
</p>

## ✨ Overview

ScreenArc is a powerful, cross-platform screen recording and editing application designed to help you create professional, engaging videos with minimal effort. It's the perfect tool for developers, educators, and content creators who need to produce high-quality tutorials, demos, and presentations.

The core philosophy of ScreenArc is to **automate the tedious parts of video editing**. It intelligently tracks your mouse movements and clicks, automatically creating smooth, cinematic pan-and-zoom effects that keep your audience focused on the action.

## 🚀 Key Features

*   **🎬 High-Quality Recording:**
    *   Capture your entire screen, a specific application window, or a custom-defined area.
    *   Support for multi-monitor setups.
    *   Simultaneously record your webcam as an overlay.

*   **🖱️ Cinematic Mouse Tracking:**
    *   The cornerstone feature: automatically detects mouse clicks and creates smooth pan-and-zoom animations to highlight areas of action. No manual keyframing needed!

*   **✂️ Powerful & Intuitive Editor:**
    *   **Frame Customization:** Easily change aspect ratios (16:9, 9:16, 1:1), set beautiful backgrounds (colors, gradients, or wallpapers), and adjust padding, borders, and shadows.
    *   **Preset System:** Save your favorite styles as presets and apply them instantly to new projects.
    *   **Timeline Editing:** A visual timeline to add, edit, or remove auto-generated effects. Easily "cut" mistakes or unwanted sections.

*   **📤 Flexible Export Options:**
    *   Export your final videos in standard formats like **MP4** and **GIF**.
    *   Control output settings like resolution (up to 2K) and frame rate.

## 📦 Installation

Download the latest version for your operating system from the [**Releases Page**](https://github.com/tamnguyenvan/screenarc/releases/latest).

### 🐧 Linux (Ubuntu/Debian-based, Fedora/RHEL-based)

> **⚠️ Note:** ScreenArc currently only supports X11 display server and does not work on Wayland. 
> 
> 🔍 To check your display server, run:
> ```bash
> echo $XDG_SESSION_TYPE
> ```
> 
> ⚠️ If it shows `wayland`, you'll need to switch to X11 in your login screen or display manager settings. (Look for a gear/cog icon ⚙️ during login to change the session type)

1.  Download the `.AppImage` file (e.g., `ScreenArc-x.x.x.AppImage`).
2.  Make the file executable:
    ```bash
    chmod +x ScreenArc-*.AppImage
    ```
3.  Double-click the file to start the application or run it from the terminal:
    ```bash
    ./ScreenArc-*.AppImage
    ```
## 💡 Tips

- **Prefer the macOS cursor style?** If you'd like to use the macOS cursor theme, you can install it with these commands:
  ```bash
  # 1. Download the macOS cursor theme: https://www.gnome-look.org/p/1408466

  # 2. Extract the theme
  tar -xvf macOS.tar 

  # 3. Move the theme to the icons directory
  mv macOS* ~/.icons/
  ```
  Then apply it through your system settings or using GNOME Tweaks.

### Other Linux distributions
Please check the [Development Setup](#development-setup) section for building from source.

### 🪟 Windows

> **⚠️ Windows Security Notice**
> 
> We're sorry for the extra steps! Since we're a small project, we can't afford code signing certificates yet. Here's what to expect:
> 
> 1. After downloading the installer, your browser might show a warning. Click "Keep" or "Keep anyway" to save the file.
> 2. When running the installer, Windows may show a "Windows protected your PC" warning. To proceed:
>    1. Click "More info" 
>    2. Click "Run anyway" 

> 🔒 Your security is important to us. You can verify the source code in our GitHub repository before installing.

1.  Download the `ScreenArc-x.x.x-Setup.exe` installer.
2.  Run the installer and follow the on-screen instructions.

### 🍏 macOS

*   Coming soon! Builds for macOS are planned for a future release.

## 📖 How To Use

1.  **Record:**
    *   Launch ScreenArc.
    *   Choose your recording source: Full Screen, Area, or a specific Window.
    *   Select a display to record if you have multiple monitors.
    *   Optionally, enable your webcam.
    *   Click the record button. After a short countdown, the recording will begin.
    *   To stop, click the ScreenArc icon in your system tray and select "Stop Recording".

2.  **Edit:**
    *   The editor will automatically open with your new recording.
    *   Use the right-hand **Side Panel** to adjust the background, padding, shadows, and other frame styles.
    *   Use the **Timeline** at the bottom to review the recording. Click and drag the automatically generated "Zoom" and "Cut" regions to adjust their timing and duration.
    *   Click the **"Presets"** button to save your current style for future use.

3.  **Export:**
    *   Click the **"Export"** button in the top-right corner.
    *   Choose your desired format (MP4/GIF), resolution, and output location.
    *   Click "Start Export" and let ScreenArc do the rest!

## 🛠️ Technologies Used

*   **Core:** [Electron](https://www.electronjs.org/), [Vite](https://vitejs.dev/), [TypeScript](https://www.typescriptlang.org/)
*   **UI:** [React](https://reactjs.org/), [TailwindCSS](https://tailwindcss.com/)
*   **State Management:** [Zustand](https://github.com/pmndrs/zustand)
*   **Video/System:** [Node.js](https://nodejs.org/), [FFmpeg](https://ffmpeg.org/)
*   **Packaging:** [Electron Builder](https://www.electron.build/)

## 🤝 Contributing

Contributions are welcome! If you have ideas for new features, bug fixes, or improvements, please feel free to open an issue or submit a pull request.

### 🛠️ Development Setup

### Prerequisites

#### 🐧 Linux
- Make sure you're using X11 (not Wayland) as your display server. Check with:
  ```bash
  echo $XDG_SESSION_TYPE
  ```
  If it shows `wayland`, switch to X11 in your login screen settings.

#### 🪟 Windows
1. **Install Build Tools**:
   - Download [Build Tools for Visual Studio 2022](https://visualstudio.microsoft.com/visual-cpp-build-tools/)
   - Run the installer and select "Desktop development with C++" workload
   - In the Installation details (right panel), ensure these are checked:
     - MSVC v143 - VS 2022 C++ x64/x86 build tools
     - Windows 10/11 SDK
     - C++ CMake tools for Windows
   - Click Install and wait for completion

2. **Install Python 3.8 (other versions may work but are not tested)**:
   - Download from [Python 3.8.x](https://www.python.org/downloads/release/python-3810/)
   - During installation, check "Add Python 3.8 to PATH"
   - Verify installation by running `python --version` in a new terminal

#### Setup Instructions

1. **Clone the repository**:
    ```bash
    git clone https://github.com/tamnguyenvan/screenarc.git
    cd screenarc
    ```

2. **Install dependencies**:
    ```bash
    npm install
    ```

3. **Set up FFmpeg**:
    
    **For Linux**:
    ```bash
    # Create binaries directory if it doesn't exist
    mkdir -p binaries/linux
    
    # Download FFmpeg static binary
    wget https://github.com/tamnguyenvan/screenarc-assets/releases/download/v0.0.1/ffmpeg -O binaries/linux/ffmpeg
    
    # Make FFmpeg executable
    chmod +x binaries/linux/ffmpeg
    ```

    **For Windows (PowerShell)**:
    ```powershell
    # Create binaries directory if it doesn't exist
    New-Item -ItemType Directory -Force -Path "binaries\windows"
    
    # Download FFmpeg static binary
    Invoke-WebRequest -Uri "https://github.com/tamnguyenvan/screenarc-assets/releases/download/v0.0.1/ffmpeg.exe" -OutFile "binaries\windows\ffmpeg.exe"

    **For macOS**:
    ```bash
    # Create binaries directory if it doesn't exist
    mkdir -p binaries/darwin
    
    # Download FFmpeg static binary
    wget https://github.com/tamnguyenvan/screenarc-assets/releases/download/v0.0.1/ffmpeg -O binaries/darwin/ffmpeg
    
    # Make FFmpeg executable
    chmod +x binaries/darwin/ffmpeg
    ```
    ```

4. **Run the development server**:
    ```bash
    npm run dev
    ```

5. **Build the application (Optional)**:
    ```bash
    # For Linux
    npm run dist:appimage

    # For Windows
    npm run dist:win
    ```

## 📜 License

This project is licensed under the [AGPL-3.0 License](LICENSE).
