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
  <div className="h-12 sticky overflow-hidden top-0 left-0 right-0 z-10 border-b-2 border-border/60 bg-gradient-to-b from-muted/80 to-muted/40 pt-2">
    {ticks.map(({ time, type }) => (
      <div key={`${type}-${time}`} className="absolute top-2 h-full" style={{ left: `${timeToPx(time)}px` }}>
        <div className={cn("timeline-tick absolute top-0 left-1/2 -translate-x-1/2 w-px", type === 'major' ? 'h-5' : 'h-2.5')} />
        {type === 'major' && (
          <span className="absolute top-5 left-0.5 text-xs text-foreground/70 font-mono font-medium">
            {formatTimeFunc(time)}
          </span>
        )}
      </div>
    ))}
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
  const { zoomRegions: zoomRegionsMap, cutRegions: cutRegionsMap } = useAllRegions();
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

  const allCutRegionsToRender = useMemo(() => {
    const existingCuts = Object.values(cutRegionsMap);
    if (previewCutRegion && !existingCuts.some(c => c.trimType === previewCutRegion.trimType)) {
      return [...existingCuts, previewCutRegion];
    }
    return existingCuts;
  }, [cutRegionsMap, previewCutRegion]);

  const zoomRegions = useMemo(() => Object.values(zoomRegionsMap), [zoomRegionsMap]);

  return (
    <div className="h-full flex flex-col bg-background p-4">
      <div className="h-full flex flex-row rounded-xl overflow-hidden shadow-sm bg-card border border-border/80">
        <div className="w-8 shrink-0 h-full bg-card flex items-center justify-center transition-colors cursor-ew-resize select-none border-r border-border/80 hover:bg-accent/50" onMouseDown={handleLeftStripMouseDown}>
          <Scissors size={16} className="text-muted-foreground" />
        </div>
        <div ref={containerRef} className="flex-1 overflow-x-auto overflow-y-hidden bg-card/50" onMouseDown={e => {
          if (duration === 0 || (e.target as HTMLElement).closest('[data-region-id]')) return;
          const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
          const clickX = e.clientX - rect.left + (e.currentTarget as HTMLDivElement).scrollLeft;
          updateVideoTime(pxToTime(clickX));
          setSelectedRegionId(null);
        }}>
          <div ref={timelineRef} className="relative h-full min-w-full overflow-hidden" style={{ width: `${timeToPx(duration)}px` }}>
            <Ruler ticks={rulerTicks} timeToPx={timeToPx} formatTime={formatTime} />
            <div className="absolute top-0 left-0 right-0 bottom-0 pointer-events-none">
              {allCutRegionsToRender.map(region => (
                <div key={region.id} className="absolute top-0 h-full pointer-events-auto" style={{ left: `${timeToPx(region.startTime)}px`, width: `${timeToPx(region.duration)}px`, zIndex: selectedRegionId === region.id ? 100 : (region.trimType ? 5 : region.zIndex ?? 10) }}>
                  <CutRegionBlock region={region} isSelected={selectedRegionId === region.id} isDraggable={region.id !== previewCutRegion?.id} isBeingDragged={draggingRegionId === region.id} onMouseDown={handleRegionMouseDown} setRef={el => regionRefs.current.set(region.id, el)} />
                </div>
              ))}
            </div>
            <div className="relative pt-6 space-y-4">
              <div className="h-24 relative bg-gradient-to-b from-background/50 to-background/20">
                {zoomRegions.map(region => (
                  <div key={region.id} className="absolute h-14" style={{ left: `${timeToPx(region.startTime)}px`, width: `${timeToPx(region.duration)}px`, zIndex: selectedRegionId === region.id ? 100 : (region.zIndex ?? 10) }}>
                    <ZoomRegionBlock region={region} isSelected={selectedRegionId === region.id} isBeingDragged={draggingRegionId === region.id} onMouseDown={handleRegionMouseDown} setRef={el => regionRefs.current.set(region.id, el)} />
                  </div>
                ))}
              </div>
            </div>
            {duration > 0 &&
              <div ref={playheadRef} className="absolute top-0 bottom-0 z-[200]" style={{ transform: `translateX(${timeToPx(currentTime)}px)`, pointerEvents: "none" }}>
                <Playhead height={Math.floor((timelineRef.current?.clientHeight ?? 200) * 0.9)} isDragging={false} onMouseDown={handlePlayheadMouseDown} />
              </div>
            }
          </div>
        </div>
        <div className="w-8 shrink-0 h-full bg-card flex items-center justify-center transition-colors cursor-ew-resize select-none border-l border-border/80 hover:bg-accent/50" onMouseDown={handleRightStripMouseDown}>
          <FlipScissorsIcon className="text-muted-foreground size-4" />
        </div>
      </div>
    </div>
  );
}