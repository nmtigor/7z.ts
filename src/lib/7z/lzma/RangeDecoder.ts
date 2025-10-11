/** 80**************************************************************************
 * Ref. [[lzma1]/src/range-decoder.ts](https://github.com/xseman/lzma1/blob/master/src/range-decoder.ts)
 *    * Refactor heavily
 *
 * @module lib/7z/lzma/RangeDecoder
 * @license MIT
 ******************************************************************************/

import type { uint, uint32, uint8 } from "@fe-lib/alias.ts";
import type { CProb } from "./alias.ts";
import { kNumBitModelTotalBits, kNumMoveBits, kTopValue } from "./alias.ts";
import type { BaseStream } from "./streams.ts";
/*80--------------------------------------------------------------------------*/

export class RangeDecoder {
  /** `< #Range` */
  #Code: uint32 = 0;
  #Range: uint32 = 0;

  stream: BaseStream | null = null;

  Init(): void {
    this.#Code = 0;
    this.#Range = 0xFFFF_FFFF;
    for (let i = 0; i < 5; ++i) {
      this.#Code = this.#Code << 8 | this.#readByte();
    }
  }

  Normalize(): void {
    // if (this.#Range < kTopValue) {
    if (!(this.#Range & -kTopValue)) {
      this.#Range <<= 8;
      this.#Code = this.#Code << 8 | this.#readByte();
    }
  }

  /**
   * Decode a single bit using probability model
   * @borrow @headconst @param probs_x
   * @const @param index_x
   */
  DecodeBit(probs_x: CProb[], index_x: uint): 0 | 1 {
    let prob = probs_x[index_x];
    const bound = (this.#Range >>> kNumBitModelTotalBits) * prob;
    let symbol: 0 | 1;
    // if (this.#Code < bound) {
    if ((this.#Code ^ -0x8000_0000) < (bound ^ -0x8000_0000)) {
      prob += (1 << kNumBitModelTotalBits) - prob >>> kNumMoveBits;
      this.#Range = bound;
      symbol = 0;
    } else {
      prob -= prob >>> kNumMoveBits;
      this.#Code -= bound;
      this.#Range -= bound;
      symbol = 1;
    }
    probs_x[index_x] = prob;
    this.Normalize();
    return symbol;
  }

  /**
   * Decode direct bits (without probability model)
   * @const @param numBits_x
   */
  DecodeDirectBits(numBits_x: uint8): uint32 {
    let res: uint32 = 0;
    for (let i = numBits_x; i--;) {
      this.#Range >>>= 1;
      this.#Code -= this.#Range;
      const t_ = 0 - (this.#Code >>> 31);
      this.#Code += this.#Range & t_;

      this.Normalize();
      res <<= 1;
      res += t_ + 1;
    }
    return res;
  }

  /** Read a single byte from the input stream */
  #readByte(): uint8 | -1 {
    if (!this.stream) return 0;
    if (this.stream.pos >= this.stream.count) return -1;

    const value = this.stream.buf[this.stream.pos];
    this.stream.pos++;
    return value & 0xFF;
  }
}
/*80--------------------------------------------------------------------------*/
