/** 80**************************************************************************
 * Ref. [[lzma1]/src/range-encoder.ts](https://github.com/xseman/lzma1/blob/master/src/range-encoder.ts)
 *    * Refactor heavily
 *
 * @module lib/7z/lzma/RangeEncoder
 * @license MIT
 ******************************************************************************/

import type { uint, uint32, uint8 } from "@fe-lib/alias.ts";
import {
  CProb,
  kNumBitModelTotalBits,
  kNumMoveBits,
  kTopValue,
} from "./alias.ts";
import type { BufferWithCount } from "./streams.ts";
import type { BitTree } from "./util.ts";
/*80--------------------------------------------------------------------------*/

export class RangeEncoder {
  #stream: BufferWithCount | null = null;
  set stream(_x: BufferWithCount | null) {
    this.#stream = _x;
  }

  #rrange: uint32 = 0xFFFF_FFFF;
  #cache: uint8 = 0;
  #low = 0;
  #cacheSize = 1;
  #pos = 0;

  //jjjj TOCLEANUP
  // Init(): void {
  //   //jjjj TOCLEANUP
  //   // this.#low = [0, 0];
  //   this.#rrange = 0xFFFF_FFFF;
  //   this.#cacheSize = 1;
  //   //jjjj TOCLEANUP
  //   // this.#cache = 0;
  //   // this.#pos = [0, 0];
  // }
  /*64||||||||||||||||||||||||||||||||||||||||||||||||||||||||||*/

  /** @const @param b_x */
  #writeByte(b_x: uint32): void {
    const outbuf = this.#stream;
    if (!outbuf) return;
    const outbufCount = outbuf.count;

    /* Ensure buffer has enough capacity */
    if (outbufCount >= outbuf.buf.length) {
      const newSize = Math.max(outbuf.buf.length * 2, outbufCount + 1);
      outbuf.buf.length = outbufCount;
      const newBuf = Array.mock<uint8>(newSize).fillArray(outbuf.buf);
      outbuf.buf = newBuf;
    }

    outbuf.buf[outbufCount] = b_x & 0xff;
    outbuf.count += 1;
  }

  /**
   * Shift low helper (proper implementation) - public method for external
   * access
   */
  shiftLow(): void {
    const LowHi = Number(BigInt(this.#low) >> 32n) | 0;
    // console.log([
    //   "RangeEncoder.shiftLow():",
    //   `#low: 0x${this.#low.toString(16)}, LowHi: 0x${LowHi.toString(16)}`,
    // ].join(" "));
    if (LowHi !== 0 || this.#low < 0xff00_0000) {
      this.#pos += this.#cacheSize;

      let temp = this.#cache;
      do {
        this.#writeByte(temp + LowHi);
        temp = 0xff;
      } while ((this.#cacheSize -= 1) !== 0);

      this.#cache = (this.#low | 0) >>> 24;
      // } else {
      //   console.log(`%crun here: `, `color:${LOG_cssc.runhere}`);
    }

    this.#cacheSize += 1;
    /*! `>>> 0` is to make sure that `#low` is treated as unsigned integer. */
    this.#low = (this.#low & 0xff_ffff) << 8 >>> 0;
  }

  /**
   * @borrow @headconst @param probs_x
   * @const @param index_x
   * @const @param symbol_x
   */
  encodeBit(probs_x: CProb[], index_x: uint, symbol_x: 0 | 1): void {
    let prob = probs_x[index_x];
    const newBound = (this.#rrange >>> kNumBitModelTotalBits) * prob;

    if (symbol_x === 0) {
      this.#rrange = newBound;
      prob += (1 << kNumBitModelTotalBits) - prob >>> kNumMoveBits;
    } else {
      this.#low += newBound;
      this.#rrange -= newBound;
      prob -= prob >>> kNumMoveBits;
    }
    probs_x[index_x] = prob;

    // if (this.#rrange < kTopValue) {
    if (!(this.#rrange & -kTopValue)) {
      this.#rrange <<= 8;
      this.shiftLow();
    }
    // console.log(`RangeEncoder.encodeBit(): #low: 0x${this.#low.toString(16)}`);
  }

  /**
   * @const @param val_x
   * @const @param numBits_x
   */
  encodeDirectBits(val_x: uint32, numBits_x: uint8): void {
    for (let i = numBits_x; i--;) {
      this.#rrange >>>= 1;
      if ((val_x >>> i & 1) === 1) {
        this.#low += this.#rrange;
      }
      // if (this.#rrange < kTopValue) {
      if (!(this.#rrange & -kTopValue)) {
        this.#rrange <<= 8;
        this.shiftLow();
      }
    }
    // console.log(`RangeEncoder.encodeBit(): #low: 0x${this.#low.toString(16)}`);
  }

  /**
   * @borrow @headconst @param probs_x
   * @const @param numBits_x
   * @const @param symbol_x
   */
  encodeBits(probs_x: CProb[], numBits_x: uint8, symbol_x: uint8): void {
    let m_ = 1;
    for (let i = numBits_x; i--;) {
      const bit = (symbol_x >>> i & 1) as 0 | 1;
      this.encodeBit(probs_x, m_, bit);
      m_ = m_ << 1 | bit;
    }
  }

  /**
   * @borrow @headconst @param bitTree_x
   * @const @param symbol_x
   */
  encodeBitTree(bitTree_x: BitTree, symbol_x: uint8): void {
    this.encodeBits(bitTree_x.Probs, bitTree_x.NumBits, symbol_x);
  }

  /**
   * @borrow @headconst @param probs_x
   * @param numBits_x
   * @param symbol_x
   * @const @param startIndex_x
   */
  encodeReverseBits(
    probs_x: CProb[],
    numBits_x: uint8,
    symbol_x: uint8,
    startIndex_x: uint = 0,
  ): void {
    let m_ = 1;
    for (; numBits_x--;) {
      const bit = (symbol_x & 1) as 0 | 1;
      this.encodeBit(probs_x, startIndex_x + m_, bit);
      m_ = m_ << 1 | bit;
      symbol_x >>= 1;
    }
  }
}
/*80--------------------------------------------------------------------------*/
