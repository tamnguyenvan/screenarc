import { useState } from 'react';
import { cn } from '../../lib/utils';
import { SettingsIcon, InfoIcon } from '../ui/icons';
import { Keyboard } from 'lucide-react';
import { GeneralTab } from './GeneralTab';
import { AboutTab } from './AboutTab';
import { ShortcutsTab } from './ShortcutsTab';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type SettingsTab = 'general' | 'shortcuts' | 'about';

const TABS: { id: SettingsTab; label: string; icon: React.ReactNode }[] = [
  { id: 'general', label: 'General', icon: <SettingsIcon className="w-5 h-5" /> },
  { id: 'shortcuts', label: 'Shortcuts', icon: <Keyboard className="w-5 h-5" /> },
  { id: 'about', label: 'About', icon: <InfoIcon className="w-5 h-5" /> },
];

export function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');

  if (!isOpen) return null;

  const renderContent = () => {
    switch (activeTab) {
      case 'general':
        return <GeneralTab />;
      case 'shortcuts':
        return <ShortcutsTab />;
      case 'about':
        return <AboutTab />;
      default:
        return null;
    }
  };

  return (
    <div className="modal-backdrop z-50 flex items-center justify-center" onClick={onClose}>
      <div
        className="card-clean w-full max-w-3xl h-[60vh] max-h-[500px] flex flex-row m-4 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Sidebar */}
        <div className="w-56 flex-shrink-0 bg-muted/40 p-4 border-r border-border flex flex-col">
          <h2 className="text-lg font-bold text-foreground px-2 mb-4">Settings</h2>
          <div className="space-y-1">
            {TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'w-full flex items-center gap-3 text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                  activeTab === tab.id
                    ? 'bg-accent text-primary'
                    : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
                )}
              >
                {tab.icon}
                <span>{tab.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto relative">
          {renderContent()}
        </div>
      </div>
    </div>
  );
}