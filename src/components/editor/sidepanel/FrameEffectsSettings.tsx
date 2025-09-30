import { useMemo } from 'react';
import { useEditorStore } from '../../../store/editorStore';
import { ColorPicker } from '../../ui/color-picker';
import { Slider } from '../../ui/slider';
import { ControlGroup } from './ControlGroup';
import { rgbaToHexAlpha, hexToRgb } from '../../../lib/utils';
import { BorderThicknessIcon, CornerRadiusIcon, PaddingIcon, ShadowIcon } from '../../ui/icons';

export function FrameEffectsSettings() {
  const { frameStyles, updateFrameStyle } = useEditorStore();

  const handleStyleChange = (name: string, value: string | number) => {
    updateFrameStyle({
      [name]: typeof value === 'string' ? parseFloat(value) || 0 : value,
    });
  };

  // Memoize the conversion to prevent re-calculating on every render
  const { hex: shadowHex, alpha: shadowAlpha } = useMemo(
    () => rgbaToHexAlpha(frameStyles.shadowColor),
    [frameStyles.shadowColor]
  );

  const handleShadowColorChange = (newHex: string) => {
    const rgb = hexToRgb(newHex);
    if (rgb) {
      // Re-combine the new color with the existing alpha value
      const newRgbaColor = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${shadowAlpha})`;
      updateFrameStyle({ shadowColor: newRgbaColor });
    }
  };

  const handleShadowOpacityChange = (newAlpha: number) => {
    const rgb = hexToRgb(shadowHex);
    if (rgb) {
      // Re-combine the existing color with the new alpha value
      const newRgbaColor = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${newAlpha})`;
      updateFrameStyle({ shadowColor: newRgbaColor });
    }
  };


  return (
    <>
      <ControlGroup
        label="Padding"
        description="Space around your video content"
      >
        <div>
          <label className="flex items-center justify-between text-sm font-medium text-sidebar-foreground mb-3">
            <div className="flex items-center gap-2">
              <PaddingIcon />
              <span>Padding</span>
            </div>
            <span className="text-xs text-muted-foreground">{frameStyles.padding}%</span>
          </label>
          <Slider
            min={0}
            max={30}
            value={frameStyles.padding}
            onChange={(value) => handleStyleChange("padding", value)}
          />
        </div>
      </ControlGroup>

      <ControlGroup
        label="Frame Effects"
        description="Visual enhancements for your video"
      >
        <div className="space-y-6">
          {/* Corner Radius */}
          <div>
            <label className="flex items-center justify-between text-sm font-medium text-sidebar-foreground mb-3">
              <div className="flex items-center gap-2">
                <CornerRadiusIcon />
                <span>Corner Radius</span>
              </div>
              <span className="text-xs text-muted-foreground">{frameStyles.borderRadius}px</span>
            </label>
            <Slider
              min={0}
              max={50}
              value={frameStyles.borderRadius}
              onChange={(value) => handleStyleChange("borderRadius", value)}
            />
          </div>

          {/* Shadow */}
          <div>
            <div className="flex items-center gap-2 text-sm font-medium text-sidebar-foreground mb-4">
              <ShadowIcon />
              <span>Shadow</span>
            </div>

            <div className="grid grid-cols-1 gap-4">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-muted-foreground">Size</span>
                  <span className="text-xs text-muted-foreground font-medium">{frameStyles.shadow}px</span>
                </div>
                <Slider
                  min={0}
                  max={50}
                  step={1}
                  value={frameStyles.shadow}
                  onChange={(value) => handleStyleChange("shadow", value)}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <ColorPicker
                    label="Color"
                    value={shadowHex}
                    onChange={handleShadowColorChange}
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-muted-foreground">Opacity</span>
                    <span className="text-xs text-muted-foreground font-medium">{Math.round(shadowAlpha * 100)}%</span>
                  </div>
                  <Slider
                    min={0}
                    max={1}
                    step={0.01}
                    value={shadowAlpha}
                    onChange={handleShadowOpacityChange}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Border Thickness */}
          <div>
            <label className="flex items-center justify-between text-sm font-medium text-sidebar-foreground mb-3">
              <div className="flex items-center gap-2">
                <BorderThicknessIcon />
                <span>Border Thickness</span>
              </div>
              <span className="text-xs text-muted-foreground">{frameStyles.borderWidth}px</span>
            </label>
            <Slider
              min={0}
              max={20}
              value={frameStyles.borderWidth}
              onChange={(value) => handleStyleChange("borderWidth", value)}
            />
          </div>
        </div>
      </ControlGroup>
    </>
  );
}