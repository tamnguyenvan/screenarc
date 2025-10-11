import { useEditorStore } from '../../store/editorStore';
import { RegionSettingsPanel } from './RegionSettingsPanel';
import { AudioLines, Webcam, PanelsTopLeft, LineSquiggle, MousePointer } from 'lucide-react';
import { BackgroundSettings } from './sidepanel/BackgroundSettings';
import { FrameEffectsSettings } from './sidepanel/FrameEffectsSettings';
import { CameraSettings } from './sidepanel/CameraSettings';
import { CursorSettings } from './sidepanel/CursorSettings';
import { AnimationSettingsPanel } from './sidepanel/AnimationSettingsPanel';
import { useShallow } from 'zustand/react/shallow';
import { useEffect, useState, useMemo } from 'react';
import { cn } from '../../lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';

type SidePanelTab = 'general' | 'camera' | 'cursor' | 'audio' | 'animation' | 'settings';

interface TabButtonProps {
  label: string;
  icon: React.ReactNode;
  isActive: boolean;
  onClick: () => void;
  disabled?: boolean;
}

function TabButton({ label, icon, isActive, onClick, disabled }: TabButtonProps) {
  return (
    <TooltipProvider delayDuration={500}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={onClick}
            disabled={disabled}
            className={cn(
              'w-full flex flex-col items-center justify-center p-1 rounded-lg transition-colors',
              'hover:bg-accent/50 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 ring-offset-sidebar',
              isActive
                ? 'bg-accent text-primary'
                : 'text-muted-foreground hover:text-foreground',
              disabled && 'opacity-50 cursor-not-allowed hover:bg-transparent'
            )}
            aria-label={label}
          >
            <div className="w-6 h-6 flex items-center justify-center">
              {icon}
            </div>
          </button>
        </TooltipTrigger>
        <TooltipContent 
          side="left" 
          sideOffset={8}
          className="capitalize px-3 py-1.5 text-sm font-medium bg-popover text-popover-foreground shadow-md rounded-md border border-border/50 dark:bg-popover/95 dark:border-border/80 dark:text-foreground"
        >
          <p className="whitespace-nowrap">{label}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function FrameSettingsPanel() {
  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-6 border-b border-sidebar-border">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <PanelsTopLeft className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-sidebar-foreground">General Settings</h2>
            <p className="text-sm text-muted-foreground">Customize your video's appearance</p>
          </div>
        </div>
      </div>
      {/* Content */}
      <div className="flex-1 overflow-y-auto stable-scrollbar"> {/* MODIFIED HERE */}
        <div className="p-6 space-y-8">
          <BackgroundSettings />
          <FrameEffectsSettings />
        </div>
      </div>
    </div>
  );
}

function AudioSettingsPanel() {
  return (
    <div className="h-full flex flex-col">
      <div className="p-6 border-b border-sidebar-border">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <AudioLines className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-sidebar-foreground">Audio Settings</h2>
            <p className="text-sm text-muted-foreground">Adjust volume and effects</p>
          </div>
        </div>
      </div>
      <div className="flex-1 p-6 flex items-center justify-center stable-scrollbar"> {/* MODIFIED HERE */}
        <p className="text-muted-foreground text-sm">Audio controls coming soon.</p>
      </div>
    </div>
  );
}

export function SidePanel() {
  const [activeTab, setActiveTab] = useState<SidePanelTab>('general');

  // Get necessary states from the store
  const { selectedRegionId, zoomRegions, cutRegions, webcamVideoUrl, platform, setSelectedRegionId } = useEditorStore(
    useShallow(state => ({
      selectedRegionId: state.selectedRegionId,
      zoomRegions: state.zoomRegions,
      cutRegions: state.cutRegions,
      webcamVideoUrl: state.webcamVideoUrl,
      platform: state.platform,
      setSelectedRegionId: state.setSelectedRegionId,
    }))
  );

  // Optimize region lookup using useMemo
  const selectedRegion = useMemo(() => {
    if (!selectedRegionId) return null;
    return zoomRegions[selectedRegionId] || cutRegions[selectedRegionId];
  }, [selectedRegionId, zoomRegions, cutRegions]);

  // Auto switch to 'general' tab when a region is selected
  useEffect(() => {
    if (selectedRegion) {
      setActiveTab('general');
    }
  }, [selectedRegion]);
  
  // Handle Escape key to clear selection
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && selectedRegionId) {
        setSelectedRegionId(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedRegionId, setSelectedRegionId]);

  // Render content based on active tab
  const renderContent = () => {
    switch (activeTab) {
      case 'general':
        return selectedRegion
          ? <RegionSettingsPanel region={selectedRegion} />
          : <FrameSettingsPanel />;
      case 'camera':
        return <CameraSettings />;
      case 'cursor':
        return <CursorSettings />;
      case 'audio':
        return <AudioSettingsPanel />;
      case 'animation':
        return <AnimationSettingsPanel />;
      default:
        return <FrameSettingsPanel />;
    }
  };

  return (
    <div className="h-full flex">
      {/* Main content area */}
      <div className="flex-1 bg-sidebar overflow-hidden"> {/* REMOVED overflow-y-auto here */}
        {renderContent()}
      </div>

      {/* Vertical Tab Navigator (Always visible) */}
      <div className="w-[64px] flex-shrink-0 p-3 border-l border-sidebar-border bg-sidebar/80">
        <div className="flex flex-col items-center space-y-2">
          <TabButton
            label="General"
            icon={<PanelsTopLeft className="w-5 h-5" />}
            isActive={activeTab === 'general'}
            onClick={() => setActiveTab('general')}
          />
          <TabButton
            label="Camera"
            icon={<Webcam className="w-5 h-5" />}
            isActive={activeTab === 'camera'}
            onClick={() => setActiveTab('camera')}
            disabled={!webcamVideoUrl}
          />
          <TabButton
            label="Cursor"
            icon={<MousePointer className="w-5 h-5" />}
            isActive={activeTab === 'cursor'}
            onClick={() => setActiveTab('cursor')}
            disabled={platform !== 'win32'}
          />
          <TabButton
            label="Audio"
            icon={<AudioLines className="w-5 h-5" />}
            isActive={activeTab === 'audio'}
            onClick={() => setActiveTab('audio')}
          />
          <TabButton
            label="Animation"
            icon={<LineSquiggle className="w-5 h-5" />}
            isActive={activeTab === 'animation'}
            onClick={() => setActiveTab('animation')}
          />
        </div>
      </div>
    </div>
  );
}
