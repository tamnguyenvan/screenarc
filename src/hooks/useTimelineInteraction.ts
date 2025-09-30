import { useState, useEffect, useCallback, RefObject, MouseEvent as ReactMouseEvent } from 'react';
import { useEditorStore } from '../store/editorStore';
import { TimelineRegion, CutRegion } from '../types/store';
import { TIMELINE } from '../lib/constants';

interface UseTimelineInteractionProps {
  timelineRef: RefObject<HTMLDivElement>;
  regionRefs: RefObject<Map<string, HTMLDivElement | null>>;
  pxToTime: (px: number) => number;
  timeToPx: (time: number) => number;
  updateVideoTime: (time: number) => void;
  duration: number;
}

/**
 * Custom hook to manage complex timeline interactions like dragging the playhead,
 * moving/resizing regions, and handling trim areas.
 * This encapsulates all mouse event listeners and dragging logic.
 */
export const useTimelineInteraction = ({
  timelineRef,
  regionRefs,
  pxToTime,
  timeToPx,
  updateVideoTime,
  duration,
}: UseTimelineInteractionProps) => {
  const {
    addCutRegion,
    deleteRegion,
    setPreviewCutRegion,
    updateRegion,
    setCurrentTime,
    setSelectedRegionId,
  } = useEditorStore();

  const [draggingRegion, setDraggingRegion] = useState<{
    id: string;
    type: 'move' | 'resize-left' | 'resize-right';
    initialX: number;
    initialStartTime: number;
    initialDuration: number;
  } | null>(null);
  const [isDraggingPlayhead, setIsDraggingPlayhead] = useState(false);
  const [isDraggingLeftStrip, setIsDraggingLeftStrip] = useState(false);
  const [isDraggingRightStrip, setIsDraggingRightStrip] = useState(false);
  const [isRegionHidden, setIsRegionHidden] = useState(false);

  const handleRegionMouseDown = useCallback(
    (e: ReactMouseEvent<HTMLDivElement>, region: TimelineRegion, type: 'move' | 'resize-left' | 'resize-right') => {
      e.stopPropagation();
      setIsRegionHidden(false);
      setSelectedRegionId(region.id);

      if (type === 'move' || type === 'resize-left') {
        updateVideoTime(region.startTime);
      } else if (type === 'resize-right') {
        updateVideoTime(region.startTime + region.duration);
      }

      const isTrimRegion = (region as CutRegion).trimType !== undefined;
      if (isTrimRegion && type === 'move') {
        return;
      }

      document.body.style.cursor = type === 'move' ? 'grabbing' : 'ew-resize';
      setDraggingRegion({
        id: region.id,
        type,
        initialX: e.clientX,
        initialStartTime: region.startTime,
        initialDuration: region.duration,
      });
    },
    [setSelectedRegionId, updateVideoTime]
  );

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDraggingPlayhead && timelineRef.current) {
        const rect = timelineRef.current.getBoundingClientRect();
        updateVideoTime(pxToTime(e.clientX - rect.left));
        return;
      }

      if (draggingRegion) {
        const element = regionRefs.current?.get(draggingRegion.id);
        if (!element) return;
        const deltaTime = pxToTime(e.clientX - draggingRegion.initialX);

        if (draggingRegion.type === 'move') {
          const maxStartTime = duration - draggingRegion.initialDuration;
          const intendedStartTime = draggingRegion.initialStartTime + deltaTime;
          const newStartTime = Math.max(0, Math.min(intendedStartTime, maxStartTime));
          updateVideoTime(newStartTime);
          element.style.transform = `translateX(${timeToPx(newStartTime - draggingRegion.initialStartTime)}px)`;
        } else if (draggingRegion.type === 'resize-right') {
          const maxDuration = duration - draggingRegion.initialStartTime;
          const intendedDuration = draggingRegion.initialDuration + deltaTime;
          if (intendedDuration < TIMELINE.REGION_DELETE_THRESHOLD) {
            element.style.display = 'none';
            setIsRegionHidden(true);
            updateVideoTime(draggingRegion.initialStartTime);
          } else {
            const newDuration = Math.min(intendedDuration, maxDuration);
            element.style.display = 'block';
            setIsRegionHidden(false);
            element.style.width = `${timeToPx(newDuration)}px`;
            updateVideoTime(draggingRegion.initialStartTime + newDuration);
          }
        } else if (draggingRegion.type === 'resize-left') {
          const initialEndTime = draggingRegion.initialStartTime + draggingRegion.initialDuration;
          const tentativeStartTime = Math.max(0, Math.min(draggingRegion.initialStartTime + deltaTime, initialEndTime));
          const newDuration = initialEndTime - tentativeStartTime;
          if (newDuration < TIMELINE.REGION_DELETE_THRESHOLD) {
            element.style.display = 'none';
            setIsRegionHidden(true);
            updateVideoTime(initialEndTime);
          } else {
            const newStartTime = tentativeStartTime;
            element.style.display = 'block';
            setIsRegionHidden(false);
            element.style.width = `${timeToPx(newDuration)}px`;
            element.style.transform = `translateX(${timeToPx(newStartTime - draggingRegion.initialStartTime)}px)`;
            updateVideoTime(newStartTime);
          }
        }
      }

      if ((isDraggingLeftStrip || isDraggingRightStrip) && timelineRef.current) {
        document.body.style.cursor = 'grabbing';
        const rect = timelineRef.current.getBoundingClientRect();
        const timeAtMouse = pxToTime(Math.max(0, e.clientX - rect.left));
        let newPreview: CutRegion | null = null;
        if (isDraggingLeftStrip) {
          const duration = Math.min(timeAtMouse, useEditorStore.getState().duration);
          newPreview = { id: 'preview-cut-left', type: 'cut', startTime: 0, duration, trimType: 'start', zIndex: 0 };
        } else {
          const startTime = Math.max(0, timeAtMouse);
          const duration = useEditorStore.getState().duration - startTime;
          newPreview = { id: 'preview-cut-right', type: 'cut', startTime, duration, trimType: 'end', zIndex: 0 };
        }
        setPreviewCutRegion(newPreview.duration >= TIMELINE.MINIMUM_REGION_DURATION ? newPreview : null);
      }
    };

    const handleMouseUp = (e: MouseEvent) => {
      document.body.style.cursor = 'default';
      setIsDraggingPlayhead(false);

      if (draggingRegion) {
        const element = regionRefs.current?.get(draggingRegion.id);
        if (element) {
          element.style.transform = 'translateX(0px)';
          element.style.width = '';
          element.style.display = 'block';
        }
        if (isRegionHidden) {
          deleteRegion(draggingRegion.id);
        } else {
          const deltaTime = pxToTime(e.clientX - draggingRegion.initialX);
          const finalUpdates: Partial<TimelineRegion> = {};
          if (draggingRegion.type === 'move') {
            const maxStartTime = duration - draggingRegion.initialDuration;
            finalUpdates.startTime = Math.max(0, Math.min(draggingRegion.initialStartTime + deltaTime, maxStartTime));
          } else if (draggingRegion.type === 'resize-right') {
            finalUpdates.startTime = draggingRegion.initialStartTime;
            const intendedDuration = draggingRegion.initialDuration + deltaTime;
            const maxDuration = duration - draggingRegion.initialStartTime;
            finalUpdates.duration = Math.max(TIMELINE.MINIMUM_REGION_DURATION, Math.min(intendedDuration, maxDuration));
          } else {
            const initialEndTime = draggingRegion.initialStartTime + draggingRegion.initialDuration;
            const newStartTime = Math.min(initialEndTime - TIMELINE.MINIMUM_REGION_DURATION, Math.max(0, draggingRegion.initialStartTime + deltaTime));
            finalUpdates.duration = initialEndTime - newStartTime;
            finalUpdates.startTime = newStartTime;
          }
          if (finalUpdates.duration! < TIMELINE.REGION_DELETE_THRESHOLD) {
            deleteRegion(draggingRegion.id);
          } else {
            updateRegion(draggingRegion.id, finalUpdates);
          }
        }
        setCurrentTime(useEditorStore.getState().currentTime);
        setDraggingRegion(null);
        setIsRegionHidden(false);
      }

      if (isDraggingLeftStrip || isDraggingRightStrip) {
        const finalPreview = useEditorStore.getState().previewCutRegion;
        if (finalPreview) {
          addCutRegion({ startTime: finalPreview.startTime, duration: finalPreview.duration, trimType: isDraggingLeftStrip ? 'start' : 'end' });
        }
      }

      setIsDraggingLeftStrip(false);
      setIsDraggingRightStrip(false);
      setPreviewCutRegion(null);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [
    draggingRegion, isDraggingPlayhead, isDraggingLeftStrip, isDraggingRightStrip,
    pxToTime, timeToPx, updateVideoTime, updateRegion, addCutRegion,
    setPreviewCutRegion, deleteRegion, setCurrentTime, duration, regionRefs, timelineRef, isRegionHidden
  ]);

  return {
    draggingRegionId: draggingRegion?.id ?? null,
    isDraggingPlayhead,
    handleRegionMouseDown,
    handlePlayheadMouseDown: (e: ReactMouseEvent<HTMLDivElement>) => {
      e.stopPropagation();
      setIsDraggingPlayhead(true);
      document.body.style.cursor = 'grabbing';
    },
    handleLeftStripMouseDown: () => {
      const state = useEditorStore.getState();
      const existingTrim = Object.values(state.cutRegions).find(r => r.trimType === 'start');
      if (existingTrim) deleteRegion(existingTrim.id);
      setIsDraggingLeftStrip(true);
    },
    handleRightStripMouseDown: () => {
      const state = useEditorStore.getState();
      const existingTrim = Object.values(state.cutRegions).find(r => r.trimType === 'end');
      if (existingTrim) deleteRegion(existingTrim.id);
      setIsDraggingRightStrip(true);
    },
  };
};