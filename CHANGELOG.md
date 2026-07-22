## [1.4.1](https://github.com/tamnguyenvan/screenarc/compare/v1.4.0...v1.4.1) (2026-07-22)


### Bug Fixes

* overwrite stale recording outputs ([fc40c6a](https://github.com/tamnguyenvan/screenarc/commit/fc40c6af1da4de44f55a718b97b843ecd4ac9bd5))

# [1.4.0](https://github.com/tamnguyenvan/screenarc/compare/v1.3.0...v1.4.0) (2026-04-26)


### Bug Fixes

* **macos:** replace iohook-macos with Electron screen API polling ([ecbc747](https://github.com/tamnguyenvan/screenarc/commit/ecbc7476b2db1295cce230769fbe15372a107ee6))
* **macos:** robustness and permission fixes for system audio ([c2524e0](https://github.com/tamnguyenvan/screenarc/commit/c2524e07e18a36c066108628816977e5ff9ad368))


### Features

* **macos:** renderer-side screen capture (ScreenCaptureKit) for macOS 15 ([2d7e719](https://github.com/tamnguyenvan/screenarc/commit/2d7e719d76d9be696dbf0691cd75105555a2e6ec))
* **mux:** add buildMacMuxArgs for WebM → MP4 transcoding ([be5406d](https://github.com/tamnguyenvan/screenarc/commit/be5406db41362f09344647ba5a293c0c2126ca65))

# [1.3.0](https://github.com/tamnguyenvan/screenarc/compare/v1.2.7...v1.3.0) (2026-04-26)


### Bug Fixes

* **macos:** harden system audio recording ([9ba8ad4](https://github.com/tamnguyenvan/screenarc/commit/9ba8ad4b18280192e8548c92834754e97f9f0af7))


### Features

* **macos:** record system audio into recordings ([e59b6b0](https://github.com/tamnguyenvan/screenarc/commit/e59b6b0550dc99f865344caf4be4845f9118fa45)), closes [#145](https://github.com/tamnguyenvan/screenarc/issues/145)

## [1.2.7](https://github.com/tamnguyenvan/screenarc/compare/v1.2.6...v1.2.7) (2026-04-08)


### Bug Fixes

* override package type to commonjs for macOS universal builds ([c02573b](https://github.com/tamnguyenvan/screenarc/commit/c02573b760073a70567dc8c5bcf7eeee6b415ee1)), closes [#153](https://github.com/tamnguyenvan/screenarc/issues/153)

## [1.2.6](https://github.com/tamnguyenvan/screenarc/compare/v1.2.5...v1.2.6) (2026-03-06)


### Bug Fixes

* resolve dev setup failures on macOS with Node.js 24 ([7084dfa](https://github.com/tamnguyenvan/screenarc/commit/7084dfae13d01806d7f0aa8747a3e92e64cbae2f)), closes [#150](https://github.com/tamnguyenvan/screenarc/issues/150)

## [1.2.5](https://github.com/tamnguyenvan/screenarc/compare/v1.2.4...v1.2.5) (2026-03-03)


### Bug Fixes

* remove duplicate code from bad merge in recording-manager, desktop handler, and transform ([493609c](https://github.com/tamnguyenvan/screenarc/commit/493609c65752de0f8ddb735b7731b792c1b736d9)), closes [#142](https://github.com/tamnguyenvan/screenarc/issues/142) [#146](https://github.com/tamnguyenvan/screenarc/issues/146)

## [1.2.4](https://github.com/tamnguyenvan/screenarc/compare/v1.2.3...v1.2.4) (2026-03-03)


### Bug Fixes

* externalize native modules for proper runtime loading ([23678c9](https://github.com/tamnguyenvan/screenarc/commit/23678c9635568e5e3255a7d5b9cce6075382933e)), closes [#137](https://github.com/tamnguyenvan/screenarc/issues/137)

## [1.2.3](https://github.com/tamnguyenvan/screenarc/compare/v1.2.2...v1.2.3) (2026-03-03)


### Bug Fixes

* account for display scaleFactor on Windows ([769453a](https://github.com/tamnguyenvan/screenarc/commit/769453a1cf921dd1d3ba8cd77afc91a956b0311a)), closes [#135](https://github.com/tamnguyenvan/screenarc/issues/135)
* improve export progress display to show < 1% initially ([e6edb1a](https://github.com/tamnguyenvan/screenarc/commit/e6edb1ae0a558cc65a820ea95c6de3d3acfb26c1)), closes [#133](https://github.com/tamnguyenvan/screenarc/issues/133)
* output electron main process as .cjs to fix macOS ESM error ([ab1e0c3](https://github.com/tamnguyenvan/screenarc/commit/ab1e0c307653134102c11b525e5df5ecdf31bfb7)), closes [#138](https://github.com/tamnguyenvan/screenarc/issues/138) [#131](https://github.com/tamnguyenvan/screenarc/issues/131)
* route audio to screen.mp4 instead of webcam.mp4 ([3e15a7f](https://github.com/tamnguyenvan/screenarc/commit/3e15a7fd7467178fe51831eda695de1d11b6dcb4)), closes [#130](https://github.com/tamnguyenvan/screenarc/issues/130)
* smooth pan transition during zoom-in phase ([4a6839f](https://github.com/tamnguyenvan/screenarc/commit/4a6839fb75d7bafefc8cbee97fb4e1e7ff9eb26b)), closes [#132](https://github.com/tamnguyenvan/screenarc/issues/132)

## [1.2.2](https://github.com/tamnguyenvan/screenarc/compare/v1.2.1...v1.2.2) (2025-12-23)


### Bug Fixes

* **export:** Resolve hung export process by adding timeout to seekPromise ([1fbdee9](https://github.com/tamnguyenvan/screenarc/commit/1fbdee9f6d48018285bc6c0fcf173eb75d18eb2d))

## [1.2.1](https://github.com/tamnguyenvan/screenarc/compare/v1.2.0...v1.2.1) (2025-10-17)


### Bug Fixes

* zoom level unused ([346e25e](https://github.com/tamnguyenvan/screenarc/commit/346e25e69c88f5c61db4e59ca16f56e0208ad6c4))

# [1.2.0](https://github.com/tamnguyenvan/screenarc/compare/v1.1.0...v1.2.0) (2025-10-17)


### Bug Fixes

* click animation delay ([f0943bd](https://github.com/tamnguyenvan/screenarc/commit/f0943bd20b3364d2f78350fc40cc2a7095dc12f3))
* collapse state shift ([cdcc198](https://github.com/tamnguyenvan/screenarc/commit/cdcc198dda01aed197337aa2c7c237215709cf6e))
* cursor animation on Windows ([3679db6](https://github.com/tamnguyenvan/screenarc/commit/3679db619cc3e1fd7d71530509b02023d4a1d533))
* minimize recorder window instead of hiding it ([8015a2f](https://github.com/tamnguyenvan/screenarc/commit/8015a2f6204b32ebe45c3744a8c39af4a398e270))
* mouse events not fired when cursor is stationary on macOS and Windows ([6899ebb](https://github.com/tamnguyenvan/screenarc/commit/6899ebbb16e93100804ac6e781ed0865691515d3))
* region blocks jitter when dragging ([0191e69](https://github.com/tamnguyenvan/screenarc/commit/0191e69584a0207736cb3ae3a901ae7d4ce20da6))
* remove custom app theme ([8958178](https://github.com/tamnguyenvan/screenarc/commit/8958178bdf87ab3203e3367544ff4c77efa90dfe))


### Features

* hide inactive cursor in preview fullscreen ([3b3ac21](https://github.com/tamnguyenvan/screenarc/commit/3b3ac217aeb606f16b30ddd4acb0de4f0a2c9de1))
* implement cursor scale animation and toggle cursor ([3487d8a](https://github.com/tamnguyenvan/screenarc/commit/3487d8a6082b4a77bdaefdbabeb197c704583ef2))
* improve auto zoom animation ([f2a74d3](https://github.com/tamnguyenvan/screenarc/commit/f2a74d361c5d184cf4ae34bcd5017a2746c82ce7))
* smart webcam preview position ([fe02581](https://github.com/tamnguyenvan/screenarc/commit/fe02581224c1fa338584e2b3ea415b21822c33e3))


### Performance Improvements

* use seek-driven approach to improve export perf ([4cbe85d](https://github.com/tamnguyenvan/screenarc/commit/4cbe85d7c382b33d57d870fa11f8870c82dd71ed))

# [1.1.0](https://github.com/tamnguyenvan/screenarc/compare/v1.0.15...v1.1.0) (2025-10-16)


### Bug Fixes

* bibata theme on macos ([0813f75](https://github.com/tamnguyenvan/screenarc/commit/0813f7513b2ed866c90561e6f93d5d91d2872e45))
* block camera & audio settings when inputs are disabled ([ddabaea](https://github.com/tamnguyenvan/screenarc/commit/ddabaea57cc6a9d2fcb7e207996fc38a9b1ac3cf))
* cancel export ([f10934c](https://github.com/tamnguyenvan/screenarc/commit/f10934cf2e4f5e10fe7a60b44673e1bcf2e0504a))
* context menu not showing when right-clicking ([f6e6866](https://github.com/tamnguyenvan/screenarc/commit/f6e6866efbfc59347bd10dcf0f4fd6906e5a09e0))
* cursor click animation and rendering out of sync with frame ([a246922](https://github.com/tamnguyenvan/screenarc/commit/a246922116560f8e7d53fadbca85794238f05549))
* default cursor theme name ([83fc53d](https://github.com/tamnguyenvan/screenarc/commit/83fc53dfda318e1f47a23ec4c8e6dadc1afe0bb7))
* macos default cursor theme ([1cc4386](https://github.com/tamnguyenvan/screenarc/commit/1cc43866291638daad8a49c55d2da50b492bb69c))
* minor change in collapse ui ([5b5153d](https://github.com/tamnguyenvan/screenarc/commit/5b5153d1a1010e8f8c0bc2b1476e03b0cf81daa3))
* mouse events not firing on macOS ([5becd1f](https://github.com/tamnguyenvan/screenarc/commit/5becd1ff5e3f6fc3d5c2261ab3a826c09ad09eaa))
* nested buttons issue in collapse component ([50a0e96](https://github.com/tamnguyenvan/screenarc/commit/50a0e963ef0b9d802d6db3f2334c52806d551e2c))
* prevent mouse overflow recording geometry ([3e542c4](https://github.com/tamnguyenvan/screenarc/commit/3e542c44dccfcd0c3e72ae67ea9eef20670326e1))
* Preview stale after cursor theme & size change ([26c58a7](https://github.com/tamnguyenvan/screenarc/commit/26c58a718c9468da6c67bae378a1394017e65aa0))
* resolve prettier conflict in changelog generated by semantic-release ([d49ccc3](https://github.com/tamnguyenvan/screenarc/commit/d49ccc30dc6277707ec5209f41446fdf54c1c227))
* selection area not drawing on Windows ([b42ce23](https://github.com/tamnguyenvan/screenarc/commit/b42ce23f7904f074463a3625efe1f23578967da1))
* **sidepanel:** prevent tab from shifting when toggling fullscreen ([806e99a](https://github.com/tamnguyenvan/screenarc/commit/806e99a5036a124c37c5267c47f53dbd733ace66))
* window controls ui ([2611165](https://github.com/tamnguyenvan/screenarc/commit/26111658b4b1d181efffa83c3c1e24673aaf7de0))


### Features

* add pan video ([d362da4](https://github.com/tamnguyenvan/screenarc/commit/d362da4273e1d8f7672eb74bd90439750f3ef604))
* implement cursor drop shadow ([9fbaf9a](https://github.com/tamnguyenvan/screenarc/commit/9fbaf9a05fa46e525dcc13dd9289514dd8f1da8b))
* implement factory reset for all settings in sidepanel ([74470a1](https://github.com/tamnguyenvan/screenarc/commit/74470a153f9ce94009c64b5eda1090890b9af6b0))

## [1.0.15](https://github.com/tamnguyenvan/screenarc/compare/v1.0.14...v1.0.15) (2025-10-14)


### Bug Fixes

* export video issue ([4cc5bfa](https://github.com/tamnguyenvan/screenarc/commit/4cc5bfac2f18c14d57d133473e2b4deb12cc77e4))

## [1.0.14](https://github.com/tamnguyenvan/screenarc/compare/v1.0.13...v1.0.14) (2025-10-14)


### Bug Fixes

* app icon ([e81844f](https://github.com/tamnguyenvan/screenarc/commit/e81844fe1173208058ac5aa34d430936ded4da62))
* debian icon ([ea6f2ef](https://github.com/tamnguyenvan/screenarc/commit/ea6f2ef68ad1e6abccccee13c1dab5fbfe43033d))

## [1.0.13](https://github.com/tamnguyenvan/screenarc/compare/v1.0.12...v1.0.13) (2025-10-14)


### Bug Fixes

* build .deb, .rpm & .zip for Linux ([4673f6b](https://github.com/tamnguyenvan/screenarc/commit/4673f6bffc858f62be3e4572c8cd57fb6dabcca6))

## [1.0.12](https://github.com/tamnguyenvan/screenarc/compare/v1.0.11...v1.0.12) (2025-10-14)


### Bug Fixes

* build .deb, .rpm & .zip for Linux ([7d38058](https://github.com/tamnguyenvan/screenarc/commit/7d38058677bc5ff48e6c5d45158a6273fd32892d))

# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Your new feature here.

### Changed

- An update to an existing feature.

### Fixed

- A bug fix.

## 1.1.2

### Fixed

- Fixed ci

## 1.1.1

### Fixed

- Export in production
