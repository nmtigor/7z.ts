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
import type { LzmaDecodeStream } from "./LzmaDecodeStream.ts";
import type { BitTree } from "./util.ts";
/*80--------------------------------------------------------------------------*/

export class RangeDecoder {
  /** `< #Range` */
  #Code: uint32 = 0;
  #Range: uint32 = 0xFFFF_FFFF;

  #stream: LzmaDecodeStream | null = null;
  set inStream(_x: LzmaDecodeStream) {
    this.#stream = _x;
  }

  /** `in( this.#stream)` */
  async Init(): Promise<void> {
    for (let i = 0; i < 5; ++i) {
      this.#Code = this.#Code << 8 | await this.#stream!.readByte();
    }
  }
  /*64||||||||||||||||||||||||||||||||||||||||||||||||||||||||||*/

  /** `in( this.#stream)` */
  async #Normalize(): Promise<void> {
    // if (this.#Range < kTopValue) {
    if (!(this.#Range & -kTopValue)) {
      this.#Range <<= 8;
      this.#Code = this.#Code << 8 | await this.#stream!.readByte();
    }
  }

  /**
   * Decode a single bit using probability model
   * @borrow @headconst @param probs_x
   * @const @param index_x
   */
  async decodeBit(probs_x: CProb[], index_x: uint): Promise<0 | 1> {
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
    await this.#Normalize();
    return symbol;
  }

  /**
   * Decode direct bits (without probability model)
   * @const @param numBits_x
   */
  async decodeDirectBits(numBits_x: uint8): Promise<uint32> {
    let res: uint32 = 0;
    for (let i = numBits_x; i--;) {
      this.#Range >>>= 1;
      this.#Code -= this.#Range;
      const t_ = 0 - (this.#Code >>> 31);
      this.#Code += this.#Range & t_;

      await this.#Normalize();
      res <<= 1;
      res += t_ + 1;
    }
    return res;
  }

  /**
   * @borrow @headconst @param probs_x
   * @const @param numBits_x
   */
  async #decodeBits(probs_x: CProb[], numBits_x: uint8): Promise<uint32> {
    let m_ = 1;
    for (let i = numBits_x; i--;) {
      m_ = (m_ << 1) + await this.decodeBit(probs_x, m_);
    }
    return m_ - (1 << numBits_x);
  }

  /** @borrow @headconst @param bitTree_x */
  async decodeBitTree(bitTree_x: BitTree): Promise<uint32> {
    return await this.#decodeBits(bitTree_x.Probs, bitTree_x.NumBits);
  }

  /**
   * @borrow @headconst @param probs_x
   * @const @param numBits_x
   * @const @param startIndex_x
   */
  async decodeReverseBits(
    probs_x: CProb[],
    numBits_x: uint8,
    startIndex_x: uint = 0,
  ): Promise<uint32> {
    let m_ = 1;
    let symbol = 0;
    for (let i = 0; i < numBits_x; ++i) {
      const bit = await this.decodeBit(probs_x, startIndex_x + m_);
      m_ = m_ << 1 | bit;
      symbol |= bit << i;
    }
    return symbol;
  }

  cleanup(): void {
    this.#stream?.cleanup();
    this.#stream = null;
  }
}
/*80--------------------------------------------------------------------------*/
