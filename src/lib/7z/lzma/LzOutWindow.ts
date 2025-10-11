/** 80**************************************************************************
 * Ref. [[lzma1]/src/lz-window.ts](https://github.com/xseman/lzma1/blob/master/src/lz-window.ts)
 *    * Refactor heavily
 *
 * @module lib/7z/lzma/LzOutWindow
 * @license MIT
 ******************************************************************************/

import type { uint, uint8 } from "@fe-lib/alias.ts";
import "@fe-lib/jslang.ts";
import * as Is from "@fe-lib/util/is.ts";
import type { DictSize } from "./alias.ts";
import type { BufferWithCount, Writer } from "./streams.ts";
import { isBufferWithCount } from "./streams.ts";
/*80--------------------------------------------------------------------------*/

export class LzOutWindow {
  windowSize: DictSize = 0;
  /** Initialized in {@linkcode Create()} */
  buffer!: uint8[];

  stream: Writer | null = null;

  /** in `buffer`, `>= streamPos` */
  pos: uint = 0;
  /** in `buffer`, `<= pos` */
  streamPos: uint = 0;

  constructor(writer?: Writer) {
    if (writer) this.stream = writer;
  }

  Create(windowSize: DictSize) {
    this.windowSize = windowSize;
    this.buffer = Array.mock(windowSize);
  }

  Init() {
    this.pos = 0;
    this.streamPos = 0;
  }

  CopyBlock(dist: DictSize, len: uint): void {
    let pos = this.pos - dist - 1;
    if (pos < 0) pos += this.windowSize;

    for (; len--;) {
      if (pos >= this.windowSize) pos = 0;

      this.buffer[this.pos] = this.buffer[pos];
      this.pos += 1;
      pos += 1;

      if (this.pos >= this.windowSize) this.flush();
    }
  }

  /** Put a single byte into the window */
  PutByte(byte: uint8): void {
    this.buffer[this.pos] = byte;
    this.pos++;
    if (this.pos >= this.windowSize) this.flush();
  }

  /**
   * Get a byte from a relative position
   * @const @param dist_x
   */
  GetByte(dist_x: DictSize): uint8 {
    let pos = this.pos - dist_x - 1;
    if (pos < 0) {
      pos += this.windowSize;
    }
    return this.buffer[pos];
  }

  /** @const @param len_x */
  #write(len_x: uint): void {
    const outbuf = this.stream as BufferWithCount;
    const outbufCount = outbuf.count;

    /* Ensure buffer has enough capacity */
    if (outbufCount + len_x > outbuf.buf.length) {
      const newSize = Math.max(outbuf.buf.length * 2, outbufCount + len_x);
      outbuf.buf.length = outbufCount;
      const newBuf = Array.mock<uint8>(newSize).fillArray(outbuf.buf);
      outbuf.buf = newBuf;
    }

    for (let i = 0; i < len_x; i++) {
      outbuf.buf[outbufCount + i] = this.buffer[this.streamPos + i];
    }
    outbuf.count += len_x;
  }

  flush(): void {
    const size = this.pos - this.streamPos;
    if (!size) return;

    if (this.stream) {
      if (isBufferWithCount(this.stream)) {
        this.#write(size);
      } else if (Is.func(this.stream.write)) {
        /* Fallback: write directly if it's a plain Writer */
        const slice = this.buffer.slice(this.streamPos, this.streamPos + size);
        this.stream.write(slice);
      }
    }

    if (this.pos >= this.windowSize) this.pos = 0;
    this.streamPos = this.pos;
  }

  /** Reset the window */
  reset(): void {
    this.pos = 0;
    this.streamPos = 0;
    this.buffer.fill(0);
  }
}
/*80--------------------------------------------------------------------------*/
