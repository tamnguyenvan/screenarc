import React, { useRef, useState, useEffect, useCallback } from 'react';
import { useEditorStore } from '../../../store/editorStore';
import { Loader2 } from 'lucide-react';

interface FocusPointPickerProps {
  regionId: string;
  targetX: number; // Now a normalized value [-0.5, 0.5]
  targetY: number; // Now a normalized value [-0.5, 0.5]
  startTime: number;
  onTargetChange: (coords: { x: number, y: number }) => void;
}

export function FocusPointPicker({ regionId, targetX, targetY, startTime, onTargetChange }: FocusPointPickerProps) {
  void regionId
  const { videoPath } = useEditorStore.getState();
  const containerRef = useRef<HTMLDivElement>(null);
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Effect to fetch the thumbnail when the component mounts or start time changes
  useEffect(() => {
    let isCancelled = false;
    const fetchFrame = async () => {
      if (!videoPath) return;

      setIsLoading(true);
      setThumbnailUrl(null);

      try {
        const dataUrl = await window.electronAPI.getVideoFrame({ videoPath, time: startTime });
        if (!isCancelled) {
          setThumbnailUrl(dataUrl);
        }
      } catch (error) {
        console.error("Failed to fetch video frame:", error);
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    };

    fetchFrame();

    return () => {
      isCancelled = true;
    };
  }, [startTime, videoPath]);


  // Handle mouse events to select focus point
  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const container = containerRef.current;
    if (!container) return;

    const updatePosition = (clientX: number, clientY: number) => {
      const rect = container.getBoundingClientRect();
      const x = clientX - rect.left;
      const y = clientY - rect.top;

      const clampedX = Math.max(0, Math.min(x, rect.width));
      const clampedY = Math.max(0, Math.min(y, rect.height));

      const normalizedX = (clampedX / rect.width) - 0.5;
      const normalizedY = (clampedY / rect.height) - 0.5;

      onTargetChange({ x: normalizedX, y: normalizedY });
    };

    updatePosition(e.clientX, e.clientY);

    const handleMouseMove = (moveEvent: MouseEvent) => {
      updatePosition(moveEvent.clientX, moveEvent.clientY);
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [onTargetChange]);

  const reticleLeft = (targetX + 0.5) * 100;
  const reticleTop = (targetY + 0.5) * 100;

  return (
    <div className="space-y-2">
      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Focus Point</h4>
      <p className="text-xs text-muted-foreground -mt-1 mb-3">Click and drag the circle to set the zoom point.</p>
      <div
        ref={containerRef}
        onMouseDown={handleMouseDown}
        className="relative aspect-video w-full bg-black rounded-lg overflow-hidden cursor-crosshair"
      >
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-muted/50">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        )}
        {thumbnailUrl && (
          <img
            src={thumbnailUrl}
            className="w-full h-full object-contain pointer-events-none"
            alt="Video Frame Preview"
          />
        )}
        <div
          className="absolute w-6 h-6 rounded-full border-2 border-primary bg-primary/20 backdrop-blur-sm shadow-lg pointer-events-none transform -translate-x-1/2 -translate-y-1/2 flex items-center justify-center"
          style={{
            left: `${reticleLeft}%`,
            top: `${reticleTop}%`,
          }}
        >
          <div className="w-1 h-1 bg-primary rounded-full" />
        </div>
      </div>
    </div>
  );
}