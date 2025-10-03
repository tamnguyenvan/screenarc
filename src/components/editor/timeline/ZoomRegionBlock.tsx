import { memo } from 'react';
import { TimelineRegion, ZoomRegion } from '../../../types/store';
import { cn } from '../../../lib/utils';
import { Search } from 'lucide-react';

interface ZoomRegionBlockProps {
  region: ZoomRegion;
  isSelected: boolean;
  isBeingDragged: boolean;
  onMouseDown: (e: React.MouseEvent<HTMLDivElement>, region: TimelineRegion, type: 'move' | 'resize-left' | 'resize-right') => void;
  setRef: (el: HTMLDivElement | null) => void;
}

export const ZoomRegionBlock = memo(({
  region,
  isSelected,
  isBeingDragged,
  onMouseDown,
  setRef
}: ZoomRegionBlockProps) => {
  const handleResizeMouseDown = (e: React.MouseEvent<HTMLDivElement>, type: 'resize-left' | 'resize-right') => {
    e.stopPropagation();
    onMouseDown(e, region, type);
  };

  return (
    <div
      ref={setRef}
      data-region-id={region.id}
      className={cn(
        'absolute w-full h-14 top-1/2 -translate-y-1/2 rounded-xl cursor-grab active:cursor-grabbing border-2 backdrop-blur-sm',
        !isBeingDragged && 'transition-all duration-200 ease-out',
        isSelected
          ? 'bg-accent/80 border-primary -translate-y-[calc(50%+10px)] shadow-xl shadow-primary/30 scale-105'
          : 'bg-secondary/70 border-border/60 hover:border-primary/40 hover:bg-accent/60 hover:shadow-lg hover:shadow-primary/10'
      )}
      style={{ willChange: 'transform, width' }}
      onMouseDown={(e) => onMouseDown(e, region, 'move')}
    >
      <div
        className="absolute left-0 top-0 w-5 h-full cursor-ew-resize rounded-l-xl flex items-center justify-center z-10 group"
        onMouseDown={(e) => handleResizeMouseDown(e, 'resize-left')} 
      >
        <div className={cn(
          "w-1 h-8 rounded-full transition-all duration-150",
          isSelected 
            ? "bg-primary group-hover:h-10" 
            : "bg-border/60 group-hover:bg-primary group-hover:h-10"
        )} />
      </div>

      <div className="absolute inset-0 flex items-center justify-center pointer-events-none px-3">
        <div className="flex items-center gap-2.5 overflow-hidden">
          <Search className={cn(
            "w-5 h-5 shrink-0 transition-colors",
            isSelected ? "text-primary" : "text-foreground/70"
          )} />
          <span className={cn(
            "text-xs font-semibold tracking-wide select-none whitespace-nowrap overflow-hidden text-ellipsis transition-colors",
            isSelected ? "text-primary" : "text-foreground/70"
          )}>
            ZOOM
          </span>
        </div>
      </div>

      <div
        className="absolute right-0 top-0 w-5 h-full cursor-ew-resize rounded-r-xl flex items-center justify-center z-10 group"
        onMouseDown={(e) => handleResizeMouseDown(e, 'resize-right')} 
      >
        <div className={cn(
          "w-1 h-8 rounded-full transition-all duration-150",
          isSelected 
            ? "bg-primary group-hover:h-10" 
            : "bg-border/60 group-hover:bg-primary group-hover:h-10"
        )} />
      </div>
    </div>
  );
});

ZoomRegionBlock.displayName = 'ZoomRegionBlock';