import React, { useState, useRef, useEffect } from 'react';
import { useEditorStore } from '../../../store/editorStore';
import { cn } from '../../../lib/utils';
import { WALLPAPERS } from '../../../lib/constants';
import {
  Image, Check, UploadCloud, X, Zap, ArrowUp, ArrowDown, ArrowLeft, ArrowRight,
  ArrowDownRight, ArrowUpLeft, ArrowDownLeft, Plus, Paintbrush
} from 'lucide-react';
import { ControlGroup } from './ControlGroup';
import { Button } from '../../ui/button';
import { ColorPickerRoundedRect } from '../../ui/color-picker';

type BackgroundTab = 'color' | 'gradient' | 'image' | 'wallpaper';

// --- Sub-components for each tab ---

const WallpaperSelector = () => {
  const { frameStyles, updateBackground } = useEditorStore();
  return (
    <div className="grid grid-cols-6 gap-2">
      {WALLPAPERS.slice(0, 18).map((wallpaper, index) => (
        <button
          key={`${wallpaper.thumbnailUrl}-${index}`}
          onClick={() => updateBackground({ type: 'wallpaper', thumbnailUrl: wallpaper.thumbnailUrl, imageUrl: wallpaper.imageUrl })}
          className={cn(
            "relative aspect-square rounded-lg overflow-hidden border-2 transition-all duration-300",
            frameStyles.background.thumbnailUrl === wallpaper.thumbnailUrl
              ? "border-primary ring-2 ring-primary/20"
              : "border-sidebar-border hover:border-primary/60"
          )}
        >
          <img src={wallpaper.thumbnailUrl} alt={`Wallpaper ${index + 1}`} className="w-full h-full object-cover" />
          {frameStyles.background.thumbnailUrl === wallpaper.thumbnailUrl && (
            <div className="absolute inset-0 bg-primary/20 flex items-center justify-center backdrop-blur-[1px]">
              <div className="w-5 h-5 bg-primary rounded-full flex items-center justify-center">
                <Check className="w-3 h-3 text-primary-foreground" />
              </div>
            </div>
          )}
        </button>
      ))}
    </div>
  );
};

const COLOR_PRESETS = [
  '#7c3aed', '#3b82f6', '#10b981', '#ef4444', '#f97316', '#ec4899',
  '#8b5cf6', '#14b8a6', '#eab308', '#6366f1', '#6b7280', '#000000',
  '#ffffff', '#f43f5e', '#22c55e', '#0ea5e9', '#d946ef',
];

const ColorSelector = () => {
  const { frameStyles, updateBackground } = useEditorStore();
  return (
    <div className="grid grid-cols-6 gap-2">
      {COLOR_PRESETS.map((color) => (
        <button
          key={color}
          onClick={() => updateBackground({ type: 'color', color })}
          className={cn("w-full aspect-square rounded-lg border-2 transition-all duration-300", frameStyles.background.color === color ? "border-primary ring-2 ring-primary/20" : "border-sidebar-border hover:border-primary/60")}
          style={{ backgroundColor: color }}
          title={color}
        >
          {frameStyles.background.color === color && (
            <div className="w-full h-full flex items-center justify-center">
              <div className="w-4 h-4 bg-white/90 rounded-full flex items-center justify-center shadow-sm">
                <Check className="w-2.5 h-2.5 text-gray-800" />
              </div>
            </div>
          )}
        </button>
      ))}
      <label className={cn("relative w-full aspect-square rounded-lg border-2 cursor-pointer transition-all duration-300", "border-sidebar-border hover:border-primary/60")} title="Custom Color">
        <input type="color" value={frameStyles.background.color || '#ffffff'} onChange={(e) => updateBackground({ type: 'color', color: e.target.value })} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
        <div className="absolute inset-0 w-full h-full rounded-lg" style={{ background: frameStyles.background.color || 'conic-gradient(from_90deg_at_50%_50%,#ef4444_0%,#eab308_25%,#10b981_50%,#3b82f6_75%,#7c3aed_100%)', opacity: 0.9 }} />
        <div className="absolute inset-0 flex items-center justify-center bg-black/10 rounded-lg"><Plus className="w-4 h-4 text-white/90 drop-shadow-sm" /></div>
      </label>
    </div>
  );
};

const GRADIENT_PRESETS = [
  { name: 'Top to Bottom', direction: 'to bottom', icon: ArrowDown },
  { name: 'Bottom to Top', direction: 'to top', icon: ArrowUp },
  { name: 'Left to Right', direction: 'to right', icon: ArrowRight },
  { name: 'Right to Left', direction: 'to left', icon: ArrowLeft },
  { name: 'Top-Left to Bottom-Right', direction: 'to bottom right', icon: ArrowDownRight },
  { name: 'Bottom-Right to Top-Left', direction: 'to top left', icon: ArrowUpLeft },
  { name: 'Top-Right to Bottom-Left', direction: 'to bottom left', icon: ArrowDownLeft },
  { name: 'Center Out', direction: 'circle', icon: Zap },
];

const GradientSelector = () => {
  const { frameStyles, updateBackground } = useEditorStore();
  const [localGradient, setLocalGradient] = useState({ start: frameStyles.background.gradientStart || '#6366f1', end: frameStyles.background.gradientEnd || '#9ca9ff' });

  useEffect(() => {
    if (frameStyles.background.type === 'gradient') {
      setLocalGradient({ start: frameStyles.background.gradientStart || '#6366f1', end: frameStyles.background.gradientEnd || '#9ca9ff' });
    }
  }, [frameStyles.background.gradientStart, frameStyles.background.gradientEnd, frameStyles.background.type]);

  const handleApplyGradient = () => updateBackground({ type: 'gradient', gradientStart: localGradient.start, gradientEnd: localGradient.end, gradientDirection: frameStyles.background.gradientDirection });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-4">
          <h5 className="text-xs font-semibold text-muted-foreground mb-3 uppercase tracking-wider">Colors</h5>
          <div className="flex flex-col items-start gap-4">
            <ColorPickerRoundedRect label="Start" color={localGradient.start} name="gradientStart" onChange={(e) => setLocalGradient(p => ({ ...p, start: e.target.value }))} size="md" />
            <ColorPickerRoundedRect label="End" color={localGradient.end} name="gradientEnd" onChange={(e) => setLocalGradient(p => ({ ...p, end: e.target.value }))} size="md" />
          </div>
        </div>
        <div className="col-span-8">
          <h5 className="text-xs font-semibold text-muted-foreground mb-3 uppercase tracking-wider">Style</h5>
          <div className="grid grid-cols-4 gap-3">
            {GRADIENT_PRESETS.map((preset, index) => (
              <button
                key={index}
                className={cn("relative aspect-square rounded-lg overflow-hidden border-2 transition-all duration-200 flex items-center justify-center group", frameStyles.background.gradientDirection === preset.direction ? "border-primary ring-2 ring-primary/20" : "border-sidebar-border hover:border-primary/60")}
                style={preset.direction === 'circle' ? { background: `radial-gradient(circle, #808080, #ffffff)` } : { background: `linear-gradient(${preset.direction}, #808080, #ffffff)` }}
                onClick={() => updateBackground({ type: 'gradient', gradientDirection: preset.direction })}
                title={preset.name}
              >
                {frameStyles.background.gradientDirection === preset.direction && (
                  <div className="absolute inset-0 bg-black/10 flex items-center justify-center">
                    <div className="w-5 h-5 bg-white/90 rounded-full flex items-center justify-center shadow-sm"><Check className="w-3 h-3 text-gray-800" /></div>
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>
      <Button onClick={handleApplyGradient} size="sm" className="w-full"><Paintbrush className="w-4 h-4 mr-2" />Apply Colors</Button>
    </div>
  );
};

const ImageSelector = () => {
  const { frameStyles, updateBackground } = useEditorStore();
  const imageInputRef = useRef<HTMLInputElement>(null);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      const imageUrl = URL.createObjectURL(e.target.files[0]);
      updateBackground({ type: 'image', imageUrl });
    }
  };

  const removeUploadedImage = () => {
    if (frameStyles.background.imageUrl?.startsWith('blob:')) {
      URL.revokeObjectURL(frameStyles.background.imageUrl);
    }
    updateBackground({ type: 'wallpaper', imageUrl: WALLPAPERS[0].imageUrl, thumbnailUrl: WALLPAPERS[0].thumbnailUrl });
  };

  return (
    <div className="relative group">
      <label className={cn("flex flex-col items-center justify-center w-full rounded-xl cursor-pointer border-2 border-dashed transition-all duration-300 overflow-hidden", frameStyles.background.imageUrl ? "h-48 border-primary/30 bg-sidebar-accent/10" : "h-32 border-sidebar-border hover:border-primary/60 hover:bg-primary/5")}>
        {frameStyles.background.imageUrl && frameStyles.background.type === 'image' ? (
          <>
            <img src={frameStyles.background.imageUrl} alt="Background" className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-all duration-300 flex items-center justify-center gap-3">
              <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); removeUploadedImage(); }} className="px-3 py-2 bg-destructive/90 text-destructive-foreground rounded-lg font-medium text-sm hover:bg-destructive transition-colors backdrop-blur-sm"><X className="w-4 h-4 mr-1.5 inline" />Remove</button>
              <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); imageInputRef.current?.click(); }} className="px-3 py-2 bg-primary/90 text-primary-foreground rounded-lg font-medium text-sm backdrop-blur-sm hover:bg-primary/80 transition-colors"><UploadCloud className="w-4 h-4 mr-1.5 inline" />Replace</button>
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center gap-3 text-center">
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center"><UploadCloud className="w-6 h-6 text-primary" /></div>
            <div>
              <p className="text-sm font-semibold text-foreground mb-1">Upload Image</p>
              <p className="text-xs text-muted-foreground">PNG, JPG, GIF up to 10MB</p>
            </div>
          </div>
        )}
        <input ref={imageInputRef} type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
      </label>
    </div>
  );
};


// --- Main Component ---

export function BackgroundSettings() {
  const { frameStyles } = useEditorStore();
  const [activeTab, setActiveTab] = useState<BackgroundTab>(frameStyles.background.type);

  useEffect(() => {
    setActiveTab(frameStyles.background.type);
  }, [frameStyles.background.type]);

  const tabs = [
    { id: 'wallpaper', name: 'Wallpaper', component: <WallpaperSelector /> },
    { id: 'color', name: 'Color', component: <ColorSelector /> },
    { id: 'gradient', name: 'Gradient', component: <GradientSelector /> },
    { id: 'image', name: 'Image', component: <ImageSelector /> },
  ];

  return (
    <ControlGroup label="Background" icon={<Image className="w-4 h-4 text-primary" />} description="Choose how your video background looks">
      <div className="relative p-1 bg-sidebar-accent/50 rounded-full mb-6">
        <div className="relative">
          <div className="relative grid grid-cols-4 gap-1 p-1 bg-muted/50 rounded-full">
            <div
              className="absolute top-1 left-1 right-1 bottom-1 bg-background rounded-full shadow-sm transition-all duration-300 ease-in-out"
              style={{
                width: `calc(25% - 0.25rem)`,
                transform: `translateX(calc(${tabs.findIndex(t => t.id === activeTab) * 100}% + ${tabs.findIndex(t => t.id === activeTab) * 0.25}rem))`
              }}
            />
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as BackgroundTab)}
                className={cn("relative z-10 py-2 text-sm font-medium transition-colors duration-200", activeTab === tab.id ? "text-foreground" : "text-muted-foreground hover:text-foreground")}
              >
                {tab.name}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="min-h-[200px]">
        {tabs.find(t => t.id === activeTab)?.component}
      </div>
    </ControlGroup>
  );
}