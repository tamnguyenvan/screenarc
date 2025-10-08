import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  Mic, Webcam, Monitor, SquareDashed, Loader2,
  Video, X, MousePointer, MicOff, FolderOpen
} from 'lucide-react';
import { WebcamOffIcon } from '../components/ui/icons';
import { Button } from '../components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { cn } from '../lib/utils';
import "../index.css";

// --- Constants ---
const LINUX_SCALES = [{ value: 2, label: '2x' }, { value: 1.5, label: '1.5x' }, { value: 1, label: '1x' }];
const WINDOWS_SCALES = [{ value: 3, label: '3x' }, { value: 2, label: '2x' }, { value: 1, label: '1x' }];

// --- Types ---
type RecordingState = 'idle' | 'preparing' | 'recording';
type ActionInProgress = 'none' | 'recording' | 'loading';
type RecordingSource = 'area' | 'fullscreen';
type Device = { id: string; name: string; };
type DisplayInfo = { id: number; name: string; isPrimary: boolean; };

// --- Custom Hook for Device Loading ---
const useDeviceLoader = () => {
  const [platform, setPlatform] = useState<NodeJS.Platform | null>(null);
  const [webcams, setWebcams] = useState<Device[]>([]);
  const [mics, setMics] = useState<Device[]>([]);
  const [isInitializing, setIsInitializing] = useState(true);

  const fetchDevices = useCallback(async (kind: 'videoinput' | 'audioinput') => {
    const currentPlatform = await window.electronAPI.getPlatform();
    setPlatform(currentPlatform);

    if (currentPlatform === 'win32') {
      const { video, audio } = await window.electronAPI.getDshowDevices();
      const devices = (kind === 'videoinput' ? video : audio).map(d => ({ id: d.alternativeName, name: d.name }));
      return devices;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ [kind === 'videoinput' ? 'video' : 'audio']: true });
      stream.getTracks().forEach(track => track.stop());
    } catch (err) {
      console.warn(`Could not get permission for ${kind}:`, err);
    }
    const allDevices = await navigator.mediaDevices.enumerateDevices();
    return allDevices.filter(d => d.kind === kind).map(d => ({ id: d.deviceId, name: d.label || `${kind} device` }));
  }, []);

  const loadAll = useCallback(async () => {
    setIsInitializing(true);
    try {
      const [fetchedWebcams, fetchedMics] = await Promise.all([
        fetchDevices('videoinput'),
        fetchDevices('audioinput')
      ]);
      setWebcams(fetchedWebcams);
      setMics(fetchedMics);
    } catch (error) {
      console.error("Failed to load devices:", error);
    } finally {
      setIsInitializing(false);
    }
  }, [fetchDevices]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  return { platform, webcams, mics, isInitializing, reload: loadAll };
};


export function RecorderPage() {
  const [recordingState, setRecordingState] = useState<RecordingState>('idle');
  const [actionInProgress, setActionInProgress] = useState<ActionInProgress>('none');
  const [source, setSource] = useState<RecordingSource>('fullscreen');
  const [displays, setDisplays] = useState<DisplayInfo[]>([]);
  const [selectedDisplayId, setSelectedDisplayId] = useState<string>('');
  const [selectedWebcamId, setSelectedWebcamId] = useState<string>('none');
  const [selectedMicId, setSelectedMicId] = useState<string>('none');
  const [cursorScale, setCursorScale] = useState<number>(1);

  const { platform, webcams, mics, isInitializing, reload: reloadDevices } = useDeviceLoader();
  const webcamPreviewRef = useRef<HTMLVideoElement>(null);
  const webcamStreamRef = useRef<MediaStream | null>(null);

  const cursorScales = useMemo(() => platform === 'win32' ? WINDOWS_SCALES : LINUX_SCALES, [platform]);

  useEffect(() => {
    const initialize = async () => {
      try {
        const [savedWebcamId, savedMicId, savedCursorScale, fetchedDisplays] = await Promise.all([
          window.electronAPI.getSetting<string>('recorder.selectedWebcamId'),
          window.electronAPI.getSetting<string>('recorder.selectedMicId'),
          window.electronAPI.getSetting<number>('recorder.cursorScale'),
          window.electronAPI.getDisplays(),
        ]);

        setSelectedWebcamId(savedWebcamId || 'none');
        setSelectedMicId(savedMicId || 'none');

        const scaleToUse = savedCursorScale ?? 1;
        setCursorScale(scaleToUse);
        window.electronAPI.setCursorScale(scaleToUse);

        setDisplays(fetchedDisplays);
        const primary = fetchedDisplays.find(d => d.isPrimary) || fetchedDisplays[0];
        if (primary) setSelectedDisplayId(String(primary.id));

      } catch (error) {
        console.error("Failed to initialize recorder settings:", error);
      }
    };
    initialize();
  }, []);

  useEffect(() => {
    if (isInitializing) return;

    if (webcams.length > 0 && selectedWebcamId !== 'none' && !webcams.some(w => w.id === selectedWebcamId)) {
      console.warn(`Saved webcam ID "${selectedWebcamId}" not found. Resetting.`);
      setSelectedWebcamId('none');
      window.electronAPI.setSetting('recorder.selectedWebcamId', 'none');
    }

    if (mics.length > 0 && selectedMicId !== 'none' && !mics.some(m => m.id === selectedMicId)) {
      console.warn(`Saved mic ID "${selectedMicId}" not found. Resetting.`);
      setSelectedMicId('none');
      window.electronAPI.setSetting('recorder.selectedMicId', 'none');
    }

    if (platform && !cursorScales.some(s => s.value === cursorScale)) {
      console.warn(`Saved cursor scale "${cursorScale}" is invalid for platform "${platform}". Resetting.`);
      setCursorScale(1);
      window.electronAPI.setCursorScale(1);
      window.electronAPI.setSetting('recorder.cursorScale', 1);
    }
  }, [isInitializing, webcams, mics, platform, cursorScales, selectedWebcamId, selectedMicId, cursorScale]);

  useEffect(() => {
    const cleanup = window.electronAPI.onRecordingFinished(() => {
      setActionInProgress('none');
      setRecordingState('idle');
      reloadDevices();
    });
    return () => cleanup();
  }, [reloadDevices]);

  useEffect(() => {
    const videoEl = webcamPreviewRef.current;

    const stopStream = () => {
      if (webcamStreamRef.current) {
        webcamStreamRef.current.getTracks().forEach(track => track.stop());
        webcamStreamRef.current = null;
      }
      if (videoEl) videoEl.srcObject = null;
    };

    if (recordingState !== 'idle' || selectedWebcamId === 'none' || !videoEl) {
      stopStream();
      return;
    }

    const startStream = async () => {
      stopStream();
      try {
        const constraints = platform === 'win32'
          ? { video: true }
          : { video: { deviceId: { exact: selectedWebcamId } } };

        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        webcamStreamRef.current = stream;
        if (videoEl) videoEl.srcObject = stream;
      } catch (error) {
        console.error("Failed to start webcam preview stream:", error);
      }
    };

    startStream();
    return stopStream;
  }, [selectedWebcamId, platform, recordingState]);

  const handleStart = async () => {
    setActionInProgress('recording');

    if (webcamStreamRef.current) {
      console.log("Stopping webcam preview to release device for recording...");
      webcamStreamRef.current.getTracks().forEach(track => track.stop());
      webcamStreamRef.current = null;
      if (webcamPreviewRef.current) webcamPreviewRef.current.srcObject = null;
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    try {
      const webcam = selectedWebcamId !== 'none' ? webcams.find(d => d.id === selectedWebcamId) : undefined;
      const mic = selectedMicId !== 'none' ? mics.find(d => d.id === selectedMicId) : undefined;

      const result = await window.electronAPI.startRecording({
        source,
        displayId: source === 'fullscreen' ? Number(selectedDisplayId) : undefined,
        webcam: webcam ? {
          deviceId: webcam.id,
          deviceLabel: webcam.id,
          index: webcams.indexOf(webcam),
        } : undefined,
        mic: mic ? {
          deviceId: mic.id,
          deviceLabel: mic.id,
          index: mics.indexOf(mic),
        } : undefined,
      });

      if (result.canceled) {
        setActionInProgress('none');
        setRecordingState('idle');
      } else {
        setRecordingState('recording');
      }
    } catch (error) {
      console.error('Failed to start recording:', error);
      setActionInProgress('none');
      setRecordingState('idle');
    }
  };

  const handleLoadVideo = async () => {
    setActionInProgress('loading');
    try {
      const result = await window.electronAPI.loadVideoFromFile();
      if (result.canceled) {
        setActionInProgress('none'); // Reset if cancelled
      }
    } catch (error) {
      console.error('Failed to load video from file:', error);
      setActionInProgress('none');
    }
  };

  const handleSelectionChange = (setter: (id: string) => void, key: string) => (id: string) => {
    setter(id);
    window.electronAPI.setSetting(key, id);
  };

  const handleCursorScaleChange = (value: string) => {
    const newScale = Number(value);
    setCursorScale(newScale);
    window.electronAPI.setCursorScale(newScale);
    window.electronAPI.setSetting('recorder.cursorScale', newScale);
  };

  if (recordingState === 'recording') return null;

  return (
    <div className="relative h-screen w-screen bg-transparent select-none">
      <div className="absolute top-0 left-0 right-0 flex flex-col items-center pt-6">
        <div data-interactive="true" className="relative">

          {/* Main Control Bar */}
          <div
            className="relative flex items-center gap-3 px-4 py-3 rounded-2xl bg-card border border-border shadow-2xl"
            style={{ WebkitAppRegion: 'drag' }}
          >
            {/* Close Button */}
            <button
              onClick={() => window.electronAPI.closeWindow()}
              style={{ WebkitAppRegion: 'no-drag' }}
              className="absolute -top-2.5 -left-2.5 z-20 flex items-center justify-center w-6 h-6 rounded-full bg-destructive/90 hover:bg-destructive text-white shadow-lg transition-all hover:scale-110"
              aria-label="Close Recorder"
            >
              <X className="w-3.5 h-3.5" />
            </button>

            {/* Source Toggle */}
            <div className="flex items-center p-1 bg-muted/60 rounded-xl border border-border/50" style={{ WebkitAppRegion: 'no-drag' }}>
              <SourceButton
                icon={<Monitor size={16} />}
                isActive={source === 'fullscreen'}
                onClick={() => setSource('fullscreen')}
                tooltip="Full Screen"
              />
              <SourceButton
                icon={<SquareDashed size={16} />}
                isActive={source === 'area'}
                onClick={() => setSource('area')}
                tooltip="Area"
              />
            </div>

            <div className="w-px h-8 bg-border/50"></div>

            {/* Display Select */}
            <div style={{ WebkitAppRegion: 'no-drag' }}>
              <Select value={selectedDisplayId} onValueChange={setSelectedDisplayId}>
                <SelectTrigger
                  variant="minimal"
                  className="w-auto min-w-[120px] max-w-[150px] h-9 rounded-lg"
                >
                  <SelectValue asChild>
                    <div className="flex items-center gap-1.5 text-xs min-w-0">
                      <Monitor size={14} className="text-primary shrink-0" />
                      <span className="truncate">
                        {displays.find(d => String(d.id) === selectedDisplayId)?.name || `Display ${selectedDisplayId}`}
                      </span>
                    </div>
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {displays.map(d => (
                    <SelectItem key={d.id} value={String(d.id)}>
                      {d.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Webcam Select - icon only with tooltip */}
            <div style={{ WebkitAppRegion: 'no-drag' }}>
              <Select
                value={selectedWebcamId}
                onValueChange={handleSelectionChange(setSelectedWebcamId, 'recorder.selectedWebcamId')}
              >
                <SelectTrigger
                  variant="minimal"
                  className="w-auto min-w-[120px] max-w-[150px] h-9 rounded-lg"
                >
                  <SelectValue asChild>
                    <div className="flex items-center gap-1.5 text-xs min-w-0">
                      {selectedWebcamId !== 'none' ? (
                        <Webcam size={14} className="text-primary flex-shrink-0" />
                      ) : (
                        <WebcamOffIcon size={14} className="text-muted-foreground/60" />
                      )}
                      {selectedWebcamId !== 'none' ? (
                        <span className="truncate leading-none">
                          {webcams.find(w => w.id === selectedWebcamId)?.name || `Webcam ${selectedWebcamId}`}
                        </span>
                      ) : (
                        <span className="text-muted-foreground leading-none">No webcam</span>
                      )}
                    </div>
                  </SelectValue>
                </SelectTrigger>

                <SelectContent align="center">
                  <SelectItem value="none">
                    <span className="text-muted-foreground">No webcam</span>
                  </SelectItem>
                  {webcams.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Microphone Select - tương tự webcam */}
            <div style={{ WebkitAppRegion: 'no-drag' }}>
              <Select
                value={selectedMicId}
                onValueChange={handleSelectionChange(setSelectedMicId, 'recorder.selectedMicId')}
              >
                <SelectTrigger
                  variant="minimal"
                  className="w-auto min-w-[120px] max-w-[150px] h-9 rounded-lg"
                >
                  <SelectValue asChild>
                    <div className="flex items-center gap-1.5 text-xs min-w-0">
                      {selectedMicId !== 'none' ? (
                        <Mic size={14} className="text-primary" />
                      ) : (
                        <MicOff size={14} className="text-muted-foreground/60" />
                      )}
                      {selectedMicId !== 'none' ? (
                        <span className="truncate">
                          {mics.find(m => m.id === selectedMicId)?.name || `Mic ${selectedMicId}`}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">No microphone</span>
                      )}
                    </div>
                  </SelectValue>
                </SelectTrigger>

                <SelectContent align="center">
                  <SelectItem value="none">
                    <span className="text-muted-foreground">No microphone</span>
                  </SelectItem>
                  {mics.map(m => (
                    <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Cursor Scale - compact with icon */}
            <div className="flex items-center gap-1.5" style={{ WebkitAppRegion: 'no-drag' }}>
              <MousePointer size={14} className="text-muted-foreground/60" />
              <Select value={String(cursorScale)} onValueChange={handleCursorScaleChange}>
                <SelectTrigger
                  variant="minimal"
                  className="w-[52px] h-9 rounded-lg text-xs"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent align="end">
                  {cursorScales.map(s => (
                    <SelectItem key={s.value} value={String(s.value)}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="w-px h-8 bg-border/50"></div>

            {/* Action Buttons */}
            <div className="flex items-center gap-2" style={{ WebkitAppRegion: 'no-drag' }}>
              {/* Record Button */}
              <Button
                onClick={handleStart}
                title="Record"
                disabled={isInitializing || actionInProgress !== 'none'}
                className="h-10 w-10 rounded-full shadow-lg hover:shadow-xl transition-all p-0"
                size="icon"
              >
                {actionInProgress === 'recording' || isInitializing ? (
                  <Loader2 size={18} className="animate-spin" />
                ) : (
                  <Video size={18} />
                )}
              </Button>
              {/* Load Video Button */}
              <Button
                onClick={handleLoadVideo}
                title="Load from video"
                disabled={isInitializing || actionInProgress !== 'none'}
                className="h-10 w-10 rounded-full shadow-lg hover:shadow-xl transition-all p-0"
                variant="secondary"
              >
                {actionInProgress === 'loading' ? (
                  <Loader2 size={18} className="animate-spin" />
                ) : (
                  <>
                    <FolderOpen size={18} />
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* Webcam Preview */}
          <div
            data-interactive="true"
            className={cn(
              "mt-4 mx-auto w-48 aspect-square rounded-[32%] overflow-hidden shadow-2xl bg-black ring-2 ring-border/20 transition-all duration-300",
              (selectedWebcamId !== 'none' && actionInProgress === 'none')
                ? 'opacity-100 scale-100'
                : 'opacity-0 scale-95 pointer-events-none'
            )}
          >
            <video
              ref={webcamPreviewRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

const SourceButton = ({
  icon,
  isActive,
  tooltip,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  icon: React.ReactNode;
  isActive: boolean;
  tooltip?: string;
}) => (
  <button
    className={cn(
      "flex items-center justify-center w-10 h-9 rounded-lg transition-all duration-200 outline-none focus-visible:ring-2 focus-visible:ring-ring",
      isActive
        ? "bg-background shadow-sm text-foreground"
        : "text-muted-foreground hover:text-foreground hover:bg-background/50"
    )}
    title={tooltip}
    {...props}
  >
    {icon}
  </button>
);