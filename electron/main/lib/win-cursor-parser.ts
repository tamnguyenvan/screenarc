import { createHash } from 'node:crypto';
import log from 'electron-log/main';

export interface CursorFrame {
  width: number;
  height: number;
  xhot: number;
  yhot: number;
  delay: number;
  rgba: Buffer;
  hash: string;
}

const hash = (buffer: Buffer) => createHash('sha1').update(buffer).digest('hex');

/** Utility: convert BGRA → RGBA and flip vertically */
function convertToRgba(bgra: Buffer, width: number, height: number): Buffer {
  const pixelDataSize = width * height * 4;
  const flipped = Buffer.alloc(pixelDataSize);
  for (let y = 0; y < height; y++) {
    const srcStart = (height - 1 - y) * (width * 4);
    const dstStart = y * (width * 4);
    bgra.copy(flipped, dstStart, srcStart, srcStart + width * 4);
  }
  const rgba = Buffer.alloc(pixelDataSize);
  for (let i = 0; i < pixelDataSize; i += 4) {
    rgba[i] = flipped[i + 2];
    rgba[i + 1] = flipped[i + 1];
    rgba[i + 2] = flipped[i];
    rgba[i + 3] = flipped[i + 3];
  }
  return rgba;
}

/**
 * Parses a .cur file buffer → {scale: CursorFrame[]}
 */
export class CursorParser {
  constructor(private buffer: Buffer) {}

  parse(): Record<number, CursorFrame[]> {
    const result: Record<number, CursorFrame[]> = {};
    try {
      const type = this.buffer.readUInt16LE(2);
      if (type !== 2) throw new Error('Not a .cur file (type != 2)');
      const count = this.buffer.readUInt16LE(4);
      if (count === 0) throw new Error('No frames in .cur file');

      let offset = 6;
      for (let i = 0; i < count; i++) {
        const width = this.buffer.readUInt8(offset) || 256;
        const height = this.buffer.readUInt8(offset + 1) || 256;
        const xhot = this.buffer.readUInt16LE(offset + 4);
        const yhot = this.buffer.readUInt16LE(offset + 6);
        const size = this.buffer.readUInt32LE(offset + 8);
        const imageOffset = this.buffer.readUInt32LE(offset + 12);
        offset += 16;

        const imgBuf = this.buffer.slice(imageOffset, imageOffset + size);
        const headerSize = imgBuf.readUInt32LE(0);
        const bitCount = imgBuf.readUInt16LE(14);
        if (bitCount !== 32) continue;

        const pixelData = imgBuf.slice(headerSize, headerSize + width * height * 4);
        const rgba = convertToRgba(pixelData, width, height);
        const frame: CursorFrame = { width, height, xhot, yhot, delay: 0, rgba, hash: hash(rgba) };

        const scale = Math.round((width / 32) * 10) / 10;
        if (!result[scale]) result[scale] = [];
        result[scale].push(frame);
      }
    } catch (e) {
      log.error(`[CursorParser] ${(e as Error).message}`);
    }
    return result;
  }
}

/**
 * Parses a .ani buffer → {scale: CursorFrame[]}
 */
export class AniParser {
  constructor(private buffer: Buffer) {}

  private readChunk(offset: number) {
    if (offset + 8 > this.buffer.length) return null;
    const id = this.buffer.toString('ascii', offset, offset + 4);
    const size = this.buffer.readUInt32LE(offset + 4);
    const data = this.buffer.slice(offset + 8, offset + 8 + size);
    const nextOffset = offset + 8 + size + (size % 2);
    return { id, size, data, nextOffset };
  }

  parse(): Record<number, CursorFrame[]> {
    const magic = this.buffer.toString('ascii', 0, 4);
    
    if (magic !== 'RIFF' && magic !== 'LIST') {
      log.warn('[AniParser] Not a RIFF/LIST, trying fallback search for embedded .cur files...');
      return this.parseFallback();
    }

    const frames: Buffer[] = [];
    const delays: number[] = [];
    let offset = 12;

    while (offset < this.buffer.length) {
      const chunk = this.readChunk(offset);
      if (!chunk) break;

      if (chunk.id === 'LIST') {
        const listType = chunk.data.toString('ascii', 0, 4);
        if (listType === 'fram' || listType === 'INFO') {
          let subOffset = 4;
          while (subOffset + 8 < chunk.data.length) {
            const id = chunk.data.toString('ascii', subOffset, subOffset + 4);
            const size = chunk.data.readUInt32LE(subOffset + 4);
            if (id === 'icon' || id === 'ICN#') {
              frames.push(chunk.data.slice(subOffset + 8, subOffset + 8 + size));
            }
            subOffset += 8 + size + (size % 2);
          }
        }
      } else if (chunk.id === 'rate') {
        for (let i = 0; i < chunk.data.length; i += 4)
          delays.push(chunk.data.readUInt32LE(i));
      } else if (chunk.id === 'icon') {
        frames.push(chunk.data);
      }
      offset = chunk.nextOffset;
    }

    if (frames.length === 0) {
      log.warn('[AniParser] No frames found in RIFF chunks, trying fallback...');
      return this.parseFallback();
    }

    return this.parseFrames(frames, delays);
  }

  private parseFallback(): Record<number, CursorFrame[]> {
    const frames: Buffer[] = [];
    let pos = 0;
    
    while (pos < this.buffer.length - 4) {
      if (this.buffer.readUInt16LE(pos) === 0 && this.buffer.readUInt16LE(pos + 2) === 2) {
        const count = this.buffer.readUInt16LE(pos + 4);
        if (count > 0 && count < 100) {
          const minSize = 6 + 16 * count;
          if (pos + minSize <= this.buffer.length) {
            const maxSize = Math.min(this.buffer.length - pos, minSize + 1024 * 1024);
            const slice = this.buffer.slice(pos, pos + maxSize);
            try {
              const cur = new CursorParser(slice);
              const parsed = cur.parse();
              if (Object.keys(parsed).length > 0) {
                frames.push(slice);
                pos += minSize;
                continue;
              }
            // eslint-disable-next-line no-empty
            } catch (e) {}
          }
        }
      }
      pos++;
    }

    if (frames.length === 0) {
      throw new Error('No valid cursor frames found in ANI file');
    }
    return this.parseFrames(frames, []);
  }

  private parseFrames(frames: Buffer[], delays: number[]): Record<number, CursorFrame[]> {
    const result: Record<number, CursorFrame[]> = {};
    
    frames.forEach((frameBuffer, i) => {
      const cur = new CursorParser(frameBuffer);
      const frameSets = cur.parse();
      
      for (const [scaleStr, frameList] of Object.entries(frameSets)) {
        const scale = parseFloat(scaleStr);
        for (const frame of frameList) {
          frame.delay = delays[i] || 1;
        }
        if (!result[scale]) result[scale] = [];
        result[scale].push(...frameList);
      }
    });

    return result;
  }
}