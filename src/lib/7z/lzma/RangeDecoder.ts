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
import type { ChunkState, ProbStateND } from "./ChunkState.ts";
import type { LzmaDecodeStream } from "./LzmaDecodeStream.ts";
import type { BitTree } from "./util.ts";
/*80--------------------------------------------------------------------------*/

export class RangeDecoder {
  /** `< #Range` */
  #Code: uint32 = 0;
  #Range: uint32 = 0xFFFF_FFFF;
  /**
   * @const
   * @headconst @param cs_x
   */
  saveState(cs_x: ChunkState): void {
    cs_x.Code = this.#Code;
    cs_x.Range = this.#Range;
  }
  /** @const @param cs_x */
  restoreState(cs_x: ChunkState): void {
    this.#Code = cs_x.Code;
    this.#Range = cs_x.Range;
  }

  #inStream: LzmaDecodeStream | null = null;
  set inStream(_x: LzmaDecodeStream) {
    this.#inStream = _x;
  }

  /** `in( this.#inStream)` */
  async Init(): Promise<void> {
    for (let i = 0; i < 5; ++i) {
      this.#Code = this.#Code << 8 | await this.#inStream!.readByte();
    }
  }
  /*64||||||||||||||||||||||||||||||||||||||||||||||||||||||||||*/

  /**
   * `in( this.#inStream)`
   * @throw {@linkcode NoInput}
   * @throw {@linkcode ExceedSize}
   */
  #NormalizeSync(): void {
    // if (this.#Range < kTopValue) {
    if (!(this.#Range & -kTopValue)) {
      this.#Range <<= 8;
      this.#Code = this.#Code << 8 | this.#inStream!.readByteSync();
    }
  }

  /** `in( this.#inStream)` */
  async #Normalize(): Promise<void> {
    // if (this.#Range < kTopValue) {
    if (!(this.#Range & -kTopValue)) {
      this.#Range <<= 8;
      this.#Code = this.#Code << 8 | await this.#inStream!.readByte();
    }
  }

  /**
   * Decode a single bit using probability model
   * @borrow @headconst @param probs_x
   * @const @param index_x
   * @headconst @param sn_x
   * @throw {@linkcode NoInput}
   * @throw {@linkcode ExceedSize}
   */
  decodeBitSync(probs_x: CProb[], index_x: uint, sn_x?: ProbStateND): 0 | 1 {
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
    sn_x?.ad(probs_x, index_x, prob);
    probs_x[index_x] = prob;
    this.#NormalizeSync();
    return symbol;
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
   * @throw {@linkcode NoInput}
   */
  decodeDirectBitsSync(numBits_x: uint8): uint32 {
    let res: uint32 = 0;
    for (let i = numBits_x; i--;) {
      this.#Range >>>= 1;
      this.#Code -= this.#Range;
      const t_ = 0 - (this.#Code >>> 31);
      this.#Code += this.#Range & t_;

      this.#NormalizeSync();
      res <<= 1;
      res += t_ + 1;
    }
    return res;
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
   * @headconst @param sn_x
   * @throw {@linkcode NoInput}
   */
  #decodeBitsSync(
    probs_x: CProb[],
    numBits_x: uint8,
    sn_x?: ProbStateND,
  ): uint32 {
    let m_ = 1;
    for (let i = numBits_x; i--;) {
      m_ = (m_ << 1) + this.decodeBitSync(probs_x, m_, sn_x);
    }
    return m_ - (1 << numBits_x);
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

  /**
   * @borrow @headconst @param bitTree_x
   * @headconst @param sn_x
   * @throw {@linkcode NoInput}
   */
  decodeBitTreeSync(bitTree_x: BitTree, sn_x?: ProbStateND): uint32 {
    return this.#decodeBitsSync(bitTree_x.Probs, bitTree_x.NumBits, sn_x);
  }

  /** @borrow @headconst @param bitTree_x */
  async decodeBitTree(bitTree_x: BitTree): Promise<uint32> {
    return await this.#decodeBits(bitTree_x.Probs, bitTree_x.NumBits);
  }

  /**
   * @borrow @headconst @param probs_x
   * @const @param numBits_x
   * @headconst @param sn_x
   * @const @param startIndex_x
   * @throw {@linkcode NoInput}
   * @throw {@linkcode ExceedSize}
   */
  decodeReverseBitsSync(
    probs_x: CProb[],
    numBits_x: uint8,
    sn_x?: ProbStateND,
    startIndex_x: uint = 0,
  ): uint32 {
    let m_ = 1;
    let symbol = 0;
    for (let i = 0; i < numBits_x; ++i) {
      const bit = this.decodeBitSync(probs_x, startIndex_x + m_, sn_x);
      m_ = m_ << 1 | bit;
      symbol |= bit << i;
    }
    return symbol;
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
    this.#inStream?.cleanup();
    this.#inStream = null;
  }
}
/*80--------------------------------------------------------------------------*/
