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
  Code: uint32 = 0;
  Range: uint32 = 0;

  stream: BaseStream | null = null;

  //jjjj TOCLEANUP
  // /** Set input stream for decoding */
  // setStream(stream: BaseStream | null): void {
  //   this.stream = stream;
  // }

  Init(): void {
    this.Code = 0;
    this.Range = -1;
    for (let i = 0; i < 5; ++i) {
      this.Code = this.Code << 8 | this.#readByte();
    }
  }

  Normalize(): void {
    // if (this.Range < kTopValue) {
    if (!(this.Range & -kTopValue)) {
      this.Range <<= 8;
      this.Code = this.Code << 8 | this.#readByte();
    }
  }

  /**
   * Decode a single bit using probability model
   * @borrow @headconst @param probs
   * @const @param index
   */
  DecodeBit(probs: CProb[], index: uint): 0 | 1 {
    let v_: uint = probs[index];
    const bound = (this.Range >>> kNumBitModelTotalBits) * v_;
    let symbol: 0 | 1;
    // if (this.Code < bound) {
    if ((this.Code ^ -0x8000_0000) < (bound ^ -0x8000_0000)) {
      //jjjj TOCLEANUP
      // v_ += ((1 << kNumBitModelTotalBits) - v_ >>> kNumMoveBits) << 16 >> 16;
      v_ += ((1 << kNumBitModelTotalBits) - v_) >>> kNumMoveBits;
      this.Range = bound;
      symbol = 0;
    } else {
      //jjjj TOCLEANUP
      // v_ -= (v_ >>> kNumMoveBits) << 16 >> 16;
      v_ -= v_ >>> kNumMoveBits;
      this.Code -= bound;
      this.Range -= bound;
      symbol = 1;
    }
    probs[index] = v_ as CProb;
    this.Normalize();
    return symbol;
  }

  /**
   * Decode direct bits (without probability model)
   * @const @param numBits
   */
  DecodeDirectBits(numBits: uint8): uint32 {
    let res: uint32 = 0;
    for (let i = numBits; i--;) {
      this.Range >>>= 1;
      this.Code -= this.Range;
      const t_ = 0 - (this.Code >>> 31);
      this.Code += this.Range & t_;

      //jjjj
      // if (this.Code === this.Range) {
      //   Corrupted = true;
      // }

      this.Normalize();
      res <<= 1;
      res += t_ + 1;

      //jjjj TOCLEANUP
      // this.Range >>>= 1;
      // const t_ = (this.Code - this.Range) >>> 31;
      // this.Code -= this.Range & (t_ - 1);
      // res = res << 1 | 1 - t_;

      // this.Normalize();
    }
    return res;
  }

  //jjjj TOCLEANUP
  // /** Get current code value (for compatibility) */
  // get currentCode(): number {
  //   return this.Code;
  // }

  //jjjj TOCLEANUP
  // /** Get current range value (for compatibility) */
  // get currentRange(): number {
  //   return this.Range;
  // }

  /** Read a single byte from the input stream */
  #readByte(): uint8 | -1 {
    if (!this.stream) return 0;
    if (this.stream.pos >= this.stream.count) return -1;

    //jjjj TOCLEANUP
    // const value = this.stream.buf instanceof ArrayBuffer
    //   ? new Uint8Array(this.stream.buf)[this.stream.pos]
    //   : this.stream.buf[this.stream.pos];
    const value = this.stream.buf[this.stream.pos];
    this.stream.pos++;
    return value & 0xFF;
  }
}
/*80--------------------------------------------------------------------------*/
