// Handlers for file system-related IPC (file system).

import fs from 'node:fs/promises';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function handleReadFile(_event: any, filePath: string): Promise<string> {
  return fs.readFile(filePath, 'utf-8');
}