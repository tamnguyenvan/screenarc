import { Download } from 'lucide-react';
import { Button } from '../ui/button';

interface UpdateNotificationProps {
  info: {
    version: string;
    url: string;
  };
}

export function UpdateNotification({ info }: UpdateNotificationProps) {
  const handleDownload = () => {
    window.electronAPI.openExternal(info.url);
  };

  return (
    <div className="animate-in fade-in-50 slide-in-from-top-2 duration-500">
      <Button
        data-version={info.version}
        variant="secondary"
        size="sm"
        onClick={handleDownload}
        aria-label="Update Available"
        className="bg-sky-500/10 hover:bg-sky-500/20 text-sky-600 dark:text-sky-400 border border-sky-500/20 h-8"
      >
        <Download className="w-4 h-4 mr-2" />
        Update Available
      </Button>
    </div>
  );
}