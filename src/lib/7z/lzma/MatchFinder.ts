/** 80**************************************************************************
 * Ref. [[lzma1]/src/match-finder-config.ts](https://github.com/xseman/lzma1/blob/master/src/match-finder-config.ts)
 *    * Refactor heavily
 *
 * @module lib/7z/lzma/MatchFinder
 * @license MIT
 ******************************************************************************/

import type { int, uint, uint32, uint8 } from "@fe-lib/alias.ts";
import "@fe-lib/jslang.ts";
import { CRC32_TABLE } from "@fe-lib/util/crc32.ts";
import type { CDist, CLen } from "./alias.ts";
import { DICTSIZE_THRESHOLD, kMatchMaxLen, kNumOpts } from "./alias.ts";
import type { LzmaEncodeStream } from "./LzmaEncodeStream.ts";
/*80--------------------------------------------------------------------------*/

const Hash2Size_ = 0x400;
const Hash3Size_ = 0x1_0000;
const Hash4Size_ = 0x100_0000;
/** 0x3FF */
const Hash2Mask_ = Hash2Size_ - 1;
/** 0xFFFF */
const Hash3Mask_ = Hash3Size_ - 1;
/** 0xFF_FFFF */
const Hash4Mask_ = Hash4Size_ - 1;

/** @final */
export class MatchFinder {
  #posLimit = 0;
  /** Initialized in {@linkcode _Create_4()} */
  #bufferBase!: uint8[];
  /** in cyclic buffer */
  #pos: uint = 0;
  /** in cyclic buffer */
  #streamPos: uint = 0;
  #streamEndReached = false;
  #bufferOffset: int = 0;
  /**
   * @example // 3229
   *    3_149_659 = 0x30_0f5b =
   *    (0x20_0000 + 0x800) + (0x10_05c9) + (0x80 + 274)
   * @example // 3230
   *    102_139 = 0x1_8efb =
   *    (0x1_0000 + 0x800) + (0x85a9) + (0x40 + 274)
   */
  #blockSize: CDist = 0;

  get #bufpos_0() {
    return this.#bufferOffset + this.#pos;
  }
  get #bufpos_1() {
    return this.#bufferOffset + this.#streamPos;
  }

  /**
   * Reduce all position offsets by the specified value
   *
   * Modify
   *    - `bufferOffset`, `posLimit`, `pos`, `streamPos`
   *
   * @const @param subValue_x
   */
  // @traceOut(_TRACE)
  private _reduceOffsets(subValue_x: int): void {
    // /*#static*/ if (_TRACE) {
    //   console.log(
    //     `${trace.indent}>>>>>>> MatchFinder._reduceOffsets( ${subValue_x}) >>>>>>>`,
    //   );
    // }
    this.#bufferOffset += subValue_x;
    this.#posLimit -= subValue_x;
    this.#pos -= subValue_x;
    this.#streamPos -= subValue_x;
  }

  /** number of available bytes in the input window */
  get numAvailBytes(): uint {
    return this.#streamPos - this.#pos;
  }

  #keepSizeBefore: CDist = 0;
  #keepSizeAfter: CDist = 0;

  #ptToLastSafePos = 0;

  #inStream: LzmaEncodeStream | null = null;
  set inStream(_x: LzmaEncodeStream) {
    this.#inStream = _x;
  }

  /* type */
  #HASH_ARRAY = false;
  #kNumHashDirectBytes = 0;
  #kMinMatchCheck: CLen = 0;
  #kFixHashSize = 0;

  /** @const @param numHashBytes_x */
  #SetType(numHashBytes_x: uint8): void {
    this.#HASH_ARRAY = numHashBytes_x > 2;
    if (this.#HASH_ARRAY) {
      this.#kNumHashDirectBytes = 0;
      this.#kMinMatchCheck = 4;
      this.#kFixHashSize = Hash2Size_ + Hash3Size_;
    } else {
      this.#kNumHashDirectBytes = 2;
      this.#kMinMatchCheck = 3;
      this.#kFixHashSize = 0;
    }
  }
  /* ~ */

  /* hash */
  /** `<= Hash4Mask_` */
  #hashMask: uint32 = 0;
  /**
   * @example // 3229
   *    0x11_0400 = 0x10_0000 + 0x1_0400
   * @example // 3230
   *    0x1_0000
   */
  #hashSizeSum: uint32 = 0;
  /** Initialized in {@linkcode Create()} */
  #hash!: uint[];

  /**
   * Calculate hash size for match finder hash table\
   * `in( this.#HASH_ARRAY)`
   * @const @param dictSize_x
   */
  #calcHashSize(dictSize_x: CDist): void {
    let hs = dictSize_x - 1;
    hs |= hs >> 1;
    hs |= hs >> 2;
    hs |= hs >> 4;
    hs |= hs >> 8;
    hs >>= 1;
    hs |= Hash3Mask_;

    if (hs >= Hash4Size_) hs >>= 1;

    this.#hashMask = hs;
    hs += 1;
    this.#hashSizeSum = hs + this.#kFixHashSize;
  }
  /* ~ */

  /* cyclic buffer */
  /**
   * @example // 3229
   *    0x20_0001 = 0x20_0000 + 1
   */
  #cyclicBufferSize: CDist = 0;
  /** `x << 1` in `#son` */
  #cyclicBufferPos: CDist = 0;
  /** Initialized in {@linkcode Create()} */
  #son!: uint[];
  /* ~ */

  #matchMaxLen: CLen = 0;
  //jjjj TOCLEANUP
  // cutValue: uint8 = 0;

  readonly matchDistances: (CLen | CDist)[] = [];

  /**
   * @const @param numHashBytes_x
   * @const @param dictSize_x
   * @const @param numFastBytes_x
   */
  Create(numHashBytes_x: uint8, dictSize_x: CDist, numFastBytes_x: uint8) {
    this.#SetType(numHashBytes_x);

    // const keepAddBufferBefore = 0x1000;
    const keepAddBufferBefore = kNumOpts;
    const keepAddBufferAfter = kMatchMaxLen + 1;
    if (dictSize_x >= DICTSIZE_THRESHOLD) return;

    this.#matchMaxLen = numFastBytes_x;
    //jjjj TOCLEANUP
    // this.cutValue = 0x10 + (numFastBytes_x >> 1);

    const windowReservSize =
      ~~((dictSize_x + keepAddBufferBefore + numFastBytes_x +
        keepAddBufferAfter) / 2) + 0x100;
    this._Create_4(
      dictSize_x + keepAddBufferBefore,
      numFastBytes_x + keepAddBufferAfter,
      windowReservSize,
    );

    /* reserve `#pos === 0` */
    this.#cyclicBufferSize = dictSize_x + 1;
    this.#son = Array.sparse(this.#cyclicBufferSize * 2);

    if (this.#HASH_ARRAY) {
      this.#calcHashSize(dictSize_x);
    } else {
      this.#hashMask = 0;
      this.#hashSizeSum = 0x1_0000;
    }
    this.#hash = Array.sparse(this.#hashSizeSum);
  }

  /** `in( this.#inStream)` */
  async Init(): Promise<void> {
    this.#bufferOffset = 0;
    this.#pos = 0;
    this.#streamPos = 0;
    this.#streamEndReached = false;
    await this.readBlock();

    this.#cyclicBufferPos = 0;
    this._reduceOffsets(-1);
  }
  /*64||||||||||||||||||||||||||||||||||||||||||||||||||||||||||*/

  /**
   * @const @param keepSizeBefore_x
   * @const @param keepSizeAfter_x
   * @const @param keepSizeReserv_x
   */
  private _Create_4(
    keepSizeBefore_x: CDist,
    keepSizeAfter_x: CDist,
    keepSizeReserv_x: CDist,
  ): void {
    this.#keepSizeBefore = keepSizeBefore_x;
    this.#keepSizeAfter = keepSizeAfter_x;
    const blockSize = keepSizeBefore_x + keepSizeAfter_x + keepSizeReserv_x;

    this.#bufferBase = Array.sparse(blockSize);
    this.#blockSize = blockSize;

    this.#ptToLastSafePos = this.#blockSize - keepSizeAfter_x;
  }

  /**
   * Read a block of data from the input stream\
   * `in( this.#inStream)`
   *
   * Modify
   *    - `streamPos`, `posLimit`, `#streamEndReached`
   *    - {@linkcode #inStream.readTo()}
   */
  async readBlock(): Promise<void> {
    if (this.#streamEndReached) return;

    while (true) {
      const size = this.#blockSize - this.#bufpos_1;
      if (size === 0) return;

      const bytesRead = await this.#inStream!.readTo(
        this.#bufferBase,
        this.#bufpos_1,
        size,
      );

      if (bytesRead === 0) {
        this.#posLimit = this.#streamPos;
        if (this.#bufpos_1 > this.#ptToLastSafePos) {
          this.#posLimit = this.#ptToLastSafePos - this.#bufferOffset;
        }
        this.#streamEndReached = true;
        return;
      }

      this.#streamPos += bytesRead;
      if (this.#streamPos >= this.#pos + this.#keepSizeAfter) {
        this.#posLimit = this.#streamPos - this.#keepSizeAfter;
      }
    }
  }

  /**
   * Move buffer block when reaching buffer boundaries
   *
   * Modify
   *    - `bufferBase[i]`, `bufferOffset`
   */
  private _moveBlock(): void {
    let offset = this.#bufpos_0 - this.#keepSizeBefore;
    if (offset > 0) --offset;

    const numBytes = this.#bufpos_1 - offset;
    for (let i = 0; i < numBytes; ++i) {
      this.#bufferBase[i] = this.#bufferBase[offset + i];
    }

    this.#bufferOffset -= offset;
  }

  /**
   * Modify
   *    - `pos`
   *    - {@linkcode _moveBlock()}
   *    - {@linkcode readBlock()}
   */
  private async _MovePos_1(): Promise<void> {
    this.#pos += 1;
    if (this.#pos > this.#posLimit) {
      if (this.#bufpos_0 > this.#ptToLastSafePos) {
        this._moveBlock();
      }
      await this.readBlock();
    }
  }

  /**
   * This is only called after reading one whole gigabyte.
   *
   * Modify
   *    - `son[i]`
   */
  private _NormalizeLinks(numItems: number, subValue: number): void {
    const items = this.#son;
    for (let i = 0, value; i < numItems; ++i) {
      value = items[i] || 0;
      if (value <= subValue) value = 0;
      else value -= subValue;
      items[i] = value;
    }
  }

  /**
   * Modify
   *    - `cyclicBufferPos`
   *    - {@linkcode _MovePos_1()}
   *    - {@linkcode _NormalizeLinks()}
   *    - {@linkcode _reduceOffsets()}
   */
  async #MovePos_0(): Promise<void> {
    this.#cyclicBufferPos += 1;
    if (this.#cyclicBufferPos >= this.#cyclicBufferSize) {
      this.#cyclicBufferPos = 0;
    }

    await this._MovePos_1();

    //jjjj test this branch
    if (this.#pos === DICTSIZE_THRESHOLD) {
      const subValue = this.#pos - this.#cyclicBufferSize;

      this._NormalizeLinks(this.#cyclicBufferSize * 2, subValue);
      this._NormalizeLinks(this.#hashSizeSum, subValue);

      this._reduceOffsets(subValue);
    }
  }

  async GetMatches(): Promise<uint> {
    const md_ = this.matchDistances;

    const lenLimit = Math.min(this.#streamPos - this.#pos, this.#matchMaxLen);
    if (lenLimit < this.#kMinMatchCheck) {
      await this.#MovePos_0();
      return 0;
    }

    let offset = 0;
    const matchMinPos = Math.max(this.#pos - this.#cyclicBufferSize, 0);

    const cur = this.#bufpos_0;
    let maxLen: CLen = 1;

    let hash2Value = 0;
    let hash3Value = 0;
    let hashValue: uint32;
    if (this.#HASH_ARRAY) {
      let temp = CRC32_TABLE[this.#bufferBase[cur] & 0xFF] ^
        (this.#bufferBase[cur + 1] & 0xFF);
      hash2Value = temp & Hash2Mask_;
      temp ^= (this.#bufferBase[cur + 2] & 0xFF) << 8;
      hash3Value = temp & Hash3Mask_;
      hashValue = this.#hashMask &
        (temp ^ (CRC32_TABLE[this.#bufferBase[cur + 3] & 0xFF] << 5));
    } else {
      hashValue = (this.#bufferBase[cur] & 0xFF) ^
        ((this.#bufferBase[cur + 1] & 0xFF) << 8);
    }

    let curMatchPos = this.#hash[this.#kFixHashSize + hashValue] || 0;
    if (this.#HASH_ARRAY) {
      let curMatch2 = this.#hash[hash2Value] || 0;
      const curMatch3 = this.#hash[Hash2Size_ + hash3Value] || 0;
      this.#hash[hash2Value] = this.#pos;
      this.#hash[hash3Value + Hash2Size_] = this.#pos;

      if (curMatch2 > matchMinPos) {
        if (
          this.#bufferBase[this.#bufferOffset + curMatch2] ===
            this.#bufferBase[cur]
        ) {
          md_[offset++] = maxLen = 2;
          md_[offset++] = this.#pos - curMatch2 - 1;
        }
      }

      if (curMatch3 > matchMinPos) {
        if (
          this.#bufferBase[this.#bufferOffset + curMatch3] ===
            this.#bufferBase[cur]
        ) {
          if (curMatch3 === curMatch2) {
            offset -= 2;
          }
          md_[offset++] = maxLen = 3;
          md_[offset++] = this.#pos - curMatch3 - 1;
          curMatch2 = curMatch3;
        }
      }

      if (offset !== 0 && curMatch2 === curMatchPos) {
        offset -= 2;
        maxLen = 1;
      }
    }

    this.#hash[hashValue + this.#kFixHashSize] = this.#pos;

    let ptr1 = this.#cyclicBufferPos << 1;
    let ptr0 = ptr1 + 1;
    let len1 = this.#kNumHashDirectBytes;
    let len0 = len1;

    if (len1 !== 0) {
      if (curMatchPos > matchMinPos) {
        if (
          this.#bufferBase[this.#bufferOffset + curMatchPos + len1] !==
            this.#bufferBase[cur + len1]
        ) {
          md_[offset++] = maxLen = len1;
          md_[offset++] = this.#pos - (curMatchPos + 1);
        }
      }
    }
    //jjjj TOCLEANUP
    // let count = mf_.cutValue;

    while (1) {
      //jjjj TOCLEANUP
      // if (curMatchPos <= matchMinPos || mf_.cutValue === 0) {
      if (curMatchPos <= matchMinPos) {
        //jjjj TOCLEANUP
        // count -= 1;
        this.#son[ptr0] = this.#son[ptr1] = 0;
        break;
      }
      const delta = this.#pos - curMatchPos;

      /**
       * Since `#blockSize <= #dictSize * 2 <= #son.length`, then
       * `#blockFinished` makes sure that `cyclicPos < #son.length`.
       */
      const cyclicPos = (delta <= this.#cyclicBufferPos
        ? this.#cyclicBufferPos - delta
        : this.#cyclicBufferPos + this.#cyclicBufferSize - delta) << 1;

      /** pointer to match byte in `#bufferBase` */
      const pby1 = this.#bufferOffset + curMatchPos;
      let len: CLen = len0 < len1 ? len0 : len1;

      if (this.#bufferBase[pby1 + len] === this.#bufferBase[cur + len]) {
        while ((len += 1) !== lenLimit) {
          if (this.#bufferBase[pby1 + len] !== this.#bufferBase[cur + len]) {
            break;
          }
        }

        if (maxLen < len) {
          md_[offset++] = maxLen = len;
          md_[offset++] = delta - 1;
          if (len === lenLimit) {
            this.#son[ptr1] = this.#son[cyclicPos];
            this.#son[ptr0] = this.#son[cyclicPos + 1];
            break;
          }
        }
      }

      if (
        (this.#bufferBase[pby1 + len] & 0xFF) <
          (this.#bufferBase[cur + len] & 0xFF)
      ) {
        this.#son[ptr1] = curMatchPos;
        ptr1 = cyclicPos + 1;
        curMatchPos = this.#son[ptr1];
        len1 = len;
      } else {
        this.#son[ptr0] = curMatchPos;
        ptr0 = cyclicPos;
        curMatchPos = this.#son[ptr0];
        len0 = len;
      }
    }

    await this.#MovePos_0();
    return offset;
  }

  /** @param num_x */
  async Skip(num_x: CLen): Promise<void> {
    for (; num_x--;) {
      const lenLimit = Math.min(this.#streamPos - this.#pos, this.#matchMaxLen);
      if (lenLimit < this.#kMinMatchCheck) {
        await this.#MovePos_0();
        continue;
      }

      const matchMinPos = Math.max(this.#pos - this.#cyclicBufferSize, 0);

      const cur = this.#bufpos_0;

      let hashValue: uint32;
      if (this.#HASH_ARRAY) {
        let temp = CRC32_TABLE[this.#bufferBase[cur] & 0xFF] ^
          (this.#bufferBase[cur + 1] & 0xFF);
        const hash2Value = temp & Hash2Mask_;
        this.#hash[hash2Value] = this.#pos;
        temp ^= (this.#bufferBase[cur + 2] & 0xFF) << 8;
        const hash3Value = temp & Hash3Mask_;
        this.#hash[Hash2Size_ + hash3Value] = this.#pos;
        hashValue =
          (temp ^ (CRC32_TABLE[this.#bufferBase[cur + 3] & 0xFF] << 5)) &
          this.#hashMask;
      } else {
        hashValue = (this.#bufferBase[cur] & 0xFF) ^
          ((this.#bufferBase[cur + 1] & 0xFF) << 8);
      }

      let curMatchPos: uint = this.#hash[this.#kFixHashSize + hashValue] || 0;
      this.#hash[this.#kFixHashSize + hashValue] = this.#pos;
      let ptr1 = this.#cyclicBufferPos << 1;
      let ptr0 = ptr1 + 1;
      let len1 = this.#kNumHashDirectBytes;
      let len0 = len1;
      //jjjj TOCLEANUP
      // let count = this.cutValue;

      while (1) {
        //jjjj TOCLEANUP
        // if (curMatchPos <= matchMinPos || this.cutValue === 0) {
        if (curMatchPos <= matchMinPos) {
          //jjjj TOCLEANUP
          // count -= 1;
          this.#son[ptr0] = this.#son[ptr1] = 0;
          break;
        }
        const delta = this.#pos - curMatchPos;

        const cyclicPos = (delta <= this.#cyclicBufferPos
          ? this.#cyclicBufferPos - delta
          : this.#cyclicBufferPos - delta + this.#cyclicBufferSize) << 1;

        const pby1 = this.#bufferOffset + curMatchPos;
        let len: CLen = len0 < len1 ? len0 : len1;

        if (this.#bufferBase[pby1 + len] === this.#bufferBase[cur + len]) {
          while ((len += 1) !== lenLimit) {
            if (this.#bufferBase[pby1 + len] !== this.#bufferBase[cur + len]) {
              break;
            }
          }

          if (len === lenLimit) {
            this.#son[ptr1] = this.#son[cyclicPos];
            this.#son[ptr0] = this.#son[cyclicPos + 1];
            break;
          }
        }

        if (
          (this.#bufferBase[pby1 + len] & 0xFF) <
            (this.#bufferBase[cur + len] & 0xFF)
        ) {
          this.#son[ptr1] = curMatchPos;
          ptr1 = cyclicPos + 1;
          curMatchPos = this.#son[ptr1];
          len1 = len;
        } else {
          this.#son[ptr0] = curMatchPos;
          ptr0 = cyclicPos;
          curMatchPos = this.#son[ptr0];
          len0 = len;
        }
      }
      await this.#MovePos_0();
    }
  }

  /**
   * Get a byte at the specified index relative to current position
   * @const
   * @const @param index_x
   */
  getIndexByte(index_x: int): uint8 {
    const byte = this.#bufferBase[this.#bufpos_0 + index_x];
    return byte;
  }

  /**
   * Calculate match length between current position and a previous position
   * @const
   * @const @param index_x
   * @param dist_x
   * @param limit_x
   */
  getMatchLen(index_x: CLen | -1, dist_x: CDist, limit_x: CLen): CLen {
    if (this.#streamEndReached) {
      if (this.#pos + index_x + limit_x > this.#streamPos) {
        limit_x = this.#streamPos - (this.#pos + index_x);
      }
    }

    ++dist_x;

    let i_;
    const pby = this.#bufpos_0 + index_x;
    for (
      i_ = 0;
      i_ < limit_x &&
      this.#bufferBase[pby + i_] === this.#bufferBase[pby + i_ - dist_x];
      ++i_
    );

    return i_;
  }

  cleanup(): void {
    this.#inStream?.cleanup();
    this.#inStream = null;
  }
}
/*80--------------------------------------------------------------------------*/
