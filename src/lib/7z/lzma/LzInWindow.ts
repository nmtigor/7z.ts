/** 80**************************************************************************
 * Ref. [[lzma1]/src/lz-in-window.ts](https://github.com/xseman/lzma1/blob/master/src/lz-in-window.ts)
 *    * Refactor heavily
 *
 * @module lib/7z/lzma/LzInWindow
 * @license MIT
 ******************************************************************************/

import { MatchFinder } from "./MatchFinder.ts";
import { arraycopy } from "./util.ts";
/*80--------------------------------------------------------------------------*/

/**
 * LzInWindow - Input Window helper for LZMA encoding
 *
 * This class manages the input window operations for LZMA encoding,
 * including buffer management, position tracking, and input stream reading.
 */
export class LzInWindow {
  readonly #matchFinder: MatchFinder;

  constructor(matchFinder: MatchFinder) {
    this.#matchFinder = matchFinder;
  }
  /*64||||||||||||||||||||||||||||||||||||||||||||||||||||||||||*/

  /** Get a byte at the specified index relative to current position */
  getIndexByte(index: number): number {
    const byte = this.#matchFinder.bufferBase[
      this.#matchFinder.bufferOffset + this.#matchFinder.pos + index
    ];

    return byte;
  }

  /** Calculate match length between current position and a previous position */
  getMatchLen(index: number, distance: number, limit: number): number {
    if (this.#matchFinder.streamEndWasReached) {
      if (
        this.#matchFinder.pos + index + limit > this.#matchFinder.streamPos
      ) {
        limit = this.#matchFinder.streamPos - (this.#matchFinder.pos + index);
      }
    }

    ++distance;
    let i;
    const pby = this.#matchFinder.bufferOffset + this.#matchFinder.pos +
      index;

    for (
      i = 0;
      i < limit &&
      this.#matchFinder.bufferBase[pby + i] ==
        this.#matchFinder.bufferBase[pby + i - distance];
      ++i
    );

    return i;
  }

  /** Get number of available bytes in the input window */
  getNumAvailableBytes(): number {
    return this.#matchFinder.streamPos - this.#matchFinder.pos;
  }

  /** Move buffer block when reaching buffer boundaries */
  moveBlock(): void {
    let offset = this.#matchFinder.bufferOffset + this.#matchFinder.pos -
      this.#matchFinder.keepSizeBefore;

    if (offset > 0) {
      --offset;
    }

    const numBytes = this.#matchFinder.bufferOffset +
      this.#matchFinder.streamPos - offset;

    for (let i = 0; i < numBytes; ++i) {
      this.#matchFinder.bufferBase[i] =
        this.#matchFinder.bufferBase[offset + i];
    }

    this.#matchFinder.bufferOffset -= offset;
  }

  /** Move position by one and handle buffer management */
  movePos(): void {
    this.#matchFinder.pos += 1;

    if (this.#matchFinder.pos > this.#matchFinder.posLimit) {
      const pointerToPosition = this.#matchFinder.bufferOffset +
        this.#matchFinder.pos;

      if (pointerToPosition > this.#matchFinder.ptToLastSafePos) {
        this.moveBlock();
      }

      this.readBlock();
    }
  }

  /** Read a block of data from the input stream */
  readBlock(): void {
    if (this.#matchFinder.streamEndWasReached) return;

    while (true) {
      const size = -this.#matchFinder.bufferOffset +
        this.#matchFinder.blockSize - this.#matchFinder.streamPos;
      if (!size) {
        return;
      }

      const bytesRead = this.readFromStream(
        this.#matchFinder.bufferOffset + this.#matchFinder.streamPos,
        size,
      );

      if (bytesRead == -1) {
        this.#matchFinder.posLimit = this.#matchFinder.streamPos;
        const pointerToPosition = this.#matchFinder.bufferOffset +
          this.#matchFinder.posLimit;

        if (pointerToPosition > this.#matchFinder.ptToLastSafePos) {
          this.#matchFinder.posLimit = this.#matchFinder.ptToLastSafePos -
            this.#matchFinder.bufferOffset;
        }

        this.#matchFinder.streamEndWasReached = true;
        return;
      }

      this.#matchFinder.streamPos += bytesRead;
      if (
        this.#matchFinder.streamPos >=
          this.#matchFinder.pos + this.#matchFinder.keepSizeAfter
      ) {
        this.#matchFinder.posLimit = this.#matchFinder.streamPos -
          this.#matchFinder.keepSizeAfter;
      }
    }
  }

  /** Reduce all position offsets by the specified value */
  reduceOffsets(subValue: number): void {
    this.#matchFinder.bufferOffset += subValue;
    this.#matchFinder.posLimit -= subValue;
    this.#matchFinder.pos -= subValue;
    this.#matchFinder.streamPos -= subValue;
  }

  /** Read data from the input stream into the buffer */
  private readFromStream(off: number, len: number): number {
    const stream = this.#matchFinder.stream!;
    const buffer = this.#matchFinder.bufferBase;

    if (stream.pos >= stream.count) return -1;

    //jjjj TOCLEANUP
    // let srcBuf: number[];
    // if (stream.buf instanceof Uint8Array) {
    //   srcBuf = Array.from(stream.buf as Uint8Array);
    // } else if (stream.buf instanceof ArrayBuffer) {
    //   srcBuf = Array.from(new Uint8Array(stream.buf as ArrayBuffer));
    // } else {
    //   srcBuf = stream.buf as number[];
    // }
    const srcBuf = stream.buf instanceof Uint8Array
      ? Array.from(stream.buf)
      : stream.buf;

    len = Math.min(len, stream.count - stream.pos);
    arraycopy(srcBuf, stream.pos, buffer, off, len);
    stream.pos += len;

    return len;
  }
}
/*80--------------------------------------------------------------------------*/
