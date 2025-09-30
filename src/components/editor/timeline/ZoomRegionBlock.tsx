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
        'w-full h-full rounded-lg relative cursor-grab border-2',
        !isBeingDragged && 'transition-all duration-200',
        isSelected
          ? 'bg-accent border-primary -translate-y-2 shadow-lg shadow-primary/20'
          : 'bg-secondary border-border hover:border-border/80'
      )}
      style={{ willChange: 'transform, width' }}
      onMouseDown={(e) => onMouseDown(e, region, 'move')}
    >
      <div
        className="absolute left-0 top-0 w-4 h-full cursor-ew-resize rounded-l-md flex items-center justify-center z-30"
        onMouseDown={(e) => handleResizeMouseDown(e, 'resize-left')} >
        <div className={cn("w-0.5 h-1/2 rounded-full", isSelected ? "bg-primary" : "bg-border")} />
      </div>

      <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10 px-2">
        <div className="flex items-center gap-2 overflow-hidden">
          <Search
            className={cn(
              "w-4 h-4 shrink-0",
              isSelected ? "text-primary" : "text-foreground/80"
            )}
          />
          <span
            className={cn(
              "text-xs font-medium select-none whitespace-nowrap overflow-hidden text-ellipsis",
              isSelected ? "text-primary" : "text-foreground/80"
            )}
          >
            Zoom
          </span>
        </div>
      </div>


      <div
        className="absolute right-0 top-0 w-4 h-full cursor-ew-resize rounded-r-md flex items-center justify-center z-30"
        onMouseDown={(e) => handleResizeMouseDown(e, 'resize-right')} >
        <div className={cn("w-0.5 h-1/2 rounded-full", isSelected ? "bg-primary" : "bg-border")} />
      </div>
    </div>
  );
});

ZoomRegionBlock.displayName = 'ZoomRegionBlock';