import fs from 'node:fs/promises';
import path from 'node:path';
import log from 'electron-log/main';
import { AniParser, CursorParser } from './win-cursor-parser';

export interface CursorFrame {
  width: number;
  height: number;
  xhot: number;
  yhot: number;
  delay: number;
  rgba: Buffer;
  hash: string;
}
type CursorPack = Record<number, Record<string, CursorFrame[]>>;

/**
 * Detects the file type from a buffer.
 */
function detectFileType(buffer: Buffer): 'ani' | 'cur' | 'unknown' {
  if (buffer.length < 16) return 'unknown';
  if (buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'ACON') {
    return 'ani';
  }
  const type = buffer.readUInt16LE(2);
  if (type === 2) return 'cur';
  return 'unknown';
}

/**
 * Parses a .cpack file with the CPAK format.
 */
export async function loadCursorThemeFromFile(cpackPath: string): Promise<CursorPack> {
  const buf = await fs.readFile(cpackPath);
  if (buf.toString('ascii', 0, 4) !== 'CPAK') {
    throw new Error('Incorrect CPAK format');
  }

  const total = buf.readUInt32LE(4);
  let offset = 8;
  const result: CursorPack = {};

  for (let i = 0; i < total; i++) {
    const type = buf.readUInt8(offset); offset += 1; // 0 for CUR, 1 for ANI, 2 for auto-detect
    const nameLen = buf.readUInt32LE(offset); offset += 4;
    const name = buf.toString('utf8', offset, offset + nameLen);
    offset += nameLen;
    const dataLen = buf.readUInt32LE(offset); offset += 4;
    const data = buf.slice(offset, offset + dataLen);
    offset += dataLen;

    let parser: AniParser | CursorParser;
    const detectedType = type === 2 ? detectFileType(data) : type === 1 ? 'ani' : 'cur';

    if (detectedType === 'ani') {
      parser = new AniParser(data);
    } else if (detectedType === 'cur') {
      parser = new CursorParser(data);
    } else {
      log.warn(`[CPackParser] Skipping ${name} (unknown file type)`);
      continue;
    }

    try {
      const parsed = parser.parse();
      for (const [scaleStr, frames] of Object.entries(parsed)) {
        const scale = parseFloat(scaleStr);
        if (!result[scale]) result[scale] = {};
        const baseName = path.basename(name, path.extname(name));
        result[scale][baseName] = frames;
      }
      log.info(`[CPackParser] ✅ Parsed ${name}`);
    } catch (e) {
      log.error(`[CPackParser] ❌ Error parsing ${name}:`, e);
    }
  }
  return result;
}
