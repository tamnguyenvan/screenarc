import React, { useEffect, useRef, memo, useState, useCallback } from 'react';
import { useEditorStore, usePlaybackState } from '../../store/editorStore';
import { Film, Play, Pause, Fullscreen, Shrink } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { formatTime } from '../../lib/utils';
import { Slider } from '../ui/slider';
import { Button } from '../ui/button';
import { drawScene } from '../../lib/renderer';
import { cn } from '../../lib/utils';

export const Preview = memo(({ videoRef }: { videoRef: React.RefObject<HTMLVideoElement> }) => {
  const {
    videoUrl, cutRegions,
    webcamVideoUrl, duration, currentTime, togglePlay,
    isPreviewFullScreen, togglePreviewFullScreen, frameStyles,
    isWebcamVisible, webcamPosition, webcamStyles, videoDimensions,
    canvasDimensions
  } = useEditorStore(
    useShallow(state => ({
      videoUrl: state.videoUrl,
      cutRegions: state.cutRegions,
      webcamVideoUrl: state.webcamVideoUrl,
      duration: state.duration,
      currentTime: state.currentTime,
      togglePlay: state.togglePlay,
      isPreviewFullScreen: state.isPreviewFullScreen,
      togglePreviewFullScreen: state.togglePreviewFullScreen,
      frameStyles: state.frameStyles,
      isWebcamVisible: state.isWebcamVisible,
      webcamPosition: state.webcamPosition,
      webcamStyles: state.webcamStyles,
      videoDimensions: state.videoDimensions,
      canvasDimensions: state.canvasDimensions,
    })));

  const { setPlaying, setCurrentTime, setDuration, setVideoDimensions } = useEditorStore.getState();
  const { isPlaying, isCurrentlyCut } = usePlaybackState();

  const [bgImage, setBgImage] = useState<HTMLImageElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const webcamVideoRef = useRef<HTMLVideoElement>(null);
  const animationFrameId = useRef<number>();
  const [controlBarWidth, setControlBarWidth] = useState(0);

  // --- Start of Changes for Fullscreen Controls ---
  const [isControlBarVisible, setIsControlBarVisible] = useState(false);
  const inactivityTimerRef = useRef<number | null>(null);
  const previewContainerRef = useRef<HTMLDivElement>(null);

  // This effect handles the auto-hiding control bar in fullscreen mode.
  useEffect(() => {
    if (!isPreviewFullScreen) {
      if (inactivityTimerRef.current) {
        window.clearTimeout(inactivityTimerRef.current);
        inactivityTimerRef.current = null;
      }
      return; // Do nothing if not in fullscreen
    }

    // Start with controls hidden
    setIsControlBarVisible(false);

    const showControlsAndSetTimer = () => {
      setIsControlBarVisible(true);
      if (inactivityTimerRef.current) {
        window.clearTimeout(inactivityTimerRef.current);
      }
      inactivityTimerRef.current = window.setTimeout(() => {
        setIsControlBarVisible(false);
      }, 3000); // Hide after 3 seconds of inactivity
    };

    const container = previewContainerRef.current;
    if (container) {
      container.addEventListener('mousemove', showControlsAndSetTimer);
    }
    
    // Cleanup function
    return () => {
      if (inactivityTimerRef.current) {
        window.clearTimeout(inactivityTimerRef.current);
      }
      if (container) {
        container.removeEventListener('mousemove', showControlsAndSetTimer);
      }
    };
  }, [isPreviewFullScreen]);
  // --- End of Changes for Fullscreen Controls ---

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resizeObserver = new ResizeObserver(entries => {
      if (entries[0]) {
        const newWidth = entries[0].contentRect.width;
        if (newWidth > 0) { setControlBarWidth(newWidth); }
      }
    });
    resizeObserver.observe(canvas);
    return () => { resizeObserver.disconnect(); };
  }, [canvasDimensions]);

  useEffect(() => {
    const background = frameStyles.background;
    if ((background.type === 'image' || background.type === 'wallpaper') && background.imageUrl) {
      const img = new Image();
      img.onload = () => { setBgImage(img); };
      const finalUrl = background.imageUrl.startsWith('blob:') ? background.imageUrl : `media://${background.imageUrl}`;
      img.src = finalUrl;
    } else {
      setBgImage(null);
    }
  }, [frameStyles.background]);

  const renderCanvas = useCallback(async () => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    const webcamVideo = webcamVideoRef.current;
    const state = useEditorStore.getState();
    const ctx = canvas?.getContext('2d');
    if (!canvas || !video || !ctx || !state.videoDimensions.width) {
      if (state.isPlaying) animationFrameId.current = requestAnimationFrame(renderCanvas);
      return;
    }
    await drawScene(ctx, state, video, webcamVideo, video.currentTime, canvas.width, canvas.height, bgImage);
    if (state.isPlaying) {
      animationFrameId.current = requestAnimationFrame(renderCanvas);
    }
  }, [videoRef, bgImage]);

  useEffect(() => {
    if (isPlaying) {
      animationFrameId.current = requestAnimationFrame(renderCanvas);
    } else {
      renderCanvas();
    }
    return () => {
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
      }
    };
  }, [isPlaying, currentTime, renderCanvas, canvasDimensions, frameStyles, isWebcamVisible, webcamPosition, webcamStyles, videoDimensions]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const webcamVideo = webcamVideoRef.current;
    if (isPlaying) {
      video.play().catch(console.error);
      webcamVideo?.play().catch(console.error);
    } else {
      video.pause();
      webcamVideo?.pause();
    }
  }, [isPlaying, videoRef]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (isPlaying && isCurrentlyCut) {
      const allCutRegions = Object.values(useEditorStore.getState().cutRegions);
      const activeCutRegion = allCutRegions.find(r => video.currentTime >= r.startTime && video.currentTime < (r.startTime + r.duration));
      if (activeCutRegion) {
        video.currentTime = activeCutRegion.startTime + activeCutRegion.duration;
        setCurrentTime(video.currentTime);
      }
    }
  }, [isCurrentlyCut, isPlaying, videoRef, setCurrentTime]);

  const handleTimeUpdate = () => {
    if (!videoRef.current) return;
    const endTrimRegion = Object.values(cutRegions).find(r => r.trimType === 'end');
    if (endTrimRegion && videoRef.current.currentTime >= endTrimRegion.startTime) {
      videoRef.current.currentTime = endTrimRegion.startTime;
      videoRef.current.pause();
    }
    if (webcamVideoRef.current) {
      webcamVideoRef.current.currentTime = videoRef.current.currentTime;
    }
    setCurrentTime(videoRef.current.currentTime);
  };

  // --- Start of Bug Fix for Rewind on Fullscreen ---
  const handleLoadedMetadata = () => {
    const video = videoRef.current;
    if (video) {
      setDuration(video.duration);
      setVideoDimensions({ width: video.videoWidth, height: video.videoHeight });

      const timeFromStore = useEditorStore.getState().currentTime;

      const onSeekComplete = () => {
        renderCanvas();
        video.removeEventListener('seeked', onSeekComplete);
      };

      video.addEventListener('seeked', onSeekComplete);
      // Restore the video's time from the store to prevent rewinding
      video.currentTime = timeFromStore;
    }
  };
  // --- End of Bug Fix ---

  const handleWebcamLoadedMetadata = useCallback(() => {
    const mainVideo = videoRef.current;
    const webcamVideo = webcamVideoRef.current;
    if (mainVideo && webcamVideo) {
      webcamVideo.currentTime = mainVideo.currentTime;
      if (mainVideo.paused) {
        webcamVideo.pause();
      } else {
        webcamVideo.play().catch(console.error);
      }
    }
  }, [videoRef]);

  const handleScrub = (value: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = value;
      setCurrentTime(value);
    }
  };

  return (
    <div ref={previewContainerRef} className="w-full h-full flex flex-col items-center justify-center relative">
      <div
        id="preview-container"
        className="transition-all duration-300 ease-out flex items-center justify-center w-full flex-1 min-h-0"
      >
        {videoUrl ? (
          <canvas
            ref={canvasRef}
            width={canvasDimensions.width}
            height={canvasDimensions.height}
            style={{ maxWidth: '100%', maxHeight: '100%', width: 'auto', height: 'auto' }}
            className="rounded-lg shadow-2xl"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-muted/30 to-muted/10 border-2 border-dashed border-border/40 rounded-xl flex flex-col items-center justify-center text-muted-foreground gap-4 backdrop-blur-sm">
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-primary/10 to-primary/5 flex items-center justify-center backdrop-blur-md border border-border/30 shadow-lg">
              <Film className="w-10 h-10 text-primary/60" />
            </div>
            <div className="text-center space-y-1">
              <p className="text-lg font-semibold text-foreground/80">No project loaded</p>
              <p className="text-sm text-muted-foreground/70">Load a project to begin editing</p>
            </div>
          </div>
        )}
      </div>

      <video
        ref={videoRef}
        src={videoUrl || undefined}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        style={{ display: 'none' }}
      />
      {webcamVideoUrl && (
        <video
          ref={webcamVideoRef}
          src={webcamVideoUrl}
          muted
          playsInline
          onLoadedMetadata={handleWebcamLoadedMetadata}
          style={{ display: 'none' }}
        />
      )}

      {/* Control bar */}
      {videoUrl && (
        <div
          className={cn(
            "w-full mt-2 transition-opacity duration-300",
            isPreviewFullScreen && "absolute bottom-6 left-0 right-0 mx-auto px-4 z-10",
            isPreviewFullScreen && !isControlBarVisible && "opacity-0 pointer-events-none"
          )}
          style={{ maxWidth: isPreviewFullScreen ? "min(90%, 800px)" : "100%" }}
        >
          <div className="bg-card/90 backdrop-blur-xl border border-border/40 rounded-xl px-4 py-2.5 flex items-center gap-4 shadow-lg max-w-full mx-auto"
               style={{ width: isPreviewFullScreen ? 'auto' : controlBarWidth, minWidth: isPreviewFullScreen ? 'auto' : 400 }}
          >
            <Button
              variant="ghost"
              size="icon"
              onClick={togglePlay}
              className="flex-shrink-0 text-foreground/70 hover:text-foreground hover:bg-accent/50 h-9 w-9 rounded-lg transition-all duration-200"
            >
              {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            </Button>
            <div className="flex items-baseline gap-2 text-xs font-mono tabular-nums text-muted-foreground min-w-[120px]">
              <span className="text-foreground/80 font-medium">{formatTime(currentTime, true)}</span>
              <span className="text-muted-foreground/50">/</span>
              <span className="text-muted-foreground">{formatTime(duration, true)}</span>
            </div>
            <Slider
              min={0}
              max={duration}
              step={0.01}
              value={currentTime}
              onChange={handleScrub}
              disabled={duration === 0}
              className="flex-1"
            />
            <Button
              variant="ghost"
              size="icon"
              onClick={togglePreviewFullScreen}
              className="flex-shrink-0 text-foreground/70 hover:text-foreground hover:bg-accent/50 h-9 w-9 rounded-lg transition-all duration-200"
            >
              {isPreviewFullScreen ? <Shrink className="w-4 h-4" /> : <Fullscreen className="w-4 h-4" />}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
});
Preview.displayName = 'Preview';