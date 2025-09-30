```
.
├── dist-electron
│   ├── main.js
│   └── preload.mjs
├── docs
│   ├── development-plan.md
│   ├── high-level-goals.md
│   ├── project_structure.md
│   ├── tech-stacks.md
│   └── user-flow.md
├── electron
│   ├── electron-env.d.ts
│   ├── main.ts
│   └── preload.ts
├── index.html
├── package.json
├── public
│   ├── countdown
│   │   ├── index.html
│   │   └── ...
│   ├── saving
│   │   ├── index.html
│   │   └── style.css
│   ├── screenarc-appicon.png
│   └── wallpapers
│       ├── images
│       └── thumbnails
├── python
│   └── tracker.py
├── src
│   ├── App.tsx
│   ├── components
│   │   ├── editor
│   │   │   ├── ExportButton.tsx
│   │   │   ├── ExportModal.tsx
│   │   │   ├── ExportProgressOverlay.tsx
│   │   │   ├── Preview.tsx
│   │   │   ├── PreviewControls.tsx
│   │   │   ├── RegionSettingsPanel.tsx
│   │   │   ├── SidePanel.tsx
│   │   │   └── Timeline.tsx
│   │   └── ui
│   │   │   ├── button.tsx
│   │   │   ├── button-variants.ts
│   │   │   └── tooltip.tsx
│   ├── custom.d.ts
│   ├── index.css
│   ├── lib
│   │   ├── constants.ts
│   │   ├── transform.ts
│   │   └── utils.ts
│   ├── main.tsx
│   ├── pages
│   │   ├── EditorPage.tsx
│   │   ├── RecorderPage.tsx
│   │   └── RendererPage.tsx
│   ├── store
│   │   └── editorStore.ts
│   └── vite-env.d.ts
├── tsconfig.json
├── tsconfig.node.json
└── vite.config.ts
```