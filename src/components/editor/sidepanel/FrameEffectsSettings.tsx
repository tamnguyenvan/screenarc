// FrameEffectsSettings.tsx - Settings panel for video frame effects (padding, corner radius, shadow, border)
import { useMemo } from "react"
import { useEditorStore } from "../../../store/editorStore"
import { ColorPicker } from "../../ui/color-picker"
import { Slider } from "../../ui/slider"
import { ControlGroup } from "./ControlGroup"
import { rgbaToHexAlpha, hexToRgb } from "../../../lib/utils"
import { BorderThicknessIcon, CornerRadiusIcon, PaddingIcon, ShadowIcon } from "../../ui/icons"

export function FrameEffectsSettings() {
  const { frameStyles, updateFrameStyle } = useEditorStore()

  const handleStyleChange = (name: string, value: string | number) => {
    updateFrameStyle({
      [name]: typeof value === "string" ? Number.parseFloat(value) || 0 : value,
    })
  }

  const { hex: shadowHex, alpha: shadowAlpha } = useMemo(
    () => rgbaToHexAlpha(frameStyles.shadowColor),
    [frameStyles.shadowColor],
  )
  
  const { hex: borderHex } = useMemo(
    () => rgbaToHexAlpha(frameStyles.borderColor),
    [frameStyles.borderColor]
  );

  const handleShadowColorChange = (newHex: string) => {
    const rgb = hexToRgb(newHex)
    if (rgb) {
      const newRgbaColor = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${shadowAlpha})`
      updateFrameStyle({ shadowColor: newRgbaColor })
    }
  }

  const handleShadowOpacityChange = (newAlpha: number) => {
    const rgb = hexToRgb(shadowHex)
    if (rgb) {
      const newRgbaColor = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${newAlpha})`
      updateFrameStyle({ shadowColor: newRgbaColor })
    }
  }

  const handleBorderColorChange = (newHex: string) => {
    const rgb = hexToRgb(newHex);
    if(rgb) {
      // Assuming border is always opaque for simplicity, can be changed
      const newRgbaColor = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 1)`;
      updateFrameStyle({ borderColor: newRgbaColor });
    }
  };

  return (
    <div className="space-y-8">
      <ControlGroup label="Padding" description="Space around your video content">
        <div className="space-y-3">
          <label className="flex items-center justify-between text-sm font-medium text-sidebar-foreground">
            <div className="flex items-center gap-2.5">
              <div className="w-5 h-5 flex items-center justify-center text-primary">
                <PaddingIcon />
              </div>
              <span>Padding</span>
            </div>
            <span className="text-xs font-semibold text-primary tabular-nums">{frameStyles.padding}%</span>
          </label>
          <Slider
            min={0}
            max={30}
            value={frameStyles.padding}
            onChange={(value) => handleStyleChange("padding", value)}
          />
        </div>
      </ControlGroup>

      <ControlGroup label="Frame Effects" description="Visual enhancements for your video">
        <div className="space-y-6">
          {/* Corner Radius */}
          <div className="space-y-3">
            <label className="flex items-center justify-between text-sm font-medium text-sidebar-foreground">
              <div className="flex items-center gap-2.5">
                <div className="w-5 h-5 flex items-center justify-center text-primary">
                  <CornerRadiusIcon />
                </div>
                <span>Corner Radius</span>
              </div>
              <span className="text-xs font-semibold text-primary tabular-nums">{frameStyles.borderRadius}px</span>
            </label>
            <Slider
              min={0}
              max={50}
              value={frameStyles.borderRadius}
              onChange={(value) => handleStyleChange("borderRadius", value)}
            />
          </div>

          {/* Shadow */}
          <div className="space-y-4">
            <div className="flex items-center gap-2.5 text-sm font-medium text-sidebar-foreground">
              <div className="w-5 h-5 flex items-center justify-center text-primary">
                <ShadowIcon />
              </div>
              <span>Shadow</span>
            </div>

            <div className="pl-7 space-y-4">
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Blur</span>
                  <span className="text-xs font-semibold text-primary tabular-nums">{frameStyles.shadowBlur}px</span>
                </div>
                <Slider min={0} max={100} step={1} value={frameStyles.shadowBlur} onChange={(v) => handleStyleChange("shadowBlur", v)} />
              </div>
               <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2.5">
                      <div className="flex items-center justify-between">
                          <span className="text-sm text-muted-foreground">Offset X</span>
                          <span className="text-xs font-semibold text-primary tabular-nums">{frameStyles.shadowOffsetX}px</span>
                      </div>
                      <Slider min={-50} max={50} step={1} value={frameStyles.shadowOffsetX} onChange={(v) => handleStyleChange("shadowOffsetX", v)} />
                  </div>
                  <div className="space-y-2.5">
                      <div className="flex items-center justify-between">
                          <span className="text-sm text-muted-foreground">Offset Y</span>
                          <span className="text-xs font-semibold text-primary tabular-nums">{frameStyles.shadowOffsetY}px</span>
                      </div>
                      <Slider min={-50} max={50} step={1} value={frameStyles.shadowOffsetY} onChange={(v) => handleStyleChange("shadowOffsetY", v)} />
                  </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <ColorPicker label="Color" value={shadowHex} onChange={handleShadowColorChange} />
                </div>
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Opacity</span>
                    <span className="text-xs font-semibold text-primary tabular-nums">
                      {Math.round(shadowAlpha * 100)}%
                    </span>
                  </div>
                  <Slider min={0} max={1} step={0.01} value={shadowAlpha} onChange={handleShadowOpacityChange} />
                </div>
              </div>
            </div>
          </div>

          {/* Border */}
          <div className="space-y-4">
             <div className="flex items-center gap-2.5 text-sm font-medium text-sidebar-foreground">
                <div className="w-5 h-5 flex items-center justify-center text-primary">
                  <BorderThicknessIcon />
                </div>
                <span>Border</span>
              </div>
              <div className="pl-7 space-y-4">
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Thickness</span>
                      <span className="text-xs font-semibold text-primary tabular-nums">{frameStyles.borderWidth}px</span>
                  </div>
                  <Slider min={0} max={20} value={frameStyles.borderWidth} onChange={(v) => handleStyleChange("borderWidth", v)} />
                </div>
                <div>
                  <ColorPicker label="Color" value={borderHex} onChange={handleBorderColorChange} />
                </div>
              </div>
          </div>
        </div>
      </ControlGroup>
    </div>
  )
}