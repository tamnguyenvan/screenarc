import { Upload, Loader2 } from 'lucide-react';
import { Button } from '../ui/button';

interface ExportButtonProps {
  onClick: () => void;
  isExporting: boolean;
  disabled?: boolean;
}

export function ExportButton({ onClick, isExporting, disabled }: ExportButtonProps) {
  return (
    <Button
      onClick={onClick}
      disabled={isExporting || disabled}
      className="btn-clean bg-primary hover:bg-primary/90 text-primary-foreground font-medium px-4 py-2 rounded-lg transition-colors duration-200 disabled:opacity-60 disabled:cursor-not-allowed"
    >
      {isExporting ? (
        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
      ) : (
        <Upload className="w-4 h-4 mr-2" />
      )}
      {isExporting ? 'Exporting...' : 'Export'}
    </Button>
  );
}