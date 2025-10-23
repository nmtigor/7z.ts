/** 80**************************************************************************
 * Ref. [[lzma1]/src/lz-window.ts](https://github.com/xseman/lzma1/blob/master/src/lz-window.ts)
 *    * Refactor heavily
 *
 * @module lib/7z/lzma/LzOutWindow
 * @license MIT
 ******************************************************************************/

import type { uint, uint8 } from "@fe-lib/alias.ts";
import "@fe-lib/jslang.ts";
import type { CDist } from "./alias.ts";
import type { LzmaDecodeStream } from "./LzmaDecodeStream.ts";
/*80--------------------------------------------------------------------------*/

export class LzOutWindow {
  windowSize: CDist = 0;
  /** Initialized in {@linkcode Create()} */
  buffer!: uint8[];

  #stream: LzmaDecodeStream | null = null;
  set outStream(_x: LzmaDecodeStream) {
    this.#stream = _x;
  }

  /** in `buffer`, `>= streamPos` */
  #pos: uint = 0;
  /** in `buffer`, `<= pos` */
  #streamPos: uint = 0;

  Create(windowSize: CDist) {
    this.windowSize = windowSize;
    this.buffer = Array.mock(windowSize);
  }

  Init() {
    this.#pos = 0;
    this.#streamPos = 0;
  }
  /*64||||||||||||||||||||||||||||||||||||||||||||||||||||||||||*/

  CopyBlock(dist: CDist, len: uint): void {
    let pos = this.#pos - dist - 1;
    if (pos < 0) pos += this.windowSize;

    for (; len--;) {
      if (pos >= this.windowSize) pos = 0;

      this.buffer[this.#pos] = this.buffer[pos];
      this.#pos += 1;
      pos += 1;

      if (this.#pos >= this.windowSize) this.flush();
    }
  }

  /** Put a single byte into the window */
  PutByte(byte: uint8): void {
    this.buffer[this.#pos] = byte;
    this.#pos++;
    if (this.#pos >= this.windowSize) this.flush();
  }

  /**
   * Get a byte from a relative position
   * @const @param dist_x
   */
  GetByte(dist_x: CDist): uint8 {
    let pos = this.#pos - dist_x - 1;
    if (pos < 0) {
      pos += this.windowSize;
    }
    return this.buffer[pos];
  }

  flush(): void {
    const size = this.#pos - this.#streamPos;
    if (!size) return;

    this.#stream?.writeFrom(this.buffer, this.#streamPos, size);

    if (this.#pos >= this.windowSize) this.#pos = 0;
    this.#streamPos = this.#pos;
  }

  cleanup(): void {
    this.#stream = null;
  }
}
/*80--------------------------------------------------------------------------*/
