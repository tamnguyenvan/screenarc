import { Minus, Maximize2, X } from 'lucide-react';

export function WindowControls() {
  const handleMinimize = () => window.electronAPI.minimizeWindow();
  const handleMaximize = () => window.electronAPI.maximizeWindow();
  const handleClose = () => window.electronAPI.closeWindow();

  return (
    <div className="flex items-center gap-2" style={{ WebkitAppRegion: 'no-drag' }}>
      <button
        onClick={handleClose}
        className="group w-3 h-3 bg-red-400 rounded-full flex justify-center items-center transition-colors duration-200 hover:bg-red-600"
        aria-label="Close"
      >
        <X className="w-1.5 h-1.5 text-red-900/60 opacity-0 group-hover:opacity-100 transition-opacity duration-200" />
      </button>
      <button
        onClick={handleMinimize}
        className="group w-3 h-3 bg-yellow-400 rounded-full flex justify-center items-center transition-colors duration-200 hover:bg-yellow-600"
        aria-label="Minimize"
      >
        <Minus className="w-1.5 h-1.5 text-yellow-900/60 opacity-0 group-hover:opacity-100 transition-opacity duration-200" />
      </button>
      <button
        onClick={handleMaximize}
        className="group w-3 h-3 bg-green-400 rounded-full flex justify-center items-center transition-colors duration-200 hover:bg-green-600"
        aria-label="Maximize"
      >
        <Maximize2 className="w-1.5 h-1.5 text-green-900/60 opacity-0 group-hover:opacity-100 transition-opacity duration-200" />
      </button>
    </div>
  );
}