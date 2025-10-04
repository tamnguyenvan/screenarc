import { memo } from 'react';
import { TimelineRegion, CutRegion } from '../../../types/store';
import { cn } from '../../../lib/utils';
import { Scissors } from 'lucide-react';

interface CutRegionBlockProps {
  region: CutRegion;
  isSelected: boolean;
  isDraggable?: boolean;
  isBeingDragged: boolean;
  onMouseDown: (e: React.MouseEvent<HTMLDivElement>, region: TimelineRegion, type: 'move' | 'resize-left' | 'resize-right') => void;
  setRef: (el: HTMLDivElement | null) => void;
}

export const CutRegionBlock = memo(({
  region,
  isSelected,
  isDraggable = true,
  isBeingDragged,
  onMouseDown,
  setRef
}: CutRegionBlockProps) => {
  const isTrimRegion = !!region.trimType;
  const canMove = isDraggable && !isTrimRegion;
  const canResizeLeft = isDraggable && region.trimType !== 'start';
  const canResizeRight = isDraggable && region.trimType !== 'end';

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>, type: 'move' | 'resize-left' | 'resize-right') => {
    e.stopPropagation();
    if (!isDraggable) return;
    onMouseDown(e, region, type);
  };

  return (
    <div
      ref={setRef}
      data-region-id={region.id}
      className="w-full h-full relative"
      style={{ willChange: 'transform, width' }}
    >
      {/* Striped overlay above the region */}
      <div className="absolute top-0 left-0 w-full h-[230px] translate-y-[-200px] overflow-hidden rounded-t-lg pointer-events-none">
        <div className="absolute inset-0 bg-destructive/15" />
        <div 
          className="absolute inset-0 opacity-30"
          style={{
            backgroundImage: `repeating-linear-gradient(
              -45deg,
              transparent,
              transparent 8px,
              rgb(var(--destructive) / 0.15) 8px,
              rgb(var(--destructive) / 0.15) 16px
            )`
          }}
        />
      </div>

      <div
        className={cn(
          'absolute w-full h-14 top-1/2 -translate-y-1/2 flex items-center justify-center rounded-xl border-2 backdrop-blur-sm',
          !isBeingDragged && 'transition-all duration-200 ease-out',
          canMove ? 'cursor-grab active:cursor-grabbing' : 'cursor-default',
          isSelected
            ? 'bg-card/90 border-destructive transform -translate-y-[calc(50%+10px)] shadow-xl shadow-destructive/30'
            : 'bg-card/70 border-destructive/60 hover:border-destructive/80 hover:bg-card/80 hover:shadow-lg hover:shadow-destructive/10'
        )}
        onMouseDown={(e) => handleMouseDown(e, 'move')}
      >
        {canResizeLeft && (
          <div
            className="absolute left-0 top-0 w-5 h-full cursor-ew-resize rounded-l-xl flex items-center justify-center z-10 group"
            onMouseDown={(e) => handleMouseDown(e, 'resize-left')}
          >
            <div className="w-1 h-8 bg-destructive/50 rounded-full group-hover:bg-destructive group-hover:h-10 transition-all duration-150" />
          </div>
        )}
        
        <div className="pointer-events-none flex items-center gap-2.5 px-3">
          <Scissors className={cn(
            "w-5 h-5 transition-colors",
            isSelected ? "text-destructive" : "text-destructive/70"
          )} />
          <span className={cn(
            "text-xs font-semibold tracking-wide transition-colors",
            isSelected ? "text-destructive" : "text-destructive/70"
          )}>
            CUT
          </span>
        </div>
        
        {canResizeRight && (
          <div
            className="absolute right-0 top-0 w-5 h-full cursor-ew-resize rounded-r-xl flex items-center justify-center z-10 group"
            onMouseDown={(e) => handleMouseDown(e, 'resize-right')}
          >
            <div className="w-1 h-8 bg-destructive/50 rounded-full group-hover:bg-destructive group-hover:h-10 transition-all duration-150" />
          </div>
        )}
      </div>
    </div>
  );
});
CutRegionBlock.displayName = 'CutRegionBlock';