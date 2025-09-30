import React, { useEffect, useRef, memo, useState, useCallback } from 'react';
import { useEditorStore, usePlaybackState } from '../../store/editorStore';
import { Film, Play, Pause, Fullscreen, Shrink } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { formatTime } from '../../lib/utils';
import { Slider } from '../ui/slider';
import { Button } from '../ui/button';
import { drawScene } from '../../lib/renderer';

export const Preview = memo(({ videoRef }: { videoRef: React.RefObject<HTMLVideoElement> }) => {
  const {
    videoUrl, aspectRatio, cutRegions,
    webcamVideoUrl, duration, currentTime, togglePlay,
    isPreviewFullScreen, togglePreviewFullScreen, frameStyles,
    isWebcamVisible, webcamPosition, webcamStyles, videoDimensions
  } = useEditorStore(
    useShallow(state => ({
      videoUrl: state.videoUrl,
      aspectRatio: state.aspectRatio,
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
    })));

  const { setPlaying, setCurrentTime, setDuration, setVideoDimensions } = useEditorStore.getState();
  const { isPlaying, isCurrentlyCut } = usePlaybackState();

  const [previewContainerSize, setPreviewContainerSize] = useState({ width: 0, height: 0 });
  const [bgImage, setBgImage] = useState<HTMLImageElement | null>(null); // [OPTIMIZATION] State for pre-loaded image
  const previewContainerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const webcamVideoRef = useRef<HTMLVideoElement>(null);
  const animationFrameId = useRef<number>();

  // Calculate canvas dimensions to fit container while maintaining aspect ratio
  const canvasDimensions = (() => {
    if (previewContainerSize.width === 0 || previewContainerSize.height === 0) {
      return { width: 0, height: 0 };
    }
    const [ratioW, ratioH] = aspectRatio.split(':').map(Number);
    const containerRatio = previewContainerSize.width / previewContainerSize.height;
    const targetRatio = ratioW / ratioH;

    if (containerRatio > targetRatio) {
      const height = previewContainerSize.height;
      const width = height * targetRatio;
      return { width, height };
    } else {
      const width = previewContainerSize.width;
      const height = width / targetRatio;
      return { width, height };
    }
  })();

  // [OPTIMIZATION] Effect to pre-load background images
  useEffect(() => {
    const background = frameStyles.background;
    if ((background.type === 'image' || background.type === 'wallpaper') && background.imageUrl) {
      const img = new Image();
      img.onload = () => {
        setBgImage(img);
      };
      const finalUrl = background.imageUrl.startsWith('blob:')
        ? background.imageUrl
        : `media://${background.imageUrl}`;
      img.src = finalUrl;
    } else {
      setBgImage(null); // Clear image for color/gradient backgrounds
    }
  }, [frameStyles.background]);

  // Observe container size to resize canvas correctly
  useEffect(() => {
    const observer = new ResizeObserver(entries => {
      if (entries[0]) {
        const { width, height } = entries[0].contentRect;
        setPreviewContainerSize({ width, height });
      }
    });
    const container = previewContainerRef.current;
    if (container) observer.observe(container);
    return () => { if (container) observer.disconnect() };
  }, []);

  // Main render loop
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

    await drawScene(
      ctx,
      state,
      video,
      webcamVideo,
      video.currentTime,
      canvas.width,
      canvas.height,
      bgImage
    );

    if (state.isPlaying) {
      animationFrameId.current = requestAnimationFrame(renderCanvas);
    }
  }, [videoRef, bgImage]);

  // Manage animation frame loop
  useEffect(() => {
    // If playing, start the animation loop
    if (isPlaying) {
      animationFrameId.current = requestAnimationFrame(renderCanvas);
    } else {
      // If paused, just render once.
      // This effect will be re-triggered by dependencies (currentTime, canvasDimensions, renderCanvas)
      // and redraw when needed.
      renderCanvas();
    }

    // Cleanup function to stop the animation loop when component unmounts or effect runs again
    return () => {
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
      }
    };
  }, [isPlaying, currentTime, renderCanvas, canvasDimensions, frameStyles,
    isWebcamVisible, webcamPosition, webcamStyles, videoDimensions]);

  // Control video playback
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

  // Handle seeking when in a cut region
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (isPlaying && isCurrentlyCut) {
      const allCutRegions = Object.values(useEditorStore.getState().cutRegions);
      const activeCutRegion = allCutRegions.find(
        r => video.currentTime >= r.startTime && video.currentTime < (r.startTime + r.duration)
      );
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

  const handleLoadedMetadata = () => {
    const video = videoRef.current;
    if (video) {
      setDuration(video.duration);
      setVideoDimensions({ width: video.videoWidth, height: video.videoHeight });

      const onInitialSeekComplete = () => {
        renderCanvas();
        video.removeEventListener('seeked', onInitialSeekComplete);
      };

      video.addEventListener('seeked', onInitialSeekComplete);

      video.currentTime = 0;
    }
  };

  const handleWebcamLoadedMetadata = useCallback(() => {
    const mainVideo = videoRef.current;
    const webcamVideo = webcamVideoRef.current;
    if (mainVideo && webcamVideo) {
      // Sync the initial state of the webcam video to the main video
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
    <div className="w-full h-full flex flex-col items-center justify-center">
      <div
        id="preview-container"
        ref={previewContainerRef}
        className="transition-all duration-300 ease-out flex items-center justify-center w-full h-full"
      >
        {videoUrl ? (
          <canvas
            ref={canvasRef}
            width={canvasDimensions.width}
            height={canvasDimensions.height}
            style={{ maxWidth: '100%', maxHeight: '100%' }}
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-slate-50/10 to-slate-100/5 border-2 border-dashed border-white/20 rounded-xl flex flex-col items-center justify-center text-white/70 gap-4 backdrop-blur-sm">
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-white/20 to-white/5 flex items-center justify-center backdrop-blur-md border border-white/20">
              <Film className="w-8 h-8 text-white/70" />
            </div>
            <div className="text-center">
              <p className="text-lg font-medium mb-1 text-white/80">No project loaded</p>
              <p className="text-sm text-white/50">Load a project to begin editing</p>
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

      {videoUrl && (
        <div
          className="w-full"
          style={{ width: canvasDimensions.width > 0 ? canvasDimensions.width : 'auto', maxWidth: '100%' }}
        >
          <div className="bg-card/80 backdrop-blur-xl border border-border/30 rounded-bl-xl rounded-br-xl px-3 py-1.5 flex items-center gap-3 shadow-xs">
            <Button variant="ghost" size="icon" onClick={togglePlay} className="flex-shrink-0 text-foreground/70 hover:text-foreground h-8 w-8">
              {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            </Button>
            <div className="flex items-baseline gap-1.5 text-xs font-mono tabular-nums text-muted-foreground">
              <span>{formatTime(currentTime, true)}</span>
              <span>/</span>
              <span>{formatTime(duration, true)}</span>
            </div>
            <Slider
              min={0} max={duration} step={0.01} value={currentTime}
              onChange={handleScrub} disabled={duration === 0} className="flex-1"
            />
            <Button variant="ghost" size="icon" onClick={togglePreviewFullScreen} className="flex-shrink-0 text-foreground/70 hover:text-foreground h-8 w-8">
              {isPreviewFullScreen ? <Shrink className="w-4 h-4" /> : <Fullscreen className="w-4 h-4" />}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
});
Preview.displayName = 'Preview';