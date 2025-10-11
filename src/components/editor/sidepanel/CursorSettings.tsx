import { MousePointer } from "lucide-react"
import { Collapse } from "../../ui/collapse"
import { cn } from "../../../lib/utils"
import { useEffect, useState } from "react"
import { useEditorStore } from "../../../store/editorStore"

const POST_PROCESSING_SCALES = [
  { value: 2, label: "2x" },
  { value: 1.5, label: "1.5x" },
  { value: 1, label: "1x" },
]

export function CursorSettings() {
  const { platform, setPostProcessingCursorScale } = useEditorStore((state) => ({
    platform: state.platform,
    setPostProcessingCursorScale: state.setPostProcessingCursorScale,
  }));
  const [cursorScale, setCursorScale] = useState<number>(2); // Default to 2x

  useEffect(() => {
    if (platform === 'win32' || platform === 'darwin') {
      // Load initial scale from settings when component mounts
      window.electronAPI.getSetting<number>('recorder.cursorScale').then(savedScale => {
        if (savedScale && POST_PROCESSING_SCALES.some(s => s.value === savedScale)) {
          setCursorScale(savedScale);
        }
      });
    }
  }, [platform])

  const handleCursorScaleChange = (value: number) => {
    setCursorScale(value);
    setPostProcessingCursorScale(value);
  };

  if (platform !== "win32" && platform !== "darwin") {
    return (
      <div className="p-6 text-center text-sm text-muted-foreground">
        <p>Cursor scaling is only available on Windows and macOS in the editor.</p>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-6 border-b border-sidebar-border flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <MousePointer className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-sidebar-foreground">Cursor Settings</h2>
            <p className="text-sm text-muted-foreground">Adjust the rendered cursor size</p>
          </div>
        </div>
      </div>
      {/* Content */}
      <div className="flex-1 p-6 space-y-6 overflow-y-auto stable-scrollbar">
        <Collapse
          title="Cursor Size"
          description="Change the cursor size in the final video"
          icon={<MousePointer className="w-4 h-4 text-primary" />}
          defaultOpen={true}
        >
          <div className="space-y-3">
            <label className="text-sm font-medium text-sidebar-foreground">Scale</label>
            <div className="grid grid-cols-3 gap-1 p-1 bg-muted/50 rounded-lg">
              {POST_PROCESSING_SCALES.map((scale) => (
                <button
                  key={scale.value}
                  onClick={() => handleCursorScaleChange(scale.value)}
                  className={cn(
                    "py-2 text-sm font-medium rounded-md transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    cursorScale === scale.value
                      ? "bg-background shadow-sm text-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {scale.label}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground pt-2">
              This only affects the final exported video, not your system cursor.
            </p>
          </div>
        </Collapse>
      </div>
    </div>
  )
}