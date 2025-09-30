// Handlers for recording-related IPC (recording).

import { startRecording } from '../../features/recording-manager';
import { checkLinuxTools } from '../../lib/utils';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function handleStartRecording(_event: any, options: any) {
  return startRecording(options);
}

export function handleLinuxCheckTools() {
  return checkLinuxTools();
}