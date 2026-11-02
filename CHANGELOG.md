## [1.17.10](https://github.com/getwithashish/DemoThat/compare/v1.17.9...v1.17.10) (2026-11-02)

### Bug Fixes

* **recording:** keep the screen file when FFmpeg is force-killed on webcam stop ([#36](https://github.com/getwithashish/DemoThat/issues/36)) ([7d5ee7e](https://github.com/getwithashish/DemoThat/commit/7d5ee7e47bdd2e0a06cc2c75b76e9948599eacd7))

## [1.17.9](https://github.com/getwithashish/DemoThat/compare/v1.17.8...v1.17.9) (2026-11-02)

### Bug Fixes

* **recording:** bound the FFmpeg stop and mux waits so Saving cannot hang ([#35](https://github.com/getwithashish/DemoThat/issues/35)) ([e12b689](https://github.com/getwithashish/DemoThat/commit/e12b6891b4dbbd53a8889160827cde000934875d))

## [1.17.8](https://github.com/getwithashish/DemoThat/compare/v1.17.7...v1.17.8) (2026-11-01)

### Bug Fixes

* **recording:** correct x264 deblock syntax for webcam encode ([#34](https://github.com/getwithashish/DemoThat/issues/34)) ([07ccb62](https://github.com/getwithashish/DemoThat/commit/07ccb625cd1cf20130e798cf372822cdba5c85fd))

## [1.17.7](https://github.com/getwithashish/DemoThat/compare/v1.17.6...v1.17.7) (2026-11-01)

### Bug Fixes

* **recorder:** tell the user when a Wayland recording captured no clicks ([#31](https://github.com/getwithashish/DemoThat/issues/31)) ([f138dba](https://github.com/getwithashish/DemoThat/commit/f138dba1aebf16da24e677dea634776c103d0152))

## [1.17.7](https://github.com/getwithashish/DemoThat/compare/v1.17.6...v1.17.7) (2026-11-01)

### Bug Fixes

* **recorder:** tell the user when a Wayland recording captured no clicks ([#31](https://github.com/getwithashish/DemoThat/issues/31)) ([f138dba](https://github.com/getwithashish/DemoThat/commit/f138dba1aebf16da24e677dea634776c103d0152))

## [1.17.7](https://github.com/getwithashish/DemoThat/compare/v1.17.6...v1.17.7) (2026-11-01)

### Bug Fixes

* **recorder:** tell the user when a Wayland recording captured no clicks ([#31](https://github.com/getwithashish/DemoThat/issues/31)) ([f138dba](https://github.com/getwithashish/DemoThat/commit/f138dba1aebf16da24e677dea634776c103d0152))

## [1.17.6](https://github.com/getwithashish/DemoThat/compare/v1.17.5...v1.17.6) (2026-11-01)

### Bug Fixes

* **wayland:** validate single-instance lock before relaunch ([#28](https://github.com/getwithashish/DemoThat/issues/28)) ([8f0649f](https://github.com/getwithashish/DemoThat/commit/8f0649f282e7706dd53ba6843cb907a5e09b1b3b))

## [1.17.5](https://github.com/getwithashish/DemoThat/compare/v1.17.4...v1.17.5) (2026-11-01)

### Bug Fixes

* **export:** stop treating the end-of-pass EPIPE as a failed export ([#27](https://github.com/getwithashish/DemoThat/issues/27)) ([4274088](https://github.com/getwithashish/DemoThat/commit/42740883d2112ad4bdba8d839d676e9f5aa66919))
* **recording:** encode captures at CRF 18 with deblocking and AQ ([#25](https://github.com/getwithashish/DemoThat/issues/25)) ([36b9292](https://github.com/getwithashish/DemoThat/commit/36b92924c1f8b800a7f42f97aca33e590501fec3))

## [1.17.4](https://github.com/getwithashish/DemoThat/compare/v1.17.3...v1.17.4) (2026-10-29)

### Bug Fixes

* **export:** render cloud intermediates at source size so the AI model runs ([#24](https://github.com/getwithashish/DemoThat/issues/24)) ([9623f69](https://github.com/getwithashish/DemoThat/commit/9623f69a6d96bb6f066c7b4262f5fe526c2d40e4))

## [1.17.3](https://github.com/getwithashish/DemoThat/compare/v1.17.2...v1.17.3) (2026-10-29)

### Bug Fixes

* **export:** complete single-plan uploads before starting cloud jobs ([#23](https://github.com/getwithashish/DemoThat/issues/23)) ([33eb171](https://github.com/getwithashish/DemoThat/commit/33eb171a649889422fc864ba553ca3859ba50246))

## [1.17.2](https://github.com/getwithashish/DemoThat/compare/v1.17.1...v1.17.2) (2026-10-29)

### Bug Fixes

* **export:** create intermediate dir before cloud-upscale render ([#22](https://github.com/getwithashish/DemoThat/issues/22)) ([19a56b7](https://github.com/getwithashish/DemoThat/commit/19a56b7c79af7ec2b37c10d89699cb675618d929))

## [1.17.1](https://github.com/getwithashish/DemoThat/compare/v1.17.0...v1.17.1) (2026-10-29)

### Bug Fixes

* **purchase:** hide bought pro pack, align export gate, retry auto-activation ([#21](https://github.com/getwithashish/DemoThat/issues/21)) ([b2593b1](https://github.com/getwithashish/DemoThat/commit/b2593b1e425e996a4a586242a392c6f95bbb7a8c))

## [1.17.0](https://github.com/getwithashish/DemoThat/compare/v1.16.0...v1.17.0) (2026-10-29)

### Features

* **pricing:** drop hardcoded credit packs; API is the only source ([#20](https://github.com/getwithashish/DemoThat/issues/20)) ([4630154](https://github.com/getwithashish/DemoThat/commit/46301546c5c2da6e34e652e830edbfca8845c78f))

## [1.16.0](https://github.com/getwithashish/DemoThat/compare/v1.15.1...v1.16.0) (2026-10-29)

### Features

* **pricing:** prefer API credit packs, hardcode only as offline fallback ([#19](https://github.com/getwithashish/DemoThat/issues/19)) ([a50e588](https://github.com/getwithashish/DemoThat/commit/a50e588ea7c95f4bddb4589af73afb726ba16e19))

## [1.15.1](https://github.com/getwithashish/DemoThat/compare/v1.15.0...v1.15.1) (2026-10-29)

### Bug Fixes

* **purchase:** surface the error when Get Pro / checkout start fails ([#18](https://github.com/getwithashish/DemoThat/issues/18)) ([b167490](https://github.com/getwithashish/DemoThat/commit/b167490f200f9021ce69da1db7bfee3a04bbe1b6))

## [1.15.0](https://github.com/getwithashish/DemoThat/compare/v1.14.4...v1.15.0) (2026-10-29)

### Features

* **config:** bake API base URL from env (dev .env + CI secret) ([#17](https://github.com/getwithashish/DemoThat/issues/17)) ([4c16633](https://github.com/getwithashish/DemoThat/commit/4c16633f7c1f1c7dfafb931b211e4c78d1119dba))

## [1.14.4](https://github.com/getwithashish/DemoThat/compare/v1.14.3...v1.14.4) (2026-10-29)

### Bug Fixes

* **editor:** load cursor theme by actual filename on case-sensitive filesystems ([#16](https://github.com/getwithashish/DemoThat/issues/16)) ([6d01b2e](https://github.com/getwithashish/DemoThat/commit/6d01b2e19dd9621ff5a67d52d045893760fa1175))

## [1.14.3](https://github.com/getwithashish/DemoThat/compare/v1.14.2...v1.14.3) (2026-10-29)

### Bug Fixes

* **editor:** real theme-pack cursor icons on Linux; no false Pro on same-res export ([#15](https://github.com/getwithashish/DemoThat/issues/15)) ([4aaa173](https://github.com/getwithashish/DemoThat/commit/4aaa1739ac369d67e669d8b4facad61ad78c6def))

## [1.14.2](https://github.com/getwithashish/DemoThat/compare/v1.14.1...v1.14.2) (2026-10-29)

### Bug Fixes

* **editor:** draw the cursor while the preview is playing ([#14](https://github.com/getwithashish/DemoThat/issues/14)) ([0ec7dca](https://github.com/getwithashish/DemoThat/commit/0ec7dca9ed32d76bc1f22b38dbe8a6896a18b1f5))

## [1.14.1](https://github.com/getwithashish/DemoThat/compare/v1.14.0...v1.14.1) (2026-10-29)

### Bug Fixes

* **editor:** cursor visible through playback, selectable pointer icons, no charge for same-res export ([#13](https://github.com/getwithashish/DemoThat/issues/13)) ([6c5b784](https://github.com/getwithashish/DemoThat/commit/6c5b784081c736ee4e6c69c3adb3ec40eaee9cf8))

## [1.14.0](https://github.com/getwithashish/DemoThat/compare/v1.13.0...v1.14.0) (2026-10-29)

### Features

* **editor:** Linux cursor size/theme, bundled default click sound, fix 2K/4K/8K credit quotes ([#12](https://github.com/getwithashish/DemoThat/issues/12)) ([bfdd42a](https://github.com/getwithashish/DemoThat/commit/bfdd42af6b56e6049061a7e8d4a859f91aa101ba))

## [1.13.0](https://github.com/getwithashish/DemoThat/compare/v1.12.3...v1.13.0) (2026-10-29)

### Features

* **editor:** delete any selected item, remove sidebar effects quick-add, preview diagnostics + faststart + ranged media protocol ([#11](https://github.com/getwithashish/DemoThat/issues/11)) ([2422400](https://github.com/getwithashish/DemoThat/commit/242240029f46ca59674465b8f3fafb418cd59948))

## [1.12.3](https://github.com/getwithashish/DemoThat/compare/v1.12.2...v1.12.3) (2026-10-28)

### Bug Fixes

* **editor:** user-initiated payment dialog, no vertical tab scroll, Effects button, wider transport, mic-mux hang ([#10](https://github.com/getwithashish/DemoThat/issues/10)) ([3d81b3a](https://github.com/getwithashish/DemoThat/commit/3d81b3ad2a48b1c8e65b42acd8c8fe7c8c40fa96))

## [1.12.2](https://github.com/getwithashish/DemoThat/compare/v1.12.1...v1.12.2) (2026-10-28)

### Bug Fixes

* **editor:** blank preview, clipped device dropdowns, resizable inspector, Pro checkout ([#9](https://github.com/getwithashish/DemoThat/issues/9)) ([429fa13](https://github.com/getwithashish/DemoThat/commit/429fa134b57769c2d69aa67d1690472e450c166f))

## [1.12.1](https://github.com/getwithashish/DemoThat/compare/v1.12.0...v1.12.1) (2026-10-27)

### Bug Fixes

* **billing:** name the live-mode Dodo products ([#5](https://github.com/getwithashish/DemoThat/issues/5)) ([b53f2e9](https://github.com/getwithashish/DemoThat/commit/b53f2e9962003d864104d3289d3c2e23f777904f))

## [1.12.0](https://github.com/getwithashish/DemoThat/compare/v1.11.0...v1.12.0) (2026-10-27)

### Features

* **license:** fetch the signing key set instead of embedding it ([#3](https://github.com/getwithashish/DemoThat/issues/3)) ([164211a](https://github.com/getwithashish/DemoThat/commit/164211a28c597704048f6945e2ab303a86bff72b))

## [1.11.0](https://github.com/getwithashish/DemoThat/compare/v1.10.0...v1.11.0) (2026-10-26)

### Features

* **packs:** the $3 entry pack, and top-ups only once Pro is held ([#2](https://github.com/getwithashish/DemoThat/issues/2)) ([e2927e1](https://github.com/getwithashish/DemoThat/commit/e2927e15dfa9eeb30274c572d4010ce217eed1df))

## [1.10.0](https://github.com/getwithashish/DemoThat/compare/v1.9.0...v1.10.0) (2026-10-26)

### Features

* **editor:** instant publishing, shared links and a captions panel ([#1](https://github.com/getwithashish/DemoThat/issues/1)) ([9b61b53](https://github.com/getwithashish/DemoThat/commit/9b61b53f76978e832366d28a95f12f0dcc939841))

## [1.9.0](https://github.com/getwithashish/DemoThat/compare/v1.8.0...v1.9.0) (2026-10-22)

### Features

* **checkout:** render the catalogue from GET /v1/products ([34f7560](https://github.com/getwithashish/DemoThat/commit/34f7560156ef378070602a34994d7c52fada3ff8))
* **cursor:** path smoothing and optics-based motion blur ([77a83ad](https://github.com/getwithashish/DemoThat/commit/77a83adf4d92fe4c9aa00d27d103489ef4c2deea))
* **linux:** record natively on Wayland ([687e50c](https://github.com/getwithashish/DemoThat/commit/687e50c7ec4a53ce8bb6a407ca968b34c54a8bee))
* **wayland:** capture and cursor telemetry through the native helper ([4a10815](https://github.com/getwithashish/DemoThat/commit/4a10815307583ef76fba0e68d0cdd488a11000f7))
* **wayland:** draw the user's real cursor, and ask a desktop only once ([e9860c8](https://github.com/getwithashish/DemoThat/commit/e9860c8c015259bf8e26b1dc5530d141f6c7b252))
* **wayland:** native cursor helper for pointer telemetry ([8fc6265](https://github.com/getwithashish/DemoThat/commit/8fc626512d096183503584a7b1c86ef92741d324))

## [1.8.0](https://github.com/getwithashish/DemoThat/compare/v1.7.0...v1.8.0) (2026-10-16)

### Features

* **cloud:** consent, progress, cancel and out-of-credits dialogs ([e143cd5](https://github.com/getwithashish/DemoThat/commit/e143cd5945b68964863bb02d9e591289436e8899))
* **cloud:** job client and orchestrator against contract 2.0.0 ([22311db](https://github.com/getwithashish/DemoThat/commit/22311db3b43437bd162a75509ae33cb6e2ac1d43))
* **cloud:** wire the export modal to the contract and add the mock API ([ae40550](https://github.com/getwithashish/DemoThat/commit/ae40550bafb61e924d791ad77649ea10b40bda0e))
* **license:** activation, offline entitlement and the credit capsule ([10d7b90](https://github.com/getwithashish/DemoThat/commit/10d7b900a4860f5ea278596192de2d6c6d43103b))
* **purchase:** checkout, poll and credit count-up ([5bb9c5e](https://github.com/getwithashish/DemoThat/commit/5bb9c5e74428a714e99eda1bc8978c0d413fca81))

## [1.7.0](https://github.com/getwithashish/DemoThat/compare/v1.6.0...v1.7.0) (2026-10-15)

### Features

* cloud upscale client (upload, poll, download, cancel) ([2c28d63](https://github.com/getwithashish/DemoThat/commit/2c28d63ad558b0194367126bc7d072dc2d1855e6))
* cloud upscale contract, mock server and scale planning ([cfb0973](https://github.com/getwithashish/DemoThat/commit/cfb0973e17486251fef8d05ac4211aad602e1ecb))
* render an intermediate locally and upscale it in the cloud ([b602951](https://github.com/getwithashish/DemoThat/commit/b602951b8ef9b63859a73f571bda9992811b12db))
* start an AI (cloud) export from the modal ([c969aaa](https://github.com/getwithashish/DemoThat/commit/c969aaac0dd7c0fa6d7a6d55fb86340557eba607))

## [1.6.0](https://github.com/getwithashish/DemoThat/compare/v1.5.0...v1.6.0) (2026-10-15)

### Features

* gate upscaling exports behind Pro and estimate render times ([8d959ed](https://github.com/getwithashish/DemoThat/commit/8d959ed47a1d93f81777caeb9530edd8020cbe77))
* one guard against losing work on open, close and quit ([6637241](https://github.com/getwithashish/DemoThat/commit/6637241e5d6e4c1d5b5c9a9103717452c6efb328))
* project menu in the editor header ([87950e7](https://github.com/getwithashish/DemoThat/commit/87950e7edb4b6ecd59cbe341643018a65b14b90a))
* save a copy, rename in place, and a quiet open-recent path ([9f1a95d](https://github.com/getwithashish/DemoThat/commit/9f1a95dba92fa43cd4fdb5e70a9579833d8cb7d9))
* show save status in the editor header ([44f8eba](https://github.com/getwithashish/DemoThat/commit/44f8eba78b5cefb8d820f64250407e3d0d96b847))
* surface the crash-recovery copy in Open recent ([b2d3920](https://github.com/getwithashish/DemoThat/commit/b2d39209c719beb010dcfb53a3783ecb54bed354))

### Bug Fixes

* drop the old path from Open recent after a rename ([064573b](https://github.com/getwithashish/DemoThat/commit/064573ba0605872ea53f987438c70bed3a200559))
* size the recorder window to its dock and make it truly transparent ([6262713](https://github.com/getwithashish/DemoThat/commit/62627134c8e9e16f6728a5f4d635e9769bd0d85f))
* stop losing edits made while a save is in flight ([40872f7](https://github.com/getwithashish/DemoThat/commit/40872f719ac310746f740d4c00cda6d1b81b5803))

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
