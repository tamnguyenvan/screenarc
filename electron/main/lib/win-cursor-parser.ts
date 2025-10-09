// electron/main/lib/win-cursor-parser.ts

import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import log from 'electron-log/main';

const hash = (buffer: Buffer) => createHash('sha1').update(buffer).digest('hex');

export interface CursorFrame {
  width: number;
  height: number;
  xhot: number;
  yhot: number;
  delay: number; // in jiffies (1/60th of a second)
  rgba: Buffer;
  hash: string;
}

/**
 * Parses a .cur file buffer.
 * A .cur file is essentially a single-frame icon file.
 */
class CursorParser {
  constructor(private buffer: Buffer) {}

  parse(): CursorFrame[] {
    try {
      const type = this.buffer.readUInt16LE(2);
      if (type !== 2) throw new Error('Not a .cur file (type is not 2)');
      const count = this.buffer.readUInt16LE(4);
      if (count === 0) throw new Error('No images in .cur file');

      const entryOffset = 6;
      const width = this.buffer.readUInt8(entryOffset) || 256;
      const height = this.buffer.readUInt8(entryOffset + 1) || 256;
      const xhot = this.buffer.readUInt16LE(entryOffset + 4);
      const yhot = this.buffer.readUInt16LE(entryOffset + 6);
      const size = this.buffer.readUInt32LE(entryOffset + 8);
      const imageOffset = this.buffer.readUInt32LE(entryOffset + 12);

      const imgBuf = this.buffer.slice(imageOffset, imageOffset + size);

      const headerSize = imgBuf.readUInt32LE(0);
      const bmpHeight = imgBuf.readInt32LE(8);

      if (bmpHeight !== height * 2) {
        throw new Error('Unsupported cursor format (height mismatch)');
      }

      const bitCount = imgBuf.readUInt16LE(14);
      if (bitCount !== 32) {
        throw new Error(`Unsupported bit depth: ${bitCount}`);
      }
      
      const pixelDataOffset = headerSize;
      const pixelDataSize = width * height * 4;
      const bgra = imgBuf.slice(pixelDataOffset, pixelDataOffset + pixelDataSize);

      const flippedBgra = Buffer.alloc(pixelDataSize);
      for (let y = 0; y < height; y++) {
        const srcStart = (height - 1 - y) * (width * 4);
        const dstStart = y * (width * 4);
        bgra.copy(flippedBgra, dstStart, srcStart, srcStart + width * 4);
      }
      
      // Convert BGRA to RGBA for canvas
      const rgba = Buffer.alloc(pixelDataSize);
      for (let i = 0; i < pixelDataSize; i += 4) {
        rgba[i] = flippedBgra[i + 2]; // R
        rgba[i + 1] = flippedBgra[i + 1]; // G
        rgba[i + 2] = flippedBgra[i]; // B
        rgba[i + 3] = flippedBgra[i + 3]; // A
      }
      
      const frame: CursorFrame = { width, height, xhot, yhot, delay: 0, rgba, hash: hash(rgba) };
      return [frame];
    } catch (e) {
      log.error(`[WinCursorParser] Error parsing .cur buffer: ${(e as Error).message}`);
      return [];
    }
  }
}

/**
 * Parses a .ani file buffer, which contains multiple frames.
 */
class AniParser {
  constructor(private buffer: Buffer) {}

  private readChunk(offset: number) {
    const id = this.buffer.toString('ascii', offset, offset + 4);
    const size = this.buffer.readUInt32LE(offset + 4);
    const data = this.buffer.slice(offset + 8, offset + 8 + size);
    const nextOffset = offset + 8 + size + (size % 2); // padded to 2 bytes
    return { id, size, data, nextOffset };
  }

  parse(): CursorFrame[] {
    if (this.buffer.toString('ascii', 0, 4) !== 'RIFF' || this.buffer.toString('ascii', 8, 12) !== 'ACON') {
      throw new Error('Not a valid ANI file');
    }

    const frames: Buffer[] = [];
    let delays: number[] = [];
    let offset = 12;

    while (offset < this.buffer.length) {
      const chunk = this.readChunk(offset);
      if (chunk.id === 'LIST' && chunk.data.toString('ascii', 0, 4) === 'fram') {
        let frameOffset = 4;
        while (frameOffset < chunk.data.length) {
          const frameChunk = this.readChunk(frameOffset + chunk.data.byteOffset);
          if (frameChunk.id === 'icon') {
            frames.push(frameChunk.data);
          }
          frameOffset = frameChunk.nextOffset - chunk.data.byteOffset;
        }
      } else if (chunk.id === 'rate') {
        delays = [];
        for (let i = 0; i < chunk.data.length; i += 4) {
          delays.push(chunk.data.readUInt32LE(i));
        }
      }
      offset = chunk.nextOffset;
    }

    const parsedFrames: CursorFrame[] = [];
    frames.forEach((frameBuffer, index) => {
      const curParser = new CursorParser(frameBuffer);
      const curFrames = curParser.parse();
      if (curFrames.length > 0) {
        parsedFrames.push({
          ...curFrames[0],
          delay: delays[index] || 1,
        });
      }
    });

    return parsedFrames;
  }
}

/**
 * Parses a cursor file from a given path, handling both .cur and .ani.
 */
export async function parseCursorFile(filePath: string): Promise<CursorFrame[]> {
  try {
    const buffer = await fs.readFile(filePath);
    if (filePath.toLowerCase().endsWith('.ani')) {
      const parser = new AniParser(buffer);
      return parser.parse();
    } else { // .cur
      const parser = new CursorParser(buffer);
      return parser.parse();
    }
  } catch (error) {
    log.error(`[WinCursorParser] Failed to parse cursor file ${filePath}:`, error);
    return [];
  }
}