/** 80**************************************************************************
 * Ref. [[lzma1]/src/lz-window.ts](https://github.com/xseman/lzma1/blob/master/src/lz-window.ts)
 *    * Refactor heavily
 *
 * @module lib/7z/lzma/LzOutWindow
 * @license MIT
 ******************************************************************************/

import type { uint, uint32, uint8 } from "@fe-lib/alias.ts";
import "@fe-lib/jslang.ts";
import * as Is from "@fe-lib/util/is.ts";
import type { BufferWithCount, Writer } from "./streams.ts";
import { isBufferWithCount } from "./streams.ts";
/*80--------------------------------------------------------------------------*/

export class LzOutWindow {
  windowSize: uint32 = 0;
  buffer: uint8[] | null = null;

  stream: Writer | null = null;

  /** in `buffer`, `>= streamPos` */
  pos: uint = 0;
  /** in `buffer`, `<= pos` */
  streamPos: uint = 0;
  //jjjj TOCLEANUP
  // get isEmpty(): boolean {
  //   return this.streamPos === 0;
  // }

  //jjjj TOCLEANUP
  // // Private Go-style properties
  // private w: Writer | null = null;
  // private buf: number[] = [];

  constructor(writer?: Writer) {
    if (writer) this.stream = writer;
    //jjjj TOCLEANUP
    // this.windowSize = windowSize;
    // this.buf = new Array(windowSize);
    // this.buffer = this.buf;
    // this.pos = 0;
    // this.streamPos = 0;
  }

  Create(windowSize: uint32) {
    this.windowSize = windowSize;
    this.buffer = Array.mock(windowSize);
  }

  Init() {
    this.pos = 0;
    this.streamPos = 0;
  }

  //jjjj TOCLEANUP
  // /** Copy a block of data from a previous position (LZ77-style) */
  // copyBlock(distance: number, length: number): void {
  //   if (!this.buffer) return;

  //   for (let i = 0; i < length; i++) {
  //     // Get byte from previous position
  //     let sourcePos = this.pos - distance - 1;
  //     if (sourcePos < 0) {
  //       sourcePos += this.windowSize;
  //     }

  //     const byte = this.buffer[sourcePos];
  //     this.PutByte(byte);
  //   }
  // }
  /** `in( this.buffer)` */
  CopyBlock(dist: uint32, len: uint): void {
    let pos = this.pos - dist - 1;
    if (pos < 0) pos += this.windowSize;

    for (; len--;) {
      if (pos >= this.windowSize) pos = 0;

      this.buffer![this.pos] = this.buffer![pos];
      this.pos += 1;
      pos += 1;

      if (this.pos >= this.windowSize) this.flush();
    }
  }

  /** Put a single byte into the window */
  PutByte(byte: uint8): void {
    if (!this.buffer) return;

    this.buffer[this.pos] = byte;
    this.pos++;
    if (this.pos >= this.windowSize) this.flush();
  }

  /** Get a byte from a relative position */
  GetByte(distance: uint32): uint8 {
    if (!this.buffer) return 0;

    let pos = this.pos - distance - 1;
    if (pos < 0) {
      pos += this.windowSize;
    }
    return this.buffer[pos];
  }

  /**
   * @headconst @param outbuf_x
   * @const @param data_x
   * @const @param off_x
   * @const @param len_x
   */
  #write(
    outbuf_x: BufferWithCount,
    data_x: uint8[],
    off_x: uint,
    len_x: uint,
  ): void {
    const outbufCount = outbuf_x.count;
    const requiredSize = outbufCount + len_x;
    if (requiredSize > outbuf_x.buf.length) {
      const newSize = Math.max(outbuf_x.buf.length * 2, requiredSize);
      //jjjj TOCLEANUP
      // const newBuf = new Array(newSize);
      // for (let i = 0; i < outbufCount; i++) {
      //   newBuf[i] = outbuf_x.buf[i];
      // }
      outbuf_x.buf.length = outbufCount;
      const newBuf = Array.mock<uint8>(newSize).fillArray(outbuf_x.buf);
      outbuf_x.buf = newBuf;
    }

    /* Copy data */
    for (let i = 0; i < len_x; i++) {
      outbuf_x.buf[outbufCount + i] = data_x[off_x + i];
    }
    outbuf_x.count += len_x;
  }

  //jjjj TOCLEANUP
  // /** Flush buffered data to output writer */
  // flush_xxx(): void {
  //   if (this.stream && this.buffer && this.pos > 0) {
  //     const dataToWrite = this.buffer.slice(0, this.pos);
  //     this.stream.write(dataToWrite);
  //     this.pos = 0;
  //   }
  // }

  flush(): void {
    const size = this.pos - this.streamPos;
    if (!size) return;

    if (this.stream && this.buffer) {
      const outbuf = this.stream;
      if (isBufferWithCount(outbuf)) {
        this.#write(outbuf, this.buffer, this.streamPos, size);
      } else if (Is.func(outbuf.write)) {
        /* Fallback: write directly if it's a plain Writer */
        const slice = this.buffer.slice(this.streamPos, this.streamPos + size);
        outbuf.write(slice);
      }
    }

    if (this.pos >= this.windowSize) this.pos = 0;
    this.streamPos = this.pos;
  }

  /** Reset the window */
  reset(): void {
    this.pos = 0;
    this.streamPos = 0;
    if (this.buffer) {
      this.buffer.fill(0);
    }
  }
}
/*80--------------------------------------------------------------------------*/
