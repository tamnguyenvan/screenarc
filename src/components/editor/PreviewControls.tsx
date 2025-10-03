import React from 'react';
import { Play, Pause, Scissors, Plus, ZoomIn, Trash2, Undo, Redo } from 'lucide-react';
import { useEditorStore } from '../../store/editorStore';
import { AspectRatio } from '../../types/store';
import { Button } from '../ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Slider } from '../ui/slider';

const Rewind = (props: React.SVGProps<SVGSVGElement>) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={20} height={20} viewBox="0 0 256 256" fill="currentColor" {...props}>
    <path d="M223.77,58a16,16,0,0,0-16.25.53L128,109.14V71.84A15.91,15.91,0,0,0,103.52,58.5L15.33,114.66a15.8,15.8,0,0,0,0,26.68l88.19,56.16A15.91,15.91,0,0,0,128,184.16v-37.3l79.52,50.64A15.91,15.91,0,0,0,232,184.16V71.84A15.83,15.83,0,0,0,223.77,58ZM112,183.93,24.18,128,112,72.06Zm104,0L128.18,128,216,72.06Z" />
  </svg>
);

export function PreviewControls({ videoRef }: { videoRef: React.RefObject<HTMLVideoElement> }) {
  const {
    isPlaying, togglePlay, setCurrentTime,
    aspectRatio, setAspectRatio, addZoomRegion, addCutRegion,
    timelineZoom, setTimelineZoom,
    selectedRegionId, deleteRegion
  } = useEditorStore();

  const { undo, redo, pastStates, futureStates } = useEditorStore.temporal.getState();

  const handleRewind = () => {
    const cutRegionsMap = useEditorStore.getState().cutRegions;
    const startTrimRegion = Object.values(cutRegionsMap).find(r => r.trimType === 'start');
    const rewindTime = startTrimRegion ? startTrimRegion.startTime + startTrimRegion.duration : 0;
    setCurrentTime(rewindTime);
    if (videoRef.current) {
      videoRef.current.currentTime = rewindTime;
    }
  }

  const handleDelete = () => {
    if (selectedRegionId) {
      deleteRegion(selectedRegionId);
    }
  }

  return (
    <div className="relative h-[72px] bg-card/95 backdrop-blur-xl border-t border-border/40 flex items-center justify-between px-6 shadow-lg">
      {/* Subtle gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-b from-card/50 to-transparent pointer-events-none" />
      
      {/* Left Controls - Timeline Tools */}
      <div className="relative flex items-center gap-3">
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-muted/30 border border-border/40">
          <Button 
            variant="toolbar" 
            size="default" 
            title="Add Zoom Region" 
            className="h-9 px-3 text-sm font-medium shadow-sm hover:shadow transition-shadow" 
            onClick={() => addZoomRegion()}
          >
            <Plus className="w-4 h-4 mr-1.5" /> 
            <span>Zoom</span>
          </Button>
          <Button 
            variant="toolbar" 
            size="default" 
            title="Add Cut Region" 
            className="h-9 px-3 text-sm font-medium shadow-sm hover:shadow transition-shadow" 
            onClick={() => addCutRegion()}
          >
            <Scissors className="w-4 h-4 mr-1.5" /> 
            <span>Cut</span>
          </Button>
          <div className="w-px h-6 bg-border/50 mx-1" />
          <Button 
            variant="toolbar" 
            size="icon" 
            title="Delete Selected Region" 
            className="h-9 w-9 shadow-sm hover:shadow transition-shadow" 
            onClick={handleDelete} 
            disabled={!selectedRegionId}
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
        
        <div className="flex items-center gap-2.5 px-3 py-1.5 rounded-lg bg-muted/30 border border-border/40">
          <ZoomIn className="w-4 h-4 text-muted-foreground" />
          <div className="w-28">
            <Slider 
              min={1} 
              max={4} 
              step={0.5} 
              value={timelineZoom} 
              onChange={setTimelineZoom} 
            />
          </div>
        </div>
      </div>

      {/* Center Playback Controls */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center gap-4">
        <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-muted/30 border border-border/40">
          <Button 
            variant="toolbar" 
            size="icon" 
            title="Undo (Ctrl+Z)" 
            className="h-9 w-9 shadow-sm hover:shadow transition-shadow" 
            onClick={() => undo()} 
            disabled={pastStates.length === 0}
          >
            <Undo className="w-4 h-4" />
          </Button>
          <Button 
            variant="toolbar" 
            size="icon" 
            title="Redo (Ctrl+Y)" 
            className="h-9 w-9 shadow-sm hover:shadow transition-shadow" 
            onClick={() => redo()} 
            disabled={futureStates.length === 0}
          >
            <Redo className="w-4 h-4" />
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <Button 
            variant="toolbar" 
            size="icon" 
            title="Rewind to Start" 
            className="rounded-full h-10 w-10 shadow-md hover:shadow-lg transition-all" 
            onClick={handleRewind}
          >
            <Rewind className="w-5 h-5" />
          </Button>

          <Button 
            variant="default" 
            size="icon" 
            title="Play/Pause (Space)" 
            className="rounded-full !w-14 !h-14 shadow-xl hover:shadow-2xl transition-all hover:scale-105 active:scale-95" 
            onClick={togglePlay}
          >
            {isPlaying ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6 ml-0.5" />}
          </Button>
        </div>
      </div>

      {/* Right Controls - Aspect Ratio */}
      <div className="relative flex items-center gap-2.5 px-3 py-1.5 rounded-lg bg-muted/30 border border-border/40">
        <span className="text-sm font-medium text-muted-foreground">Aspect</span>
        <div className="w-40">
          <Select value={aspectRatio} onValueChange={(value) => setAspectRatio(value as AspectRatio)}>
            <SelectTrigger className="h-9 text-sm border-border/50 bg-card/80 backdrop-blur-sm shadow-sm hover:shadow transition-shadow">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="16:9">16:9 Landscape</SelectItem>
              <SelectItem value="9:16">9:16 Portrait</SelectItem>
              <SelectItem value="4:3">4:3 Standard</SelectItem>
              <SelectItem value="3:4">3:4 Tall</SelectItem>
              <SelectItem value="1:1">1:1 Square</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}