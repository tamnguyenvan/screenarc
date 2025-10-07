import React from 'react';

const ShortcutItem = ({ keys, description }: { keys: string[]; description: string }) => {
  return (
    <div className="flex items-center justify-between py-3">
      <p className="text-sm text-foreground">{description}</p>
      <div className="flex items-center gap-1.5">
        {keys.map((key, index) => (
          <React.Fragment key={key}>
            <kbd className="px-2 py-1 text-xs font-semibold text-muted-foreground bg-muted rounded-md border border-border">
              {key}
            </kbd>
            {index < keys.length - 1 && <span className="text-sm text-muted-foreground">+</span>}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
};

export function ShortcutsTab() {
  const shortcutCategories = [
    {
      title: 'Playback',
      shortcuts: [
        { keys: ['Space'], description: 'Play / Pause' },
        { keys: ['J'], description: 'Previous Frame' },
        { keys: ['K'], description: 'Next Frame' },
        { keys: ['←'], description: 'Seek Backward 1s' },
        { keys: ['→'], description: 'Seek Forward 1s' },
      ],
    },
    {
      title: 'Editing',
      shortcuts: [
        { keys: ['Cmd/Ctrl', 'Z'], description: 'Undo' },
        { keys: ['Cmd/Ctrl', 'Y'], description: 'Redo' },
        { keys: ['Cmd/Ctrl', 'Shift', 'Z'], description: 'Redo' },
        { keys: ['Delete'], description: 'Delete Region' },
        { keys: ['Backspace'], description: 'Delete Region' },
      ],
    },
    {
      title: 'General',
      shortcuts: [
        { keys: ['F'], description: 'Toggle Fullscreen' },
        { keys: ['Esc'], description: 'Exit Fullscreen / Deselect' },
      ],
    },
  ];

  return (
    <div className="p-8 h-full overflow-y-auto">
      <h2 className="text-lg font-semibold text-foreground mb-6">Keyboard Shortcuts</h2>

      <div className="space-y-6">
        {shortcutCategories.map(category => (
          <div key={category.title}>
            <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wider mb-2">{category.title}</h3>
            <div className="divide-y divide-border rounded-lg border border-border bg-muted/30 px-4">
              {category.shortcuts.map(shortcut => (
                <ShortcutItem key={shortcut.description} keys={shortcut.keys} description={shortcut.description} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}