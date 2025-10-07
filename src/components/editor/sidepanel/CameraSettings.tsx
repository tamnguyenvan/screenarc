// Settings panel for webcam overlay (visibility, position, size, shadow)
import { useMemo } from "react"
import { useEditorStore } from "../../../store/editorStore"
import { ControlGroup } from "./ControlGroup"
import {
  CornerUpLeft,
  CornerUpRight,
  CornerDownLeft,
  CornerDownRight,
  Video,
  Eye,
  ImageIcon,
  Maximize,
  Circle,
  Square,
  RectangleHorizontal,
} from "lucide-react"
import { Button } from "../../ui/button"
import { Switch } from "../../ui/switch"
import { Slider } from "../../ui/slider"
import { ColorPicker } from "../../ui/color-picker"
import { rgbaToHexAlpha, hexToRgb } from "../../../lib/utils"
import { useShallow } from "zustand/react/shallow"
import { CornerRadiusIcon } from "../../ui/icons"

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

  const positions = [
    { pos: "top-left" as const, icon: <CornerUpLeft className="w-5 h-5" />, label: "Top Left" },
    { pos: "top-right" as const, icon: <CornerUpRight className="w-5 h-5" />, label: "Top Right" },
    { pos: "bottom-left" as const, icon: <CornerDownLeft className="w-5 h-5" />, label: "Bottom Left" },
    { pos: "bottom-right" as const, icon: <CornerDownRight className="w-5 h-5" />, label: "Bottom Right" },
  ]

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
      <div className="flex-1 p-6 space-y-8 overflow-y-auto">
        <ControlGroup
          label="Visibility"
          icon={<Eye className="w-4 h-4 text-primary" />}
          description="Show or hide the webcam overlay"
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

        <ControlGroup
          label="Position"
          icon={<CornerUpLeft className="w-4 h-4 text-primary" />}
          description="Place the webcam in a corner"
        >
          <div className="grid grid-cols-2 gap-2">
            {positions.map((p) => (
              <Button
                key={p.pos}
                variant={webcamPosition.pos === p.pos ? "secondary" : "ghost"}
                onClick={() => setWebcamPosition({ pos: p.pos })}
                className="h-auto py-3 flex flex-col items-center justify-center gap-2 transition-all duration-200"
              >
                {p.icon}
                <span className="text-xs font-medium">{p.label}</span>
              </Button>
            ))}
          </div>
        </ControlGroup>

        <ControlGroup
          label="Appearance"
          icon={<ImageIcon className="w-4 h-4 text-primary" />}
          description="Adjust size, shape, and shadow"
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
                {!isCircle && (<span className="text-xs font-semibold text-primary tabular-nums">{webcamStyles.borderRadius}px</span>)}
              </label>
              <Slider min={0} max={50} step={1} value={webcamStyles.borderRadius} onChange={(value) => updateWebcamStyle({ borderRadius: value })} disabled={isCircle} />
            </div>

            {/* Webcam Size Control */}
            <div className="space-y-3">
              <label className="flex items-center justify-between text-sm font-medium text-sidebar-foreground">
                <div className="flex items-center gap-2.5">
                  <div className="w-5 h-5 flex items-center justify-center text-primary"> <Maximize className="w-4 h-4" /> </div>
                  <span>Size</span>
                </div>
                <span className="text-xs font-semibold text-primary tabular-nums">{webcamStyles.size}%</span>
              </label>
              <Slider min={10} max={50} step={1} value={webcamStyles.size} onChange={(value) => updateWebcamStyle({ size: value })} />
            </div>

            {/* Webcam Shadow Control */}
            <div className="space-y-4">
               <div className="flex items-center gap-2.5 text-sm font-medium text-sidebar-foreground">
                <div className="w-5 h-5 flex items-center justify-center text-primary">
                  <svg xmlns="http://www.w3.org/2000/svg" height="16px" viewBox="0 -960 960 960" width="16px" fill="currentColor">
                    <path d="M160-80q-33 0-56.5-23.5T80-160v-480q0-33 23.5-56.5T160-720h80v-80q0-33 23.5-56.5T320-880h480q33 0 56.5 23.5T880-800v480q0 33-23.5 56.5T800-240h-80v80q0 33-23.5 56.5T640-80H160Zm160-240h480v-480H320v480Z" />
                  </svg>
                </div>
                <span>Shadow</span>
              </div>
              <div className="pl-7 space-y-4">
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
            </div>
          </div>
        </ControlGroup>
      </div>
    </div>
  )
}