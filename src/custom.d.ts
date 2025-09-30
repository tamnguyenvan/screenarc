import 'react';

declare module 'react' {
  interface CSSProperties {
    WebkitAppRegion?: 'drag' | 'no-drag' | 'drag-window' | 'no-drag-window';
    // Add other custom CSS properties here if needed
  }
}
