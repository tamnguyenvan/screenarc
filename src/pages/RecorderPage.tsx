import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  Mic, Webcam, Monitor, SquareDashed, Loader2,
  Video, X, GripVertical, MousePointer,
  VideoOff, MicOff
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { cn } from '../lib/utils';
import "../index.css";

// --- Constants ---
const LINUX_SCALES = [{ value: 2, label: '2x' }, { value: 1.5, label: '1.5x' }, { value: 1, label: '1x' }];
const WINDOWS_SCALES = [{ value: 3, label: '3x' }, { value: 2, label: '2x' }, { value: 1, label: '1x' }];

// --- Types ---
type RecordingState = 'idle' | 'preparing' | 'recording';
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

    // Standard browser API for other platforms
    try {
      await navigator.mediaDevices.getUserMedia({ [kind === 'videoinput' ? 'video' : 'audio']: true });
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
  const [source, setSource] = useState<RecordingSource>('fullscreen');
  const [displays, setDisplays] = useState<DisplayInfo[]>([]);
  const [selectedDisplayId, setSelectedDisplayId] = useState<string>('');
  const [selectedWebcamId, setSelectedWebcamId] = useState<string>('none');
  const [selectedMicId, setSelectedMicId] = useState<string>('none');
  const [cursorScale, setCursorScale] = useState<number>(1);
  const [isWebcamFading, setIsWebcamFading] = useState(false);

  const { platform, webcams, mics, isInitializing, reload: reloadDevices } = useDeviceLoader();
  const webcamPreviewRef = useRef<HTMLVideoElement>(null);
  const webcamStreamRef = useRef<MediaStream | null>(null);

  // Effect to initialize displays and settings (runs once)
  useEffect(() => {
    const initialize = async () => {
      try {
        const [initialScale, fetchedDisplays] = await Promise.all([
          window.electronAPI.getSetting<number>('recorder.cursorScale'),
          window.electronAPI.getDisplays(),
          // Load saved device selections
          window.electronAPI.getSetting<string>('recorder.selectedWebcamId').then(id => setSelectedWebcamId(id || 'none')),
          window.electronAPI.getSetting<string>('recorder.selectedMicId').then(id => setSelectedMicId(id || 'none')),
        ]);

        const scaleToUse = initialScale ?? 1;
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

  // Effect to handle recording state changes from main process
  useEffect(() => {
    const cleanup = window.electronAPI.onRecordingFinished(() => {
      setRecordingState('idle');
      reloadDevices(); // Re-check devices, especially webcam
    });
    return () => cleanup();
  }, [reloadDevices]);

  // Effect to manage webcam preview stream
  useEffect(() => {
    const videoEl = webcamPreviewRef.current;

    const stopStream = () => {
      if (webcamStreamRef.current) {
        webcamStreamRef.current.getTracks().forEach(track => track.stop());
        webcamStreamRef.current = null;
      }
      if (videoEl) videoEl.srcObject = null;
    };

    if (selectedWebcamId === 'none' || !videoEl || platform === 'win32') { // Preview disabled on Windows for stability
      stopStream();
      return;
    }

    const startStream = async () => {
      stopStream(); // Stop previous stream first
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { deviceId: { exact: selectedWebcamId } } });
        webcamStreamRef.current = stream;
        if (videoEl) videoEl.srcObject = stream;
      } catch (error) {
        console.error("Failed to start webcam preview stream:", error);
      }
    };

    startStream();
    return stopStream;
  }, [selectedWebcamId, platform]);

  const handleStart = async () => {
    setRecordingState('preparing');

    // Await the stream stop to prevent race conditions
    if (webcamStreamRef.current) {
      setIsWebcamFading(true);
      console.log("Stopping webcam preview to release device...");
      webcamStreamRef.current.getTracks().forEach(track => track.stop());
      webcamStreamRef.current = null;
      if (webcamPreviewRef.current) webcamPreviewRef.current.srcObject = null;
      // Give the system a moment to release the device
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
          // Use friendly name for Windows dshow
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
        setRecordingState('idle');
        setIsWebcamFading(false);
      } else {
        setRecordingState('recording');
      }
    } catch (error) {
      console.error('Failed to start recording:', error);
      setRecordingState('idle');
      setIsWebcamFading(false);
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

  const cursorScales = useMemo(() => platform === 'win32' ? WINDOWS_SCALES : LINUX_SCALES, [platform]);

  if (recordingState === 'recording') return null;

  return (
    <div className="relative h-screen w-screen bg-transparent select-none">
      <div className="absolute top-0 left-0 right-0 flex flex-col items-center pt-8">
        <div data-interactive="true" className="relative flex items-stretch gap-4 p-2 rounded-2xl bg-transparent text-card-foreground">
          <div className="flex items-stretch gap-4 p-2 rounded-2xl bg-card border border-border text-card-foreground shadow-lg backdrop-blur-xl" style={{ WebkitAppRegion: 'drag' }}>
            <button onClick={() => window.electronAPI.closeWindow()} style={{ WebkitAppRegion: 'no-drag' }} className="absolute -top-3 -left-3 z-20 flex items-center justify-center w-6 h-6 rounded-full bg-card border border-border hover:bg-destructive text-muted-foreground hover:text-white shadow-lg" aria-label="Close Recorder">
              <X className="w-4 h-4" />
            </button>
            <div className="flex items-center justify-center pl-2 pr-1 cursor-grab" style={{ WebkitAppRegion: 'drag' }}><GripVertical className="w-5 h-5 text-muted-foreground/50" /></div>
            <div className="flex items-center p-1 bg-muted rounded-2xl border border-border" style={{ WebkitAppRegion: 'no-drag' }}>
              <SourceButton label="Full Screen" icon={<Monitor size={16} />} isActive={source === 'fullscreen'} onClick={() => setSource('fullscreen')} />
              <SourceButton label="Area" icon={<SquareDashed size={16} />} isActive={source === 'area'} onClick={() => setSource('area')} />
            </div>
            <div className="w-px bg-border/50"></div>
            <div style={{ WebkitAppRegion: 'no-drag' }}>
              <Button onClick={handleStart} disabled={isInitializing || recordingState === 'preparing'} variant="default" size="icon" className="h-12 w-12 rounded-full">
                {recordingState === 'preparing' || isInitializing ? <Loader2 size={20} className="animate-spin" /> : <Video size={20} />}
              </Button>
            </div>
            <div className="w-px bg-border/50"></div>
            <div className="flex items-center" style={{ WebkitAppRegion: 'no-drag' }}>
              <Select value={selectedDisplayId} onValueChange={setSelectedDisplayId} disabled={source !== 'fullscreen'}>
                <SelectTrigger className="w-12 h-10 rounded-2xl"><SelectValue asChild><Monitor size={18} className="text-primary" /></SelectValue></SelectTrigger>
                <SelectContent>{displays.map(d => <SelectItem key={d.id} value={String(d.id)}>{d.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-3" style={{ WebkitAppRegion: 'no-drag' }}>
              <Select value={selectedWebcamId} onValueChange={handleSelectionChange(setSelectedWebcamId, 'recorder.selectedWebcamId')}>
                <SelectTrigger className="w-12 h-10 rounded-2xl"><SelectValue asChild>{selectedWebcamId !== 'none' ? <Webcam size={18} className="text-primary" /> : <VideoOff size={18} className="text-muted-foreground" />}</SelectValue></SelectTrigger>
                <SelectContent><SelectItem value="none">No Camera</SelectItem>{webcams.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
              <Select value={selectedMicId} onValueChange={handleSelectionChange(setSelectedMicId, 'recorder.selectedMicId')}>
                <SelectTrigger className="w-12 h-10 rounded-2xl"><SelectValue asChild>{selectedMicId !== 'none' ? <Mic size={18} className="text-primary" /> : <MicOff size={18} className="text-muted-foreground" />}</SelectValue></SelectTrigger>
                <SelectContent><SelectItem value="none">No Microphone</SelectItem>{mics.map(m => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}</SelectContent>
              </Select>
              <div className="flex items-center gap-2" style={{ WebkitAppRegion: 'no-drag' }}>
                <MousePointer size={18} className="text-muted-foreground" />
                <Select value={String(cursorScale)} onValueChange={handleCursorScaleChange}>
                  <SelectTrigger className="w-16 h-10 border-border/50 bg-background/60"><SelectValue /></SelectTrigger>
                  <SelectContent>{cursorScales.map(s => <SelectItem key={s.value} value={String(s.value)}>{s.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </div>
        {selectedWebcamId !== 'none' && platform !== 'win32' && (
          <div data-interactive="true" className={cn(
            "mt-4 w-48 aspect-square rounded-[35%] overflow-hidden shadow-2xl bg-black",
            "transition-opacity duration-150",
            isWebcamFading ? "opacity-0" : "opacity-100"
          )}>
            <video ref={webcamPreviewRef} autoPlay playsInline muted className="w-full h-full object-cover" />
          </div>
        )}
      </div>
    </div>
  );
}

const SourceButton = ({ label, icon, isActive, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string; icon: React.ReactNode; isActive: boolean; }) => (
  <button className={cn("flex items-center gap-2 px-4 py-2 rounded-2xl text-sm font-medium transition-all duration-200 outline-none focus-visible:ring-2 focus-visible:ring-ring", isActive ? "bg-card shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground")} {...props}>
    {icon}
    <span>{label}</span>
  </button>
);