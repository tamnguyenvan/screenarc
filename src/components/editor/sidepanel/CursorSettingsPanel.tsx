import { useState, useEffect } from 'react';
import { useEditorStore } from '../../../store/editorStore';
import { MousePointerClick } from 'lucide-react';
import { cn } from '../../../lib/utils';
import { ControlGroup } from './ControlGroup';
import { useShallow } from 'zustand/react/shallow';

// Consistent with backend constants
const CURSOR_SCALES = [
  { value: 1, label: '1x' },
  { value: 2, label: '2x' },
  { value: 3, label: '3x' },
];

export function CursorSettingsPanel() {
  const [platform, setPlatform] = useState<NodeJS.Platform | null>(null);
  const isWindows = platform === 'win32';

  useEffect(() => {
    window.electronAPI.getPlatform().then(setPlatform);
  }, []);

  const { cursorScale, setCursorScale } = useEditorStore(
    useShallow(state => ({
      cursorScale: state.cursorScale,
      setCursorScale: state.setCursorScale,
    }))
  );

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-6 border-b border-sidebar-border">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <MousePointerClick className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-sidebar-foreground">Cursor Settings</h2>
            <p className="text-sm text-muted-foreground">Adjust the cursor size for the final video</p>
          </div>
        </div>
      </div>
      {/* Content */}
      <div className="flex-1 overflow-y-auto stable-scrollbar p-6 space-y-8">
        {!isWindows && (
          <div className="bg-yellow-50 dark:bg-yellow-900/30 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4 text-sm text-yellow-800 dark:text-yellow-200">
            <p>⚠️ Changing cursor scale is only available on Windows. Your current platform does not support this feature.</p>
          </div>
        )}
        <ControlGroup
          label="Cursor Scale"
          icon={<MousePointerClick className="w-4 h-4 text-primary" />}
          description={isWindows 
            ? "Changes the system cursor size for live preview and will be used in the final export."
            : "This feature is only available on Windows."}
          disabled={!isWindows}
        >
          <div className="space-y-6 pt-2">
            <div className={cn(
              "grid grid-cols-3 gap-2 p-1 rounded-lg",
              isWindows ? "bg-muted/50" : "bg-muted/20 opacity-50 cursor-not-allowed"
            )}>
              {CURSOR_SCALES.map((scale) => (
                <button
                  key={scale.value}
                  onClick={() => isWindows && setCursorScale(scale.value)}
                  disabled={!isWindows}
                  className={cn(
                    "py-2.5 text-sm font-medium rounded-md transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    cursorScale === scale.value
                      ? "bg-background shadow-sm text-foreground"
                      : "text-muted-foreground hover:text-foreground",
                    !isWindows && "cursor-not-allowed opacity-70"
                  )}
                >
                  {scale.label}
                </button>
              ))}
            </div>
          </div>
        </ControlGroup>
      </div>
    </div>
  );
}