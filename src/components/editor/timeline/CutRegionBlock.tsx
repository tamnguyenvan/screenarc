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
      <div className="absolute top-0 left-0 w-full h-[230px] bg-destructive/20 translate-y-[-200px]" />

      <div
        className={cn(
          'absolute w-full h-14 top-1/2 -translate-y-1/2 flex items-center justify-center rounded-lg border-2',
          !isBeingDragged && 'transition-all duration-200',
          canMove ? 'cursor-grab' : 'cursor-default',
          isSelected
            ? 'bg-card border-destructive transform -translate-y-[calc(50%+8px)] shadow-lg shadow-destructive/20'
            : 'bg-card border-destructive/50 hover:border-destructive/80'
        )}
        onMouseDown={(e) => handleMouseDown(e, 'move')}
      >
        {canResizeLeft && (
          <div
            className="absolute left-0 top-0 w-4 h-full cursor-ew-resize rounded-l-md flex items-center justify-center z-10 group"
            onMouseDown={(e) => handleMouseDown(e, 'resize-left')}
          >
            <div className="w-0.5 h-1/2 bg-destructive/70 rounded-full group-hover:bg-destructive transition-colors" />
          </div>
        )}
        <div className="pointer-events-none flex items-center gap-2 px-2">
          <Scissors className="w-4 h-4 text-destructive" />
        </div>
        {canResizeRight && (
          <div
            className="absolute right-0 top-0 w-4 h-full cursor-ew-resize rounded-r-md flex items-center justify-center z-10 group"
            onMouseDown={(e) => handleMouseDown(e, 'resize-right')}
          >
            <div className="w-0.5 h-1/2 bg-destructive/70 rounded-full group-hover:bg-destructive transition-colors" />
          </div>
        )}
      </div>
    </div>
  );
});
CutRegionBlock.displayName = 'CutRegionBlock';