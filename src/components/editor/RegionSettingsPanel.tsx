import { useState } from 'react';
import { useEditorStore } from '../../store/editorStore';
import { TimelineRegion, ZoomRegion } from '../../types/store';
import { cn } from '../../lib/utils';
import { Button } from '../ui/button';
import { Camera, Scissors, MousePointer, Video, Trash2 } from 'lucide-react';
import { Slider } from '../ui/slider';
import { FocusPointPicker } from './sidepanel/FocusPointPicker';

interface RegionSettingsPanelProps {
  region: TimelineRegion;
}

function ZoomSettings({ region }: { region: ZoomRegion }) {
  const { updateRegion, deleteRegion } = useEditorStore.getState();

  const handleDelete = () => {
    deleteRegion(region.id);
  }
  const [activeTab, setActiveTab] = useState(region.mode);

  const handleValueChange = (name: string, value: string | number) => {
    const finalValue = typeof value === 'string' ? parseFloat(value) : value;
    updateRegion(region.id, { [name]: finalValue });
  };

  const handleModeChange = (newMode: 'auto' | 'fixed') => {
    setActiveTab(newMode);
    updateRegion(region.id, { mode: newMode });
  };

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-sidebar-foreground uppercase tracking-wide">Zoom Type</h3>
      <div className="grid grid-cols-2 gap-2 p-1 bg-muted/50 rounded-lg">
        <Button
          variant={activeTab === 'auto' ? 'secondary' : 'ghost'}
          onClick={() => handleModeChange('auto')}
          className="h-auto py-2 flex items-center gap-2"
        >
          <MousePointer className="w-4 h-4" /> Auto
        </Button>
        <Button
          variant={activeTab === 'fixed' ? 'secondary' : 'ghost'}
          onClick={() => handleModeChange('fixed')}
          className="h-auto py-2 flex items-center gap-2"
        >
          <Video className="w-4 h-4" /> Fixed
        </Button>
      </div>

      <div className="mt-4 space-y-4">
        {activeTab === 'auto' && (
          <div className="p-4 bg-primary/5 border border-primary/20 rounded-lg">
            <div className="flex items-start gap-3">
              <MousePointer className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-foreground mb-1">Auto Tracking</p>
                <p className="text-xs text-muted-foreground">Zoom will automatically follow the mouse cursor in this area.</p>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'fixed' && (
          <FocusPointPicker
            regionId={region.id}
            targetX={region.targetX}
            targetY={region.targetY}
            startTime={region.startTime}
            onTargetChange={({ x, y }) => updateRegion(region.id, { targetX: x, targetY: y })}
          />
        )}

        <div>
          <div className="flex items-center justify-between mb-3">
            <label className="text-sm font-medium text-sidebar-foreground">Zoom Level</label>
            <span className="text-xs text-muted-foreground">{region.zoomLevel.toFixed(1)}x</span>
          </div>
          <Slider
            min={1}
            max={3}
            step={0.1}
            value={region.zoomLevel}
            onChange={(value) => handleValueChange('zoomLevel', value)}
          />
        </div>

        <div className="mt-4">
          <Button
            variant="outline"
            size="sm"
            onClick={handleDelete}
            className="w-full h-9 bg-destructive/10 hover:bg-destructive text-destructive hover:text-destructive-foreground transition-all duration-200 flex items-center gap-2 justify-center"
          >
            <Trash2 className="w-4 h-4" />
            <span>Delete Region</span>
          </Button>
        </div>
      </div>
    </div>
  );
}

export function RegionSettingsPanel({ region }: RegionSettingsPanelProps) {

  const RegionIcon = region.type === 'zoom' ? Camera : Scissors;
  const regionColor = region.type === 'zoom' ? 'text-primary' : 'text-destructive';
  const regionBg = region.type === 'zoom' ? 'bg-primary/10' : 'bg-destructive/10';

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-6 border-b border-sidebar-border">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center", regionBg)}>
              <RegionIcon className={cn("w-5 h-5", regionColor)} />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-sidebar-foreground capitalize">
                {region.type} Region
              </h2>
              <p className="text-sm text-muted-foreground">
                {region.type === 'zoom' ? 'Zoom and pan controls' : 'Cut segment settings'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 p-6 space-y-6 overflow-y-auto">
        {/* Zoom-specific Controls */}
        {region.type === 'zoom' && (
          <ZoomSettings region={region} />
        )}

        {/* Cut Region Info */}
        {region.type === 'cut' && (
          <div className="p-4 bg-destructive/5 border border-destructive/20 rounded-lg">
            <div className="flex items-start gap-3">
              <Scissors className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-foreground mb-1">Cut Segment</p>
                <p className="text-xs text-muted-foreground">This portion will be removed from the final video</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}