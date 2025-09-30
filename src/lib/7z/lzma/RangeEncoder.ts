/** 80**************************************************************************
 * Ref. [[lzma1]/src/range-encoder.ts](https://github.com/xseman/lzma1/blob/master/src/range-encoder.ts)
 *    * Refactor heavily
 *
 * @module lib/7z/lzma/RangeEncoder
 * @license MIT
 ******************************************************************************/

import type { uint, uint8 } from "@fe-lib/alias.ts";
import type { CBitTreeDecoder } from "./util.ts";
import {
  add64,
  and64,
  compare64,
  fromInt64,
  lowBits64,
  shl64,
  shru64,
} from "./util.ts";
/*80--------------------------------------------------------------------------*/

export class RangeEncoder {
  stream: { buf: uint8[]; count: uint } | null = null;
  /** Initialized in `Init()` */
  rrange!: number;
  /** Initialized in `Init()` */
  cache!: number;
  /** Initialized in `Init()` */
  low!: [number, number];
  /** Initialized in `Init()` */
  cacheSize!: number;
  /** Initialized in `Init()` */
  position!: [number, number];

  Init(): void {
    this.low = [0, 0];
    this.rrange = 0xFFFF_FFFF;
    this.cacheSize = 1;
    this.cache = 0;
    this.position = [0, 0];
  }

  /** Write byte to stream */
  private writeToStream(
    stream: { buf: number[]; count: number } | null,
    b: number,
  ): void {
    if (!stream) return;

    // Ensure buffer has enough capacity
    if (stream.count >= stream.buf.length) {
      const newSize = Math.max(stream.buf.length * 2, stream.count + 1);
      const newBuf = new Array(newSize);
      for (let i = 0; i < stream.count; i++) {
        newBuf[i] = stream.buf[i];
      }
      stream.buf = newBuf;
    }

    stream.buf[stream.count++] = b << 24 >> 24;
  }

  /**
   * Shift low helper (proper implementation) - public method for external
   * access
   */
  shiftLow(): void {
    const LowHi = lowBits64(shru64(this.low, 32));
    if (LowHi != 0 || compare64(this.low, [0xff00_0000, 0]) < 0) {
      this.position = add64(
        this.position,
        fromInt64(this.cacheSize),
      );

      let temp = this.cache;
      do {
        this.writeToStream(this.stream, temp + LowHi);
        temp = 255;
      } while ((this.cacheSize -= 1) != 0);

      this.cache = lowBits64(this.low) >>> 24;
    }

    this.cacheSize += 1;
    this.low = shl64(and64(this.low, [16777215, 0]), 8);
  }

  encodeBit(probs: number[], index: number, symbol: number): void {
    let newBound, prob = probs[index];
    newBound = (this.rrange >>> 11) * prob;

    if (!symbol) {
      this.rrange = newBound;
      probs[index] = prob + (2048 - prob >>> 5) << 16 >> 16;
    } else {
      // Need helper methods for 64-bit arithmetic
      this.low = add64(
        this.low,
        and64(fromInt64(newBound), [0xFFFFFFFF, 0]),
      );
      this.rrange -= newBound;
      probs[index] = prob - (prob >>> 5) << 16 >> 16;
    }

    if (!(this.rrange & -0x1000000)) {
      this.rrange <<= 8;
      this.shiftLow();
    }
  }

  encodeBitTree(encoder: CBitTreeDecoder, symbol: number): void {
    let bit, bitIndex, m = 1;

    for (bitIndex = encoder.NumBits; bitIndex != 0;) {
      bitIndex -= 1;
      bit = symbol >>> bitIndex & 1;
      this.encodeBit(encoder.Probs, m, bit);
      m = m << 1 | bit;
    }
  }

  encodeDirectBits(valueToEncode: number, numTotalBits: number): void {
    for (let i = numTotalBits - 1; i >= 0; i -= 1) {
      this.rrange >>>= 1;
      if ((valueToEncode >>> i & 1) == 1) {
        this.low = add64(
          this.low,
          fromInt64(this.rrange),
        );
      }
      if (!(this.rrange & -0x1000000)) {
        this.rrange <<= 8;
        this.shiftLow();
      }
    }
  }
}
/*80--------------------------------------------------------------------------*/
