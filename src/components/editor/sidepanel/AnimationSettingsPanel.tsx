import { useState } from "react"
import { useEditorStore } from "../../../store/editorStore"
import { LineSquiggle, Wand2, Check } from "lucide-react"
import { ZOOM } from "../../../lib/constants"
import { EASING_MAP } from "../../../lib/easing"
import { cn } from "../../../lib/utils"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../ui/select"
import { Slider } from "../../ui/slider"
import { Button } from "../../ui/button"
import { Collapse } from "../../ui/collapse"

const speedOptions = Object.keys(ZOOM.SPEED_OPTIONS)
const easingOptions = Object.keys(EASING_MAP)

export function AnimationSettingsPanel() {
  const { applyAnimationSettingsToAll } = useEditorStore.getState()

  // Local state
  const [speed, setSpeed] = useState(ZOOM.DEFAULT_SPEED)
  const [easing, setEasing] = useState(ZOOM.DEFAULT_EASING)
  const [zoomLevel, setZoomLevel] = useState(ZOOM.DEFAULT_LEVEL)
  const [applyStatus, setApplyStatus] = useState<"idle" | "applied">("idle")

  const handleApplyToAll = () => {
    if (applyStatus !== "idle") return

    const transitionDuration =
      ZOOM.SPEED_OPTIONS[speed as keyof typeof ZOOM.SPEED_OPTIONS]
    applyAnimationSettingsToAll({ transitionDuration, easing, zoomLevel })

    setApplyStatus("applied")
    setTimeout(() => setApplyStatus("idle"), 2000)
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-6 border-b border-sidebar-border flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <LineSquiggle className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-sidebar-foreground">
              Global Animation
            </h2>
            <p className="text-sm text-muted-foreground">
              Set default animation for all zoom regions
            </p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto stable-scrollbar p-6 space-y-6">
        {/* Animation Settings Collapse */}
        <Collapse
          title="Animation Settings"
          description="These settings will be applied to all zoom regions."
          icon={<LineSquiggle />}
          defaultOpen={true}
        >
          <div className="space-y-6 pt-2">
            {/* Speed Selector */}
            <div className="space-y-3">
              <label className="text-sm font-medium text-sidebar-foreground">
                Speed
              </label>
              <div className="grid grid-cols-4 gap-1 p-1 bg-muted/50 rounded-lg">
                {speedOptions.map((s) => (
                  <button
                    key={s}
                    onClick={() => setSpeed(s)}
                    className={cn(
                      "py-2 text-sm font-medium rounded-md transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      speed === s
                        ? "bg-background shadow-sm text-foreground"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            {/* Easing Selector */}
            <div className="space-y-3">
              <label className="text-sm font-medium text-sidebar-foreground">
                Style (Easing)
              </label>
              <Select value={easing} onValueChange={setEasing}>
                <SelectTrigger className="h-10 bg-background/50">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {easingOptions.map((e) => (
                    <SelectItem key={e} value={e}>
                      {e}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Zoom Level */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-sidebar-foreground">
                  Zoom Level
                </label>
                <span className="text-xs font-semibold text-primary tabular-nums">
                  {zoomLevel.toFixed(1)}x
                </span>
              </div>
              <Slider
                min={1}
                max={3}
                step={0.1}
                value={zoomLevel}
                onChange={setZoomLevel}
              />
            </div>
          </div>
        </Collapse>

        {/* Apply Collapse */}
        <Collapse
          title="Apply to All"
          description="Apply these animation settings globally."
          icon={<Wand2 />}
          defaultOpen={true}
        >
          <div className="pt-2">
            <Button
              onClick={handleApplyToAll}
              disabled={applyStatus !== "idle"}
              className={cn(
                "w-full h-11 font-semibold transition-all duration-300",
                applyStatus === "applied" &&
                  "bg-green-500 hover:bg-green-500/90",
              )}
            >
              {applyStatus === "idle" ? (
                <>
                  <Wand2 className="w-4 h-4 mr-2" />
                  Apply to All Zoom Regions
                </>
              ) : (
                <>
                  <Check className="w-5 h-5 mr-2" />
                  Applied!
                </>
              )}
            </Button>
          </div>
        </Collapse>
      </div>
    </div>
  )
}
