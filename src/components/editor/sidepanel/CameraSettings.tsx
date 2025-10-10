// Settings panel for webcam overlay (visibility, position, size, shadow)
import { useMemo } from "react"
import { useEditorStore } from "../../../store/editorStore"
import { ControlGroup } from "./ControlGroup"
import {
  Video,
  Eye,
  ImageIcon,
  Maximize,
  Circle,
  Square,
  RectangleHorizontal,
  Wand2,
} from "lucide-react"
import { Button } from "../../ui/button"
import { Switch } from "../../ui/switch"
import { Slider } from "../../ui/slider"
import { ColorPicker } from "../../ui/color-picker"
import { rgbaToHexAlpha, hexToRgb } from "../../../lib/utils"
import { useShallow } from "zustand/react/shallow"
import { CornerRadiusIcon } from "../../ui/icons"
import { Collapse } from "../../ui/collapse"
import { cn } from "../../../lib/utils"
import type { WebcamPosition } from "../../../types"

export function CameraSettings() {
  const { isWebcamVisible, webcamPosition, webcamStyles, setWebcamVisibility, setWebcamPosition, updateWebcamStyle } =
    useEditorStore(
      useShallow((state) => ({
        isWebcamVisible: state.isWebcamVisible,
        webcamPosition: state.webcamPosition,
        webcamStyles: state.webcamStyles,
        setWebcamVisibility: state.setWebcamVisibility,
        setWebcamPosition: state.setWebcamPosition,
        updateWebcamStyle: state.updateWebcamStyle,
      })),
    )

  const { hex: shadowHex, alpha: shadowAlpha } = useMemo(
    () => rgbaToHexAlpha(webcamStyles.shadowColor),
    [webcamStyles.shadowColor],
  )

  const handleShadowColorChange = (newHex: string) => {
    const rgb = hexToRgb(newHex)
    if (rgb) {
      const newRgbaColor = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${shadowAlpha})`
      updateWebcamStyle({ shadowColor: newRgbaColor })
    }
  }

  const handleShadowOpacityChange = (newAlpha: number) => {
    const rgb = hexToRgb(shadowHex)
    if (rgb) {
      const newRgbaColor = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${newAlpha})`
      updateWebcamStyle({ shadowColor: newRgbaColor })
    }
  }

  const handleWebcamStyleChange = (name: string, value: string | number) => {
    updateWebcamStyle({
      [name]: typeof value === "string" ? Number.parseFloat(value) || 0 : value,
    })
  }

  const isCircle = webcamStyles.shape === 'circle';
  const positions: { pos: WebcamPosition['pos']; classes: string }[] = [
    { pos: 'top-left', classes: 'top-2 left-2' },
    { pos: 'top-center', classes: 'top-2 left-1/2 -translate-x-1/2' },
    { pos: 'top-right', classes: 'top-2 right-2' },
    { pos: 'left-center', classes: 'top-1/2 -translate-y-1/2 left-2' },
    { pos: 'right-center', classes: 'top-1/2 -translate-y-1/2 right-2' },
    { pos: 'bottom-left', classes: 'bottom-2 left-2' },
    { pos: 'bottom-center', classes: 'bottom-2 left-1/2 -translate-x-1/2' },
    { pos: 'bottom-right', classes: 'bottom-2 right-2' },
  ];


  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-6 border-b border-sidebar-border flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Video className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-sidebar-foreground">Camera Settings</h2>
            <p className="text-sm text-muted-foreground">Adjust your webcam overlay</p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 p-6 space-y-6 overflow-y-auto stable-scrollbar">
        <ControlGroup
          label="Visibility"
          icon={<Eye className="w-4 h-4 text-primary" />}
        >
          <div className="flex items-center justify-between p-3 rounded-lg bg-sidebar-accent/30 border border-sidebar-border">
            <span className="text-sm font-medium text-sidebar-foreground">
              {isWebcamVisible ? "Visible" : "Hidden"}
            </span>
            <Switch
              checked={isWebcamVisible}
              onCheckedChange={setWebcamVisibility}
              className="data-[state=on]:bg-primary"
            />
          </div>
        </ControlGroup>
        
        <Collapse
          title="Style"
          description="Change the webcam's shape"
          icon={<ImageIcon />}
          defaultOpen={true}
        >
           <div className="space-y-6">
            {/* Shape Selector */}
            <div className="space-y-3">
              <label className="text-sm font-medium text-sidebar-foreground">Shape</label>
              <div className="grid grid-cols-3 gap-2 p-1 bg-muted/50 rounded-lg">
                <Button variant={webcamStyles.shape === "rectangle" ? "secondary" : "ghost"} onClick={() => updateWebcamStyle({ shape: 'rectangle' })} className="h-auto py-2.5 flex items-center justify-center gap-2">
                  <RectangleHorizontal className="w-5 h-4" />
                </Button>
                <Button variant={webcamStyles.shape === "square" ? "secondary" : "ghost"} onClick={() => updateWebcamStyle({ shape: 'square' })} className="h-auto py-2.5 flex items-center justify-center gap-2">
                  <Square className="w-4 h-4" />
                </Button>
                <Button variant={webcamStyles.shape === "circle" ? "secondary" : "ghost"} onClick={() => updateWebcamStyle({ shape: 'circle' })} className="h-auto py-2.5 flex items-center justify-center gap-2">
                  <Circle className="w-4 h-4" />
                </Button>
              </div>
            </div>

            {/* Border Radius Control */}
            <div className="space-y-3">
              <label className="flex items-center justify-between text-sm font-medium text-sidebar-foreground">
                <div className="flex items-center gap-2.5">
                  <div className="w-5 h-5 flex items-center justify-center text-primary"> <CornerRadiusIcon className="w-4 h-4" /> </div>
                  <span className={isCircle ? 'text-muted-foreground' : ''}>Corner Radius</span>
                </div>
                {!isCircle && (<span className="text-xs font-semibold text-primary tabular-nums">{webcamStyles.borderRadius}%</span>)}
              </label>
              <Slider min={0} max={50} step={1} value={isCircle ? 50 : webcamStyles.borderRadius} onChange={(value) => updateWebcamStyle({ borderRadius: value })} disabled={isCircle} />
            </div>
          </div>
        </Collapse>

        <Collapse
          title="Placement"
          description="Adjust size and corner position"
          icon={<Maximize />}
          defaultOpen={true}
        >
          <div className="space-y-6">
            <div className="space-y-3">
              <label className="flex items-center justify-between text-sm font-medium text-sidebar-foreground">
                <span>Size</span>
                <span className="text-xs font-semibold text-primary tabular-nums">{webcamStyles.size}%</span>
              </label>
              <Slider min={10} max={50} step={1} value={webcamStyles.size} onChange={(value) => updateWebcamStyle({ size: value })} />
            </div>
            <div className="space-y-3">
              <label className="text-sm font-medium text-sidebar-foreground">Position</label>
              <div className="relative aspect-video w-full bg-muted/50 rounded-lg p-2 border border-border">
                 {positions.map(({ pos, classes }) => {
                  const isActive = webcamPosition.pos === pos;
                  return (
                    <button
                      key={pos}
                      onClick={() => setWebcamPosition({ pos })}
                      className={cn(
                        'absolute w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-200 hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring ring-offset-background group',
                        classes
                      )}
                      aria-label={`Position ${pos.replace('-', ' ')}`}
                    >
                      <div
                        className={cn(
                          'w-4 h-4 rounded-md transition-all duration-200 border-2',
                          isActive
                            ? 'bg-primary border-primary'
                            : 'bg-transparent border-muted-foreground/50 group-hover:border-primary'
                        )}
                      />
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </Collapse>
        
        <Collapse
          title="Effects"
          description="Add a drop shadow for depth"
          icon={<Wand2 />}
          defaultOpen={false}
        >
          <div className="space-y-4">
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Blur</span>
                <span className="text-xs font-semibold text-primary tabular-nums">{webcamStyles.shadowBlur}px</span>
              </div>
              <Slider min={0} max={80} step={1} value={webcamStyles.shadowBlur} onChange={(v) => handleWebcamStyleChange("shadowBlur", v)} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Offset X</span>
                  <span className="text-xs font-semibold text-primary tabular-nums">{webcamStyles.shadowOffsetX}px</span>
                </div>
                <Slider min={-40} max={40} step={1} value={webcamStyles.shadowOffsetX} onChange={(v) => handleWebcamStyleChange("shadowOffsetX", v)} />
              </div>
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Offset Y</span>
                  <span className="text-xs font-semibold text-primary tabular-nums">{webcamStyles.shadowOffsetY}px</span>
                </div>
                <Slider min={-40} max={40} step={1} value={webcamStyles.shadowOffsetY} onChange={(v) => handleWebcamStyleChange("shadowOffsetY", v)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <ColorPicker label="Color" value={shadowHex} onChange={handleShadowColorChange} />
              </div>
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Opacity</span>
                  <span className="text-xs font-semibold text-primary tabular-nums">{Math.round(shadowAlpha * 100)}%</span>
                </div>
                <Slider min={0} max={1} step={0.01} value={shadowAlpha} onChange={handleShadowOpacityChange} />
              </div>
            </div>
          </div>
        </Collapse>
      </div>
    </div>
  )
}