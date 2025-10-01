// START OF FILE src_components_settings_AboutTab.tsx
import { useState, useEffect } from 'react';
import { Button } from '../ui/button';
import { Github } from 'lucide-react';

export function AboutTab() {
  const [appVersion, setAppVersion] = useState('...');

  useEffect(() => {
    // Fetch the app version from the main process
    window.electronAPI.getVersion().then(version => {
      setAppVersion(version);
    });
  }, []);

  const openLink = (url: string) => {
    window.electronAPI.openExternal(url);
  };

  return (
    <div className="p-8 text-center flex flex-col items-center justify-center h-full">
      <img
        src="media://screenarc-appicon.png"
        alt="ScreenArc Logo"
        className="w-24 h-24 mb-4 rounded-3xl shadow-lg"
      />
      <h2 className="text-2xl font-bold text-foreground">ScreenArc</h2>
      <p className="text-sm text-muted-foreground mb-6">Version {appVersion}</p>

      <div className="text-sm text-foreground space-y-2">
        <p>Created with ❤️ by Tam Nguyen.</p>
        <p>A modern screen recorder and editor designed to be simple and powerful.</p>
      </div>

      <div className="mt-8 flex items-center gap-4">
        <Button
          variant="secondary"
          onClick={() => openLink('https://github.com/tamnguyenvan/screenarc')}
        >
          <Github className="w-4 h-4 mr-2" />
          GitHub Repository
        </Button>
      </div>

      <p className="absolute bottom-4 text-xs text-muted-foreground">
        Built with Electron, React, and TypeScript.
      </p>
    </div>
  );
}
// END OF FILE src_components_settings_AboutTab.tsx