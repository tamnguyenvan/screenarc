import { useState, useEffect, useRef } from 'react';
import {
  Mic, Webcam, Monitor, SquareDashed, Loader2,
  MousePointerClick, Video, X, GripVertical, MousePointer,
  VideoOff, MicOff
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { cn } from '../lib/utils';
import "../index.css";

const LINUX_SCALES = [
  { value: 2, label: '2x' },
  { value: 1.5, label: '1.5x' },
  { value: 1, label: '1x' },
];

const WINDOWS_SCALES = [
  { value: 3, label: '3x' },
  { value: 2, label: '2x' },
  { value: 1, label: '1x' },
];

type RecordingState = 'idle' | 'recording';
type RecordingSource = 'area' | 'fullscreen' | 'window';

type WindowSource = {
  id: string;
  name: string;
  thumbnailUrl: string;
  geometry?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

type DisplayInfo = {
  id: number;
  name: string;
  isPrimary: boolean;
}

type WebcamDevice = {
  deviceId: string;
  label: string;
  kind: 'videoinput';
  ffmpegInput?: string;
};

type MicDevice = {
  deviceId: string;
  label: string;
  kind: 'audioinput';
  ffmpegInput?: string;
};

export function RecorderPage() {
  const [recordingState, setRecordingState] = useState<RecordingState>('idle');
  const [source, setSource] = useState<RecordingSource>('fullscreen');
  const [platform, setPlatform] = useState<NodeJS.Platform | null>(null);
  const [displays, setDisplays] = useState<DisplayInfo[]>([]);
  const [selectedDisplayId, setSelectedDisplayId] = useState<string>('');
  const [webcams, setWebcams] = useState<WebcamDevice[]>([]);
  const [selectedWebcamId, setSelectedWebcamId] = useState<string>('none');
  const [mics, setMics] = useState<MicDevice[]>([]);
  const [selectedMicId, setSelectedMicId] = useState<string>('none');
  const [cursorScale, setCursorScale] = useState<number>(1);
  const [isInitializing, setIsInitializing] = useState(true);
  const webcamPreviewRef = useRef<HTMLVideoElement>(null);
  const webcamStreamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    const cleanupListener = window.electronAPI.onReleaseWebcamRequest(() => {
      console.log("[RecorderPage] Received request to release webcam.");
      if (webcamStreamRef.current) {
        webcamStreamRef.current.getTracks().forEach(track => track.stop());
        webcamStreamRef.current = null;
        if (webcamPreviewRef.current) {
          webcamPreviewRef.current.srcObject = null;
        }
        console.log("[RecorderPage] Webcam stream stopped.");
      } else {
        console.log("[RecorderPage] No active webcam stream to stop.");
      }

      // Gửi xác nhận cho main process BẤT KỂ có stream hay không.
      // Đây là dòng quan trọng nhất để sửa lỗi treo.
      console.log("[RecorderPage] Sending confirmation back to main process.");
      window.electronAPI.sendWebcamReleasedConfirmation();
    });

    // Return the cleanup function
    return () => {
      if (cleanupListener && typeof cleanupListener === 'function') {
        cleanupListener();
      }
    };
  }, []);

  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('[data-interactive="true"]') && !target.closest('[data-radix-select-content]')) {
        window.electronAPI.recorderClickThrough();
      }
    };

    window.addEventListener('mousedown', handleMouseDown);
    return () => {
      window.removeEventListener('mousedown', handleMouseDown);
    };
  }, []);

  useEffect(() => {
    const initialize = async () => {
      try {
        const [platformResult, initialScale] = await Promise.all([
          window.electronAPI.getPlatform(),
          window.electronAPI.getSetting<number>('recorder.cursorScale'),
        ]);

        setPlatform(platformResult);

        const scaleToUse = initialScale ?? 1;
        setCursorScale(scaleToUse);
        window.electronAPI.setCursorScale(scaleToUse);

        const [fetchedDisplays] = await Promise.all([
          window.electronAPI.getDisplays(),
          fetchWebcams(platformResult),
          fetchMics(platformResult),
        ]);

        setDisplays(fetchedDisplays);
        const primary = fetchedDisplays.find(d => d.isPrimary);
        if (primary) {
          setSelectedDisplayId(String(primary.id));
        } else if (fetchedDisplays.length > 0) {
          setSelectedDisplayId(String(fetchedDisplays[0].id));
        }
      } catch (error) {
        console.error("Failed to initialize recorder:", error);
      } finally {
        setIsInitializing(false);
      }
    };

    initialize();

    const cleanup = window.electronAPI.onRecordingFinished(() => {
      setRecordingState('idle');
    });
    return () => cleanup();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchWebcams = async (currentPlatform: NodeJS.Platform | null) => {
    try {
      await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    } catch (err) { console.warn("Could not get webcam permission:", err); }

    const browserDevices = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'videoinput') as Omit<WebcamDevice, 'ffmpegInput'>[];

    let finalDevices: WebcamDevice[] = [...browserDevices];

    if (currentPlatform === 'win32') {
      const ffmpegDevices = (await window.electronAPI.getMediaDevices()).webcams;
      finalDevices = browserDevices.map(bDevice => {
        const ffmpegMatch = ffmpegDevices.find(fDevice => fDevice.label === bDevice.label);
        return {
          ...bDevice,
          ffmpegInput: ffmpegMatch?.ffmpegInput,
        };
      }).filter(d => d.ffmpegInput);
    }

    setWebcams(finalDevices);

    const savedWebcamId = await window.electronAPI.getSetting<string>('recorder.selectedWebcamId');
    if (savedWebcamId && finalDevices.some(d => d.deviceId === savedWebcamId)) {
      setSelectedWebcamId(savedWebcamId);
    } else {
      setSelectedWebcamId('none');
    }
  };

  const fetchMics = async (currentPlatform: NodeJS.Platform | null) => {
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    } catch (err) { console.warn("Could not get microphone permission:", err); }

    const browserDevices = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'audioinput') as Omit<MicDevice, 'ffmpegInput'>[];

    let finalDevices: MicDevice[] = [...browserDevices];

    if (currentPlatform === 'win32') {
      const ffmpegDevices = (await window.electronAPI.getMediaDevices()).mics;
      finalDevices = browserDevices.map(bDevice => {
        const ffmpegMatch = ffmpegDevices.find(fDevice => fDevice.label === bDevice.label);
        return {
          ...bDevice,
          ffmpegInput: ffmpegMatch?.ffmpegInput,
        };
      }).filter(d => d.ffmpegInput);
    }

    setMics(finalDevices);

    const savedMicId = await window.electronAPI.getSetting<string>('recorder.selectedMicId');
    if (savedMicId && finalDevices.some(d => d.deviceId === savedMicId)) {
      setSelectedMicId(savedMicId);
    } else {
      setSelectedMicId('none');
    }
  };

  useEffect(() => {
    const videoEl = webcamPreviewRef.current;

    // Cleanup function to stop any existing stream
    const stopStream = () => {
      if (webcamStreamRef.current) {
        webcamStreamRef.current.getTracks().forEach(track => track.stop());
        webcamStreamRef.current = null;
      }
      if (videoEl) {
        videoEl.srcObject = null;
      }
    };

    if (selectedWebcamId === 'none' || !videoEl) {
      stopStream();
      return;
    }

    const startStream = async () => {
      // Stop previous stream before starting a new one
      stopStream();
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { deviceId: { exact: selectedWebcamId } } });
        // Store the new stream in our ref
        webcamStreamRef.current = stream;
        if (videoEl) {
          videoEl.srcObject = stream;
        }
      } catch (error) {
        console.error("Failed to start webcam preview stream:", error);
      }
    };

    startStream();

    // The return function will be called on cleanup (component unmount or dependency change)
    return stopStream;
  }, [selectedWebcamId]);

  const handleStart = async (options: { geometry?: WindowSource['geometry'], windowTitle?: string } = {}) => {
    if (webcamStreamRef.current) {
      console.log("Stopping webcam preview stream to release device BEFORE starting recording...");
      webcamStreamRef.current.getTracks().forEach(track => track.stop());
      webcamStreamRef.current = null;
      if (webcamPreviewRef.current) {
        webcamPreviewRef.current.srcObject = null;
      }
    }
    await new Promise(resolve => setTimeout(resolve, 100));

    try {
      setRecordingState('recording');
      let webcamPayload;
      if (selectedWebcamId !== 'none' && webcams.length > 0) {
        const selectedDevice = webcams.find(d => d.deviceId === selectedWebcamId);
        const selectedDeviceIndex = webcams.findIndex(d => d.deviceId === selectedWebcamId);

        if (selectedDevice && selectedDeviceIndex > -1) {
          webcamPayload = {
            deviceId: selectedDevice.deviceId,
            deviceLabel: selectedDevice.label,
            index: selectedDeviceIndex,
            ffmpegInput: selectedDevice.ffmpegInput || `video=${selectedDevice.label}` // Fallback for non-windows
          };
        }
      }

      let micPayload;
      if (selectedMicId !== 'none' && mics.length > 0) {
        const selectedDevice = mics.find(d => d.deviceId === selectedMicId);
        const selectedDeviceIndex = mics.findIndex(d => d.deviceId === selectedMicId);

        if (selectedDevice && selectedDeviceIndex > -1) {
          micPayload = {
            deviceId: selectedDevice.deviceId,
            deviceLabel: selectedDevice.label,
            index: selectedDeviceIndex,
            ffmpegInput: selectedDevice.ffmpegInput || `audio=${selectedDevice.label}` // Fallback for non-windows
          }
        }
      }

      const result = await window.electronAPI.startRecording({
        source,
        displayId: source === 'fullscreen' ? Number(selectedDisplayId) : undefined,
        webcam: webcamPayload,
        mic: micPayload,
        ...options
      });
      if (result.canceled) {
        setRecordingState('idle');
        // If recording was cancelled, re-fetch webcams to re-enable preview
        fetchWebcams(platform);
      }
    }
    catch (error) {
      console.error('Failed to start recording:', error);
      setRecordingState('idle');
      // If there was an error, re-fetch webcams to re-enable preview
      fetchWebcams(platform);
    }
  };

  const handleWebcamChange = (deviceId: string) => {
    setSelectedWebcamId(deviceId);
    window.electronAPI.setSetting('recorder.selectedWebcamId', deviceId);
  };

  const handleMicChange = (deviceId: string) => {
    setSelectedMicId(deviceId);
    window.electronAPI.setSetting('recorder.selectedMicId', deviceId);
  }

  const handleCursorScaleChange = (newScale: number) => {
    setCursorScale(newScale);
    window.electronAPI.setCursorScale(newScale);
    window.electronAPI.setSetting('recorder.cursorScale', newScale);
  };
  const cursorScales = platform === 'win32' ? WINDOWS_SCALES : LINUX_SCALES;

  if (recordingState === 'recording') {
    return null;
  }

  const isWindowMode = source === 'window';

  let buttonIcon = <Video size={20} />;
  let isButtonDisabled = isInitializing;

  if (isInitializing) {
    buttonIcon = <Loader2 size={20} className="animate-spin" />;
  } else if (isWindowMode) {
    isButtonDisabled = true;
    buttonIcon = <MousePointerClick size={20} />;
  }

  return (
    <div className="relative h-screen w-screen bg-transparent select-none">
      <div className="absolute top-0 left-0 right-0 flex flex-col items-center pt-8">
        {/* --- 1. Main Control Bar --- */}
        <div
          className={cn(
            "relative flex items-stretch gap-4 p-2 rounded-2xl",
            "bg-transparent text-card-foreground",
          )}
          data-interactive="true"
        >
          <div
            className={cn(
              "flex items-stretch gap-4 p-2 rounded-2xl",
              "bg-card border border-border text-card-foreground",
              "shadow-lg backdrop-blur-xl",
            )}
            style={{ WebkitAppRegion: 'drag' }}
          >

            {/* Close Button */}
            <button
              onClick={() => window.electronAPI.closeWindow()}
              style={{ WebkitAppRegion: 'no-drag' }}
              className={cn(
                "absolute -top-3 -left-3 z-20 flex items-center justify-center w-6 h-6 rounded-full",
                "bg-card border border-border hover:bg-destructive text-muted-foreground hover:text-white shadow-lg"
              )}
              aria-label="Close Recorder"
            >
              <X className="w-4 h-4" />
            </button>


            {/* Drag Handle */}
            <div className="flex items-center justify-center pl-2 pr-1 cursor-grab" style={{ WebkitAppRegion: 'drag' }}>
              <GripVertical className="w-5 h-5 text-muted-foreground/50" />
            </div>

            {/* Source Selection */}
            <div className="flex items-center p-1 bg-muted rounded-2xl border border-border" style={{ WebkitAppRegion: 'no-drag' }}>
              <SourceButton
                label="Full Screen"
                icon={<Monitor size={16} />}
                isActive={source === 'fullscreen'}
                onClick={() => setSource('fullscreen')}
              />
              <SourceButton
                label="Area"
                icon={<SquareDashed size={16} />}
                isActive={source === 'area'}
                onClick={() => setSource('area')}
              />
              {/* <SourceButton
                label="Window"
                icon={<AppWindowMac size={16} />}
                isActive={source === 'window'}
                onClick={() => setSource('window')}
              /> */}
            </div>

            {/* Divider */}
            <div className="w-px bg-border/50"></div>


            <div style={{ WebkitAppRegion: 'no-drag' }}>
              <Button
                onClick={() => handleStart()}
                disabled={isButtonDisabled}
                variant="default"
                size="icon"
                className={cn(
                  "h-12 w-12",
                  "rounded-full",
                  isInitializing && "cursor-wait",
                  isButtonDisabled && !isInitializing && "opacity-50"
                )}
              >
                {buttonIcon}
              </Button>
            </div>

            {/* Divider */}
            <div className="w-px bg-border/50"></div>


            {/* Monitor Selection */}
            <div className="flex items-center" style={{ WebkitAppRegion: 'no-drag' }}>
              <Select
                value={selectedDisplayId}
                onValueChange={setSelectedDisplayId}
                disabled={source !== 'fullscreen'}
              >
                <SelectTrigger className="w-12 h-10 rounded-2xl">
                  <SelectValue asChild>
                    <Monitor size={18} className="text-primary" />
                  </SelectValue>
                </SelectTrigger>

                <SelectContent>
                  {displays.map(display => (
                    <SelectItem key={display.id} value={String(display.id)}>
                      {display.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Controls */}
            <div className="flex items-center gap-3" style={{ WebkitAppRegion: 'no-drag' }}>
              <div className="flex items-center" style={{ WebkitAppRegion: 'no-drag' }}>
                <Select value={selectedWebcamId} onValueChange={handleWebcamChange}>
                  <SelectTrigger className="w-12 h-10 rounded-2xl">
                    <SelectValue asChild>
                      {selectedWebcamId !== 'none'
                        ? <Webcam size={18} className="text-primary" />
                        : <VideoOff size={18} className="text-muted-foreground" />
                      }
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Don't record camera</SelectItem>
                    {webcams.map(cam => (
                      <SelectItem key={cam.deviceId} value={cam.deviceId}>{cam.label || `Camera ...`}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center" style={{ WebkitAppRegion: 'no-drag' }}>
                <Select value={selectedMicId} onValueChange={handleMicChange}>
                  <SelectTrigger className="w-12 h-10 rounded-2xl">
                    <SelectValue asChild>
                      {selectedMicId !== 'none'
                        ? <Mic size={18} className="text-primary" />
                        : <MicOff size={18} className="text-muted-foreground" />
                      }
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Don't record microphone</SelectItem>
                    {mics.map(mic => (
                      <SelectItem key={mic.deviceId} value={mic.deviceId}>{mic.label || `Microphone ${mics.indexOf(mic) + 1}`}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <>
                <div className="flex items-center gap-2" style={{ WebkitAppRegion: 'no-drag' }}>
                  <MousePointer size={18} className="text-muted-foreground" />
                  <Select
                    value={String(cursorScale)}
                    onValueChange={(value) => handleCursorScaleChange(Number(value))}
                  >
                    <SelectTrigger className="w-16 h-10 border-border/50 bg-background/60">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {cursorScales.map(s => (
                        <SelectItem key={s.value} value={String(s.value)}>{s.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </>

            </div>
          </div>
        </div>

        {selectedWebcamId !== 'none' && (
          <div data-interactive="true" className="mt-4 w-48 aspect-square rounded-[35%] overflow-hidden shadow-2xl bg-black">
            <video ref={webcamPreviewRef} autoPlay playsInline muted className="w-full h-full object-cover" />
          </div>
        )}
      </div>
    </div>
  );
}

const SourceButton = ({ label, icon, isActive, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string,
  icon: React.ReactNode,
  isActive: boolean,
}) => (
  <button
    className={cn(
      "flex items-center gap-2 px-4 py-2 rounded-2xl text-sm font-medium transition-all duration-200 outline-none focus-visible:ring-2 focus-visible:ring-ring",
      isActive
        ? "bg-card shadow-sm text-foreground"
        : "text-muted-foreground hover:text-foreground"
    )}
    {...props}
  >
    {icon}
    <span>{label}</span>
  </button>
);
