import React, {
  useRef, useState,
  useEffect, useCallback, useMemo, memo
} from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useEditorStore, useAllRegions } from '../../store/editorStore';
import { ZoomRegionBlock } from './timeline/ZoomRegionBlock';
import { CutRegionBlock } from './timeline/CutRegionBlock';
import { Playhead } from './timeline/Playhead';
import { cn } from '../../lib/utils';
import { Scissors } from 'lucide-react';
import { formatTime, calculateRulerInterval } from '../../lib/utils';
import { useTimelineInteraction } from '../../hooks/useTimelineInteraction';

// Memoized Ruler component
const Ruler = memo(({ ticks, timeToPx, formatTime: formatTimeFunc }: {
  ticks: { time: number; type: string }[];
  timeToPx: (time: number) => number;
  formatTime: (seconds: number) => string;
}) => (
  <div className="h-14 sticky overflow-hidden top-0 left-0 right-0 z-10 border-b border-border/50 bg-gradient-to-b from-card via-card/95 to-card/80 backdrop-blur-xl">
    <div className="absolute inset-0 bg-gradient-to-b from-muted/20 to-transparent pointer-events-none" />
    <div className="relative h-full pt-3">
      {ticks.map(({ time, type }) => (
        <div key={`${type}-${time}`} className="absolute top-3 h-full" style={{ left: `${timeToPx(time)}px` }}>
          <div className={cn(
            "timeline-tick absolute top-0 left-1/2 -translate-x-1/2 w-px transition-opacity",
            type === 'major' ? 'h-6 opacity-40' : 'h-3 opacity-20'
          )} />
          {type === 'major' && (
            <span className="absolute top-7 left-0.5 text-[11px] text-muted-foreground font-mono font-medium tracking-tight">
              {formatTimeFunc(time)}
            </span>
          )}
        </div>
      ))}
    </div>
  </div>
));
Ruler.displayName = 'Ruler';

const FlipScissorsIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={24} height={24} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...props} >
    <g transform="translate(24,0) scale(-1,1)">
      <circle cx={6} cy={6} r={3} /> <path d="M8.12 8.12 12 12" /> <path d="M20 4 8.12 15.88" /> <circle cx={6} cy={18} r={3} /> <path d="M14.8 14.8 20 20" />
    </g>
  </svg>
);


export function Timeline({ videoRef }: { videoRef: React.RefObject<HTMLVideoElement> }) {
  const { currentTime, duration, timelineZoom, previewCutRegion, selectedRegionId, isPlaying } = useEditorStore(
    useShallow(state => ({
      currentTime: state.currentTime,
      duration: state.duration,
      timelineZoom: state.timelineZoom,
      previewCutRegion: state.previewCutRegion,
      selectedRegionId: state.selectedRegionId,
      isPlaying: state.isPlaying
    }))
  );
  const { setCurrentTime, setSelectedRegionId } = useEditorStore();

  const containerRef = useRef<HTMLDivElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const playheadRef = useRef<HTMLDivElement>(null);
  const regionRefs = useRef<Map<string, HTMLDivElement | null>>(new Map());
  const animationFrameRef = useRef<number>();
  const [containerWidth, setContainerWidth] = useState(0);

  useEffect(() => {
    if (containerRef.current) setContainerWidth(containerRef.current.clientWidth);
    const observer = new ResizeObserver(entries => entries[0] && setContainerWidth(entries[0].contentRect.width));
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  const pixelsPerSecond = useMemo(() => {
    if (duration === 0 || containerWidth === 0) return 200;
    return (containerWidth / duration) * timelineZoom;
  }, [duration, containerWidth, timelineZoom]);

  const timeToPx = useCallback((time: number) => time * pixelsPerSecond, [pixelsPerSecond]);
  const pxToTime = useCallback((px: number) => px / pixelsPerSecond, [pixelsPerSecond]);

  const updateVideoTime = useCallback((time: number) => {
    const clampedTime = Math.max(0, Math.min(time, duration));
    setCurrentTime(clampedTime);
    if (videoRef.current) videoRef.current.currentTime = clampedTime;
  }, [duration, setCurrentTime, videoRef]);

  const {
    draggingRegionId,
    handleRegionMouseDown,
    handlePlayheadMouseDown,
    handleLeftStripMouseDown,
    handleRightStripMouseDown,
  } = useTimelineInteraction({
    timelineRef,
    regionRefs,
    pxToTime,
    timeToPx,
    updateVideoTime,
    duration,
  });

  const rulerTicks = useMemo(() => {
    if (duration <= 0 || pixelsPerSecond <= 0) return [];
    const { major, minor } = calculateRulerInterval(pixelsPerSecond);
    const ticks = [];
    for (let time = 0; time <= duration; time += major) {
      ticks.push({ time: parseFloat(time.toPrecision(10)), type: 'major' });
    }
    for (let time = 0; time <= duration; time += minor) {
      const preciseTime = parseFloat(time.toPrecision(10));
      if (preciseTime % major !== 0) {
        ticks.push({ time: preciseTime, type: 'minor' });
      }
    }
    return ticks;
  }, [duration, pixelsPerSecond]);

  useEffect(() => {
    const animate = () => {
      if (videoRef.current && playheadRef.current) {
        playheadRef.current.style.transform = `translateX(${timeToPx(videoRef.current.currentTime)}px)`;
      }
      animationFrameRef.current = requestAnimationFrame(animate);
    };
    if (isPlaying) {
      animationFrameRef.current = requestAnimationFrame(animate);
    }
    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    };
  }, [isPlaying, timeToPx, videoRef]);

  useEffect(() => {
    if (!isPlaying && playheadRef.current) {
      playheadRef.current.style.transform = `translateX(${timeToPx(currentTime)}px)`;
    }
  }, [currentTime, isPlaying, timeToPx]);

  const { zoomRegions, cutRegions } = useAllRegions();

  const allRegionsToRender = useMemo(() => {
    const combined = [
      ...Object.values(zoomRegions),
      ...Object.values(cutRegions),
    ];
    if (previewCutRegion) {
      combined.push(previewCutRegion);
    }
    return combined;
  }, [zoomRegions, cutRegions, previewCutRegion]);

  return (
    <div className="h-full flex flex-col bg-background/50 p-3">
      <div className="h-full flex flex-row rounded-xl overflow-hidden shadow-xl bg-card/95 backdrop-blur-xl border border-border/60">
        <div 
          className="w-10 shrink-0 h-full bg-gradient-to-b from-card to-card/80 flex items-center justify-center transition-all duration-200 cursor-ew-resize select-none border-r border-border/50 hover:bg-accent/30 active:bg-accent/50 group" 
          onMouseDown={handleLeftStripMouseDown}
        >
          <Scissors size={18} className="text-muted-foreground/60 group-hover:text-muted-foreground transition-colors" />
        </div>
        
        <div 
          ref={containerRef} 
          className="flex-1 overflow-x-auto overflow-y-hidden bg-gradient-to-b from-muted/5 to-background/5" 
          onMouseDown={e => {
            if (duration === 0 || (e.target as HTMLElement).closest('[data-region-id]')) return;
            const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
            const clickX = e.clientX - rect.left + (e.currentTarget as HTMLDivElement).scrollLeft;
            updateVideoTime(pxToTime(clickX));
            setSelectedRegionId(null);
          }}
        >
          <div 
            ref={timelineRef} 
            className="relative h-full min-w-full overflow-hidden" 
            style={{ width: `${timeToPx(duration)}px` }}
          >
            <Ruler ticks={rulerTicks} timeToPx={timeToPx} formatTime={formatTime} />
            
            <div className="absolute top-14 left-0 w-full" style={{ height: 'calc(100% - 3.5rem)' }}>
              {allRegionsToRender.map(region => {
                const isSelected = selectedRegionId === region.id;
                const zIndex = isSelected ? 100 : region.zIndex ?? 1;

                return (
                  <div
                    key={region.id}
                    className="absolute top-0 h-full"
                    style={{
                      left: `${timeToPx(region.startTime)}px`,
                      width: `${timeToPx(region.duration)}px`,
                      zIndex: zIndex,
                    }}
                  >
                    {region.type === 'zoom' && (
                      <ZoomRegionBlock
                        region={region}
                        isSelected={isSelected}
                        isBeingDragged={draggingRegionId === region.id}
                        onMouseDown={handleRegionMouseDown}
                        setRef={el => regionRefs.current.set(region.id, el)}
                      />
                    )}
                    {region.type === 'cut' && (
                      <CutRegionBlock
                        region={region}
                        isSelected={isSelected}
                        isDraggable={region.id !== previewCutRegion?.id}
                        isBeingDragged={draggingRegionId === region.id}
                        onMouseDown={handleRegionMouseDown}
                        setRef={el => regionRefs.current.set(region.id, el)}
                      />
                    )}
                  </div>
                );
              })}
            </div>
            
            {duration > 0 && (
              <div 
                ref={playheadRef} 
                className="absolute top-0 bottom-0 z-[200]" 
                style={{ transform: `translateX(${timeToPx(currentTime)}px)`, pointerEvents: "none" }}
              >
                <Playhead 
                  height={Math.floor((timelineRef.current?.clientHeight ?? 200) * 0.9)} 
                  isDragging={false} 
                  onMouseDown={handlePlayheadMouseDown} 
                />
              </div>
            )}
          </div>
        </div>
        
        <div 
          className="w-10 shrink-0 h-full bg-gradient-to-b from-card to-card/80 flex items-center justify-center transition-all duration-200 cursor-ew-resize select-none border-l border-border/50 hover:bg-accent/30 active:bg-accent/50 group" 
          onMouseDown={handleRightStripMouseDown}
        >
          <FlipScissorsIcon className="text-muted-foreground/60 group-hover:text-muted-foreground transition-colors size-[18px]" />
        </div>
      </div>
    </div>
  );
}