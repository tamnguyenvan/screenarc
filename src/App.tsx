import { useState, useEffect } from 'react';
import { EditorPage } from './pages/EditorPage';
import { RecorderPage } from './pages/RecorderPage';
import { RendererPage } from './pages/RendererPage';
import { useEditorStore } from './store/editorStore';

function App() {
  const [route, setRoute] = useState(window.location.hash);
  const theme = useEditorStore((state) => state.theme);
  const { initializeSettings } = useEditorStore.getState();

  useEffect(() => {
    initializeSettings();
  }, [initializeSettings]);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
      root.setAttribute('data-theme', 'dark');
    } else {
      root.classList.remove('dark');
      root.setAttribute('data-theme', 'light');
    }
  }, [theme]);

  useEffect(() => {
    const handleHashChange = () => {
      setRoute(window.location.hash);
    };

    window.addEventListener('hashchange', handleHashChange);
    return () => {
      window.removeEventListener('hashchange', handleHashChange);
    };
  }, []);

  if (route.startsWith('#renderer')) {
    return <RendererPage />;
  }

  if (route.startsWith('#editor')) {
    return <EditorPage />;
  }

  return <RecorderPage />;
}

export default App;