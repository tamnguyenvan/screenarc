import log from 'electron-log/renderer';
import { useEffect, useRef } from 'react';
import { useEditorStore, EditorActions } from '../store/editorStore';
import { EditorState } from '../types/store';
import { ExportSettings } from '../components/editor/ExportModal';
import { RESOLUTIONS } from '../lib/constants';
import { drawScene } from '../lib/renderer';

type RenderStartPayload = {
  projectState: Omit<EditorState, keyof EditorActions>;
  exportSettings: ExportSettings;
}

// [OPTIMIZATION] Helper to pre-load an image for the renderer worker
const loadBackgroundImage = (background: EditorState['frameStyles']['background']): Promise<HTMLImageElement | null> => {
  return new Promise((resolve) => {
    if ((background.type !== 'image' && background.type !== 'wallpaper') || !background.imageUrl) {
      resolve(null);
      return;
    }
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => {
      log.error(`[RendererPage] Failed to load background image for export: ${img.src}`);
      resolve(null); // Resolve with null on error to not block rendering
    };
    const finalUrl = background.imageUrl.startsWith('blob:')
      ? background.imageUrl
      : `media://${background.imageUrl}`;
    img.src = finalUrl;
  });
};


export function RendererPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const webcamVideoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    log.info('[RendererPage] Component mounted. Setting up listeners.');

    const cleanup = window.electronAPI.onRenderStart(async ({ projectState, exportSettings }: RenderStartPayload) => {
      const canvas = canvasRef.current;
      const video = videoRef.current;
      const webcamVideo = webcamVideoRef.current;

      try {
        log.info('[RendererPage] Received "render:start" event.', { exportSettings });
        if (!canvas || !video) throw new Error('Canvas or Video ref is not available.');

        const { resolution, fps } = exportSettings;
        const [ratioW, ratioH] = projectState.aspectRatio.split(':').map(Number);
        const baseHeight = RESOLUTIONS[resolution as keyof typeof RESOLUTIONS].height;
        let outputWidth = Math.round(baseHeight * (ratioW / ratioH));
        outputWidth = outputWidth % 2 === 0 ? outputWidth : outputWidth + 1;
        const outputHeight = baseHeight;

        canvas.width = outputWidth;
        canvas.height = outputHeight;

        const ctx = canvas.getContext('2d', { alpha: false });
        if (!ctx) throw new Error('Failed to get 2D context from canvas.');

        useEditorStore.setState(projectState);

        // [OPTIMIZATION] Pre-load the background image before starting the frame loop
        const bgImage = await loadBackgroundImage(projectState.frameStyles.background);

        const loadVideo = (videoElement: HTMLVideoElement, source: string, path: string): Promise<void> =>
          new Promise((resolve, reject) => {
            const onError = (e: Event) => {
              videoElement.removeEventListener('canplaythrough', onCanPlay);
              videoElement.removeEventListener('error', onError);
              log.error(`[RendererPage] ${source} loading error:`, e);
              reject(new Error(`Failed to load ${source}.`));
            };

            const onCanPlay = () => {
              const onSeeked = () => {
                videoElement.removeEventListener('seeked', onSeeked);
                log.info(`[RendererPage] ${source} video is ready and seeked to frame 0.`);
                resolve();
              };

              videoElement.addEventListener('seeked', onSeeked, { once: true });
              videoElement.currentTime = 0;
            };

            videoElement.addEventListener('canplaythrough', onCanPlay, { once: true });
            videoElement.addEventListener('error', onError, { once: true });
            videoElement.src = `media://${path}`;
            videoElement.muted = true;
            videoElement.load();
          });

        const loadPromises: Promise<void>[] = [loadVideo(video, 'Main video', projectState.videoPath!)];
        if (projectState.webcamVideoPath && webcamVideo) { loadPromises.push(loadVideo(webcamVideo, 'Webcam video', projectState.webcamVideoPath)); }
        await Promise.all(loadPromises);

        log.info('[RendererPage] Starting frame-by-frame rendering...');
        const totalDuration = projectState.duration;
        const totalFrames = Math.floor(totalDuration * fps);
        let framesSent = 0;

        for (let i = 0; i < totalFrames; i++) {
          const currentTime = i / fps;

          // Add logic to check cut/trim region
          const isInCutRegion = Object.values(projectState.cutRegions).some(
            (r) => currentTime >= r.startTime && currentTime < (r.startTime + r.duration)
          );
          if (isInCutRegion) continue; // Skip this frame

          // Optimize video seeking - much faster than waiting for 'seeked' event
          await new Promise<void>(resolve => {
            video.currentTime = currentTime;
            if (webcamVideo) webcamVideo.currentTime = currentTime;
            // Use requestAnimationFrame to ensure the video has updated the frame before drawing
            requestAnimationFrame(() => resolve());
          });

          await drawScene(ctx, projectState, video, webcamVideo, currentTime, outputWidth, outputHeight, bgImage);

          const imageData = ctx.getImageData(0, 0, outputWidth, outputHeight);
          const frameBuffer = Buffer.from(imageData.data.buffer);
          const progress = Math.round((i / totalFrames) * 100);
          window.electronAPI.sendFrameToMain({ frame: frameBuffer, progress });
          framesSent++;
        }

        log.info(`[RendererPage] Render finished. Sent ${framesSent} frames. Sending "finishRender" signal.`);
        window.electronAPI.finishRender();

      } catch (error) {
        log.error('[RendererPage] CRITICAL ERROR during render process:', error);
        window.electronAPI.finishRender();
      }
    });

    log.info('[RendererPage] Sending "render:ready" signal to main process.');
    window.electronAPI.rendererReady();

    return () => {
      log.info('[RendererPage] Component unmounted. Cleaning up listener.');
      if (typeof cleanup === 'function') cleanup();
    };
  }, []);

  return (
    <div>
      <h1>Renderer Worker</h1>
      <p>This page is hidden and used for video exporting.</p>
      <canvas ref={canvasRef}></canvas>
      <video ref={videoRef} style={{ display: 'none' }}></video>
      <video ref={webcamVideoRef} style={{ display: 'none' }}></video>
    </div>
  );
}