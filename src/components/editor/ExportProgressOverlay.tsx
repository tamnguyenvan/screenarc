import { Loader2 } from 'lucide-react';

interface ExportProgressOverlayProps {
  isExporting: boolean;
  progress: number;
}

export function ExportProgressOverlay({ isExporting, progress }: ExportProgressOverlayProps) {
  if (!isExporting) return null;

  return (
    <div className="modal-backdrop z-50 flex items-center justify-center">
      <div className="card-clean p-8 w-full max-w-sm flex flex-col items-center m-4">
        <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-4">
          <Loader2 className="w-6 h-6 text-primary animate-spin" />
        </div>

        <h2 className="text-lg font-semibold text-foreground mb-1">Exporting</h2>
        <p className="text-sm text-muted-foreground mb-6 text-center">Please wait while we process your video</p>

        <div className="progress-bar w-full h-2 mb-3">
          <div
            className="progress-fill h-full"
            style={{ width: `${progress}%` }}
          />
        </div>

        <p className="text-sm font-medium text-primary">{progress}%</p>
      </div>
    </div>
  );
}