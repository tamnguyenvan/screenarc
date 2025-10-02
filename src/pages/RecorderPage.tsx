import { useState, useEffect, useRef } from 'react';
import {
  Mic, Webcam, Monitor, SquareDashed, Loader2,
  RefreshCw, AlertTriangle, MousePointerClick, Video, AppWindowMac, X, GripVertical, MousePointer,
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
};

type MicDevice = {
  deviceId: string;
  label: string;
  kind: 'audioinput';
};

const LinuxToolsWarningPanel = ({ missingTools }: { missingTools: string[] }) => {
  if (missingTools.length === 0) return null;

  const getInstallCommands = () => (
    <>
      <p className="font-medium mt-3 text-amber-200">Installation:</p>
      <div className="space-y-2 mt-2">
        <div>
          <p className="text-xs font-medium text-amber-300">Debian/Ubuntu:</p>
          <code className="block mt-1 bg-black/40 px-3 py-2 rounded-2xl text-xs font-mono text-amber-100 border border-amber-500/20">
            sudo apt install wmctrl x11-utils imagemagick
          </code>
        </div>
        <div>
          <p className="text-xs font-medium text-amber-300">Fedora/CentOS/RHEL:</p>
          <code className="block mt-1 bg-black/40 px-3 py-2 rounded-2xl text-xs font-mono text-amber-100 border border-amber-500/20">
            sudo dnf install wmctrl xorg-x11-utils ImageMagick
          </code>
        </div>
        <div>
          <p className="text-xs font-medium text-amber-300">Arch Linux:</p>
          <code className="block mt-1 bg-black/40 px-3 py-2 rounded-2xl text-xs font-mono text-amber-100 border border-amber-500/20">
            sudo pacman -S wmctrl xorg-xwininfo imagemagick
          </code>
        </div>
      </div>
    </>
  );

  return (
    <div
      className="w-full max-w-[480px] p-6 mt-4 bg-card/95 border border-amber-500/30 rounded-2xl shadow-2xl backdrop-blur-xl"
      style={{ WebkitAppRegion: 'no-drag' }}
    >
      <div className="flex items-start gap-4">
        <div className="flex-shrink-0 w-10 h-10 rounded-full bg-amber-500/20 flex items-center justify-center">
          <AlertTriangle className="w-5 h-5 text-amber-400" />
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="font-semibold text-foreground mb-2">Missing Required Tools</h4>
          <p className="text-sm text-muted-foreground leading-relaxed mb-1">
            Window recording on Linux requires: <span className="font-medium text-amber-400">{missingTools.join(', ')}</span>
          </p>
          <p className="text-sm text-muted-foreground">
            Please install them to enable this feature.
          </p>
          {getInstallCommands()}
        </div>
      </div>
    </div>
  );
};

function WindowPickerPanel({ onSelect, onRefresh, sources, isLoading }: {
  onSelect: (source: WindowSource) => void,
  onRefresh: () => void,
  sources: WindowSource[],
  isLoading: boolean
}) {
  return (
    <div
      className="w-full max-w-[720px] mt-4 h-72 p-4 bg-card/95 border border-border/50 rounded-2xl shadow-2xl backdrop-blur-xl flex flex-col"
      style={{ WebkitAppRegion: 'no-drag' }}
    >
      <div className="flex items-center justify-between mb-3 flex-shrink-0 px-2">
        <h3 className="font-semibold text-foreground">Select a Window to Record</h3>
        <Button
          variant="ghost"
          size="sm"
          onClick={onRefresh}
          disabled={isLoading}
          className="text-muted-foreground hover:text-foreground"
        >
          <RefreshCw className={cn("w-4 h-4 mr-2", isLoading && "animate-spin")} />
          Refresh
        </Button>
      </div>

      {isLoading ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-3">
          <Loader2 className="w-8 h-8 text-primary animate-spin" />
          <p className="text-sm text-muted-foreground">Loading windows...</p>
        </div>
      ) : sources.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-3">
          <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
            <AppWindowMac className="w-6 h-6 text-muted-foreground" />
          </div>
          <p className="text-sm text-muted-foreground">No windows found</p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto">
          <div className="grid grid-cols-3 gap-3 pr-2">
            {sources.map(source => (
              <button
                key={source.id}
                className="group relative aspect-video rounded-2xl overflow-hidden border-2 border-border/30 hover:border-primary/60 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all duration-200 bg-muted/50"
                onClick={() => onSelect(source)}
              >
                <img
                  src={source.thumbnailUrl}
                  alt={source.name}
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200" />
                <div className="absolute inset-x-0 bottom-0 p-2">
                  <p className="text-xs text-white font-medium truncate group-hover:text-white/90 transition-colors">
                    {source.name}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function RecorderPage() {
  const [recordingState, setRecordingState] = useState<RecordingState>('idle');
  const [source, setSource] = useState<RecordingSource>('fullscreen');
  const [windowSources, setWindowSources] = useState<WindowSource[]>([]);
  const [isLoadingWindows, setIsLoadingWindows] = useState(false);
  const [platform, setPlatform] = useState<NodeJS.Platform | null>(null);
  const [missingLinuxTools, setMissingLinuxTools] = useState<string[]>([]);
  const [linuxToolsChecked, setLinuxToolsChecked] = useState(false);
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

        const scaleToUse = initialScale ?? 1; // Fallback về 1 nếu chưa có setting
        console.log(`[RecorderPage] Loaded cursor scale from electron-store: ${scaleToUse}`);
        setCursorScale(scaleToUse);
        window.electronAPI.setCursorScale(scaleToUse);

        const [fetchedDisplays] = await Promise.all([
          window.electronAPI.getDisplays(),
          fetchWebcams(),
          fetchMics(),
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

    fetchWebcams();
    fetchMics();

    const cleanup = window.electronAPI.onRecordingFinished(() => {
      setRecordingState('idle');
    });
    return () => cleanup();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (source === 'window' && platform) {
      checkAndFetchSources(platform);
    }
  }, [source, platform]);

  const fetchWebcams = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      stream.getTracks().forEach(track => track.stop());
    } catch (err) { console.warn("Could not get webcam permission:", err); }

    const devices = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'videoinput') as WebcamDevice[];
    setWebcams(devices);

    const savedWebcamId = await window.electronAPI.getSetting<string>('recorder.selectedWebcamId');
    if (savedWebcamId && devices.some(d => d.deviceId === savedWebcamId)) {
      setSelectedWebcamId(savedWebcamId);
    } else {
      setSelectedWebcamId('none');
    }
  };

  const fetchMics = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      stream.getTracks().forEach(track => track.stop());
    } catch (err) { console.warn("Could not get microphone permission:", err); }

    const devices = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'audioinput') as MicDevice[];
    setMics(devices);

    const savedMicId = await window.electronAPI.getSetting<string>('recorder.selectedMicId');
    if (savedMicId && devices.some(d => d.deviceId === savedMicId)) {
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

  const checkAndFetchSources = async (currentPlatform: NodeJS.Platform) => {
    setLinuxToolsChecked(false);
    setMissingLinuxTools([]);
    setWindowSources([]);

    if (currentPlatform === 'linux') {
      const toolStatus = await window.electronAPI.linuxCheckTools();
      const missing = Object.entries(toolStatus)
        .filter(([, installed]) => !installed)
        .map(([tool]) => tool);

      setMissingLinuxTools(missing);
      setLinuxToolsChecked(true);

      if (missing.length > 0) return;
    }

    setIsLoadingWindows(true);
    try {
      const sources = await window.electronAPI.getDesktopSources();
      setWindowSources(sources);
    } catch (error) {
      console.error("Failed to get window sources:", error);
    } finally {
      setIsLoadingWindows(false);
    }
  };

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
            index: selectedDeviceIndex
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
            index: selectedDeviceIndex
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
        fetchWebcams();
      }
    }
    catch (error) {
      console.error('Failed to start recording:', error);
      setRecordingState('idle');
      // If there was an error, re-fetch webcams to re-enable preview
      fetchWebcams();
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
  const onLinux = platform === 'linux';
  const showLinuxWarning = isWindowMode && onLinux && linuxToolsChecked && missingLinuxTools.length > 0;
  const showWindowPicker = isWindowMode && !showLinuxWarning;

  let buttonIcon = <Video size={20} />;
  let isButtonDisabled = isInitializing;

  if (isInitializing) {
    buttonIcon = <Loader2 size={20} className="animate-spin" />;
  } else if (isWindowMode) {
    isButtonDisabled = true;
    if (showLinuxWarning) {
      buttonIcon = <AlertTriangle size={20} />;
    } else {
      buttonIcon = <MousePointerClick size={20} />;
    }
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
                  isButtonDisabled && !isInitializing && showLinuxWarning && "bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30",
                  isButtonDisabled && !isInitializing && !showLinuxWarning && "opacity-50"
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

        {/* --- 2. Linux Tools Warning Panel --- */}
        {showLinuxWarning && (
          <div data-interactive="true">
            <LinuxToolsWarningPanel missingTools={missingLinuxTools} />
          </div>
        )}

        {/* --- 2. Window Picker Panel --- */}
        {showWindowPicker && (
          <div data-interactive="true">
            <WindowPickerPanel
              sources={windowSources}
              isLoading={isLoadingWindows}
              onRefresh={() => platform && checkAndFetchSources(platform)}
              onSelect={(selectedSource) => handleStart({ geometry: selectedSource.geometry, windowTitle: selectedSource.name })}
            />
          </div>
        )}

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
