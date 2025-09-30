import { useMemo } from 'react';
import { useEditorStore } from '../../../store/editorStore';
import { ControlGroup } from './ControlGroup';
import {
  CornerUpLeft, CornerUpRight, CornerDownLeft, CornerDownRight,
  Video, Eye, EyeOff, Image, Maximize
} from 'lucide-react';
import { Button } from '../../ui/button';
import { Switch } from '../../ui/switch';
import { Slider } from '../../ui/slider';
import { useShallow } from 'zustand/react/shallow';
import { ColorPicker } from '../../ui/color-picker';
import { rgbaToHexAlpha, hexToRgb } from '../../../lib/utils';

export function CameraSettings() {
  const { isWebcamVisible, webcamPosition, webcamStyles, setWebcamVisibility, setWebcamPosition, updateWebcamStyle } = useEditorStore(
    useShallow(state => ({
      isWebcamVisible: state.isWebcamVisible,
      webcamPosition: state.webcamPosition,
      webcamStyles: state.webcamStyles,
      setWebcamVisibility: state.setWebcamVisibility,
      setWebcamPosition: state.setWebcamPosition,
      updateWebcamStyle: state.updateWebcamStyle,
    }))
  );

  const positions = [
    { pos: 'top-left' as const, icon: <CornerUpLeft className="w-5 h-5" />, label: 'Top Left' },
    { pos: 'top-right' as const, icon: <CornerUpRight className="w-5 h-5" />, label: 'Top Right' },
    { pos: 'bottom-left' as const, icon: <CornerDownLeft className="w-5 h-5" />, label: 'Bottom Left' },
    { pos: 'bottom-right' as const, icon: <CornerDownRight className="w-5 h-5" />, label: 'Bottom Right' },
  ];

  // Correctly separate color and alpha from RGBA string
  const { hex: shadowHex, alpha: shadowAlpha } = useMemo(
    () => rgbaToHexAlpha(webcamStyles.shadowColor),
    [webcamStyles.shadowColor]
  );

  const handleShadowColorChange = (newHex: string) => {
    const rgb = hexToRgb(newHex);
    if (rgb) {
      const newRgbaColor = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${shadowAlpha})`;
      updateWebcamStyle({ shadowColor: newRgbaColor });
    }
  };

  const handleShadowOpacityChange = (newAlpha: number) => {
    const rgb = hexToRgb(shadowHex);
    if (rgb) {
      const newRgbaColor = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${newAlpha})`;
      updateWebcamStyle({ shadowColor: newRgbaColor });
    }
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-6 border-b border-sidebar-border">
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
          <div className="flex items-center gap-2">
            <Switch
              checked={isWebcamVisible}
              onCheckedChange={setWebcamVisibility}
              className="data-[state=on]:bg-primary"
            >
              {isWebcamVisible ? (
                <Eye className="h-4 w-4" />
              ) : (
                <EyeOff className="h-4 w-4" />
              )}
            </Switch>
            <span className="text-sm text-muted-foreground">
              {isWebcamVisible ? 'Visible' : 'Hidden'}
            </span>
          </div>
        </ControlGroup>

        <ControlGroup
          label="Position"
          icon={<CornerUpLeft className="w-4 h-4 text-primary" />}
          description="Place the webcam in a corner"
        >
          <div className="grid grid-cols-2 gap-2">
            {positions.map(p => (
              <Button
                key={p.pos}
                variant={webcamPosition.pos === p.pos ? 'secondary' : 'ghost'}
                onClick={() => setWebcamPosition({ pos: p.pos })}
                className="h-12 flex flex-col items-center justify-center gap-1"
              >
                {p.icon}
                <span className="text-xs">{p.label}</span>
              </Button>
            ))}
          </div>
        </ControlGroup>

        <ControlGroup
          label="Appearance"
          icon={<Image className="w-4 h-4 text-primary" />}
          description="Adjust size and shadow"
        >
          <div className="space-y-6">
            {/* Webcam Size Control */}
            <div>
              <label className="flex items-center justify-between text-sm font-medium text-sidebar-foreground mb-3">
                <div className="flex items-center gap-2">
                  <Maximize className="w-4 h-4 text-primary" />
                  <span>Size</span>
                </div>
                <span className="text-xs text-muted-foreground">{webcamStyles.size}%</span>
              </label>
              <Slider
                min={10} max={50} step={1}
                value={webcamStyles.size}
                onChange={(value) => updateWebcamStyle({ size: value })}
              />
            </div>

            {/* Webcam Shadow Control */}
            <div>
              <div className="flex items-center gap-2 text-sm font-medium text-sidebar-foreground mb-4">
                <svg xmlns="http://www.w3.org/2000/svg" height="16px" viewBox="0 -960 960 960" width="16px" fill="currentColor" className="text-primary">
                  <path d="M160-80q-33 0-56.5-23.5T80-160v-480q0-33 23.5-56.5T160-720h80v-80q0-33 23.5-56.5T320-880h480q33 0 56.5 23.5T880-800v480q0 33-23.5 56.5T800-240h-80v80q0 33-23.5 56.5T640-80H160Zm160-240h480v-480H320v480Z" />
                </svg>
                <span>Shadow</span>
              </div>

              <div className="grid grid-cols-1 gap-4">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-muted-foreground">Size</span>
                    <span className="text-xs text-muted-foreground font-medium">{webcamStyles.shadow}px</span>
                  </div>
                  <Slider
                    min={0} max={40} step={1}
                    value={webcamStyles.shadow}
                    onChange={(value) => updateWebcamStyle({ shadow: value })}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <ColorPicker
                      label="Color"
                      value={shadowHex} // Use the calculated hex value
                      onChange={handleShadowColorChange}
                    />
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-muted-foreground">Opacity</span>
                      <span className="text-xs text-muted-foreground font-medium">
                        {Math.round(shadowAlpha * 100)}%</span>
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
          </div>
        </ControlGroup>
      </div>
    </div>
  );
}