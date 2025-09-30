/** 80**************************************************************************
 * Ref. [[lzma1]/src/match-finder-config.ts](https://github.com/xseman/lzma1/blob/master/src/match-finder-config.ts)
 *    * Refactor heavily
 *
 * @module lib/7z/lzma/MatchFinder
 * @license MIT
 ******************************************************************************/

import type { uint32, uint8 } from "@fe-lib/alias.ts";
import "@fe-lib/jslang.ts";
import { BaseStream } from "./streams.ts";
import { DICTIONARY_SIZE_THRESHOLD } from "./util.ts";
/*80--------------------------------------------------------------------------*/

type HashSizeConfig_ = {
  hashMask: uint32;
  hashSizeSum: uint32;
};

/** @final */
export class MatchFinder {
  posLimit = 0;
  /** Initialized in `#Create_4()` */
  bufferBase!: uint8[];
  pos = 0;
  streamPos = 0;
  streamEndWasReached = false;
  bufferOffset = 0;
  blockSize: uint32 = 0;

  keepSizeBefore: uint32 = 0;
  keepSizeAfter: uint32 = 0;

  ptToLastSafePos = 0;
  stream: BaseStream | null = null;

  /* type */
  HASH_ARRAY = false;
  kNumHashDirectBytes = 0;
  kMinMatchCheck = 0;
  kFixHashSize = 0;

  /** @const @param numHashBytes_x */
  #SetType(numHashBytes_x: uint8): void {
    this.HASH_ARRAY = numHashBytes_x > 2;
    if (this.HASH_ARRAY) {
      this.kNumHashDirectBytes = 0;
      this.kMinMatchCheck = 4;
      this.kFixHashSize = 0x1_0400;
    } else {
      this.kNumHashDirectBytes = 2;
      this.kMinMatchCheck = 3;
      this.kFixHashSize = 0;
    }
  }
  /* ~ */

  hashMask: uint32 = 0;
  hashSizeSum: uint32 = 0;
  /** Initialized in `Create()` */
  hash!: uint8[];

  cyclicBufferSize: uint32 = 0;
  cyclicBufferPos: uint32 = 0;
  /** Initialized in `#Create_4()` */
  son!: uint8[];

  matchMaxLen: uint8 = 0;
  cutValue: uint8 = 0;

  /**
   * @const @param numHashBytes_x
   * @const @param dictSize_x
   * @const @param numFastBytes_x
   */
  Create(numHashBytes_x: uint8, dictSize_x: uint32, numFastBytes_x: uint8) {
    this.#SetType(numHashBytes_x);

    const keepAddBufferBefore = 0x1000;
    const keepAddBufferAfter = 0x112;
    if (dictSize_x >= DICTIONARY_SIZE_THRESHOLD) return;

    this.cutValue = 0x10 + (numFastBytes_x >> 1);
    const windowReservSize =
      ~~((dictSize_x + keepAddBufferBefore + numFastBytes_x +
        keepAddBufferAfter) / 2) + 0x100;

    this.#Create_4(
      dictSize_x + keepAddBufferBefore,
      numFastBytes_x + keepAddBufferAfter,
      windowReservSize,
    );

    this.matchMaxLen = numFastBytes_x;

    this.cyclicBufferSize = dictSize_x + 1;
    this.son = Array.mock(this.cyclicBufferSize * 2);

    const { hashMask, hashSizeSum } = this.#calcHashSize(dictSize_x);
    if (this.HASH_ARRAY) {
      this.hashMask = hashMask;
      const finalHashSizeSum = hashSizeSum + this.kFixHashSize;
      this.hashSizeSum = finalHashSizeSum;
      this.hash = Array.mock(finalHashSizeSum);
    } else {
      this.hashSizeSum = hashSizeSum;
      this.hash = Array.mock(hashSizeSum);
    }
  }
  /*64||||||||||||||||||||||||||||||||||||||||||||||||||||||||||*/

  /**
   * @const @param keepSizeBefore_x
   * @const @param keepSizeAfter_x
   * @const @param keepSizeReserv_x
   */
  #Create_4(
    keepSizeBefore_x: uint32,
    keepSizeAfter_x: uint32,
    keepSizeReserv_x: uint32,
  ): void {
    this.keepSizeBefore = keepSizeBefore_x;
    this.keepSizeAfter = keepSizeAfter_x;
    const blockSize = keepSizeBefore_x + keepSizeAfter_x + keepSizeReserv_x;

    this.bufferBase = Array.mock(blockSize);
    this.blockSize = blockSize;

    this.ptToLastSafePos = this.blockSize - keepSizeAfter_x;
  }

  /**
   * Calculate hash size for match finder hash table
   * @const @param dictSize_x
   */
  #calcHashSize(dictSize_x: uint32): HashSizeConfig_ {
    let hs = 0x1_0000;
    let hashMask = 0;

    if (this.HASH_ARRAY) {
      hs = dictSize_x - 1;
      hs |= hs >> 1;
      hs |= hs >> 2;
      hs |= hs >> 4;
      hs |= hs >> 8;
      hs >>= 1;
      hs |= 0xFFFF;

      if (hs > 0x100_0000) {
        hs >>= 1;
      }

      hashMask = hs;
      hs += 1;

      /* Add kFixHashSize (assumed to be available on matchFinder)
      This will be passed in from the calling context */
    }

    return { hashMask, hashSizeSum: hs };
  }
}
/*80--------------------------------------------------------------------------*/
