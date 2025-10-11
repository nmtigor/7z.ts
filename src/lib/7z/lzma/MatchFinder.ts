/** 80**************************************************************************
 * Ref. [[lzma1]/src/match-finder-config.ts](https://github.com/xseman/lzma1/blob/master/src/match-finder-config.ts)
 *    * Refactor heavily
 *
 * @module lib/7z/lzma/MatchFinder
 * @license MIT
 ******************************************************************************/

import type { int, uint, uint32, uint8 } from "@fe-lib/alias.ts";
import "@fe-lib/jslang.ts";
import type { CLen, DictSize } from "./alias.ts";
import { DICTSIZE_THRESHOLD } from "./alias.ts";
import { BaseStream } from "./streams.ts";
import { arraycopy, CRC32_TABLE } from "./util.ts";
/*80--------------------------------------------------------------------------*/

/** @final */
export class MatchFinder {
  posLimit = 0;
  /** Initialized in {@linkcode _Create_4()} */
  bufferBase!: uint8[];
  pos: uint = 0;
  streamPos: uint = 0;
  #streamEndReached = false;
  bufferOffset: int = 0;
  /**
   * @example 3_152_731 = 0x30_1b5b =
   *    (0x20_0000 + 0x1000) + (0x10_09c9) + (0x80 + 274)
   */
  blockSize: DictSize = 0;

  get bufpos_0() {
    return this.bufferOffset + this.pos;
  }
  get #bufpos_1() {
    return this.bufferOffset + this.streamPos;
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
  #reduceOffsets(subValue_x: int): void {
    // /*#static*/ if (_TRACE) {
    //   console.log(
    //     `${trace.indent}>>>>>>> MatchFinder.#reduceOffsets( ${subValue_x}) >>>>>>>`,
    //   );
    // }
    this.bufferOffset += subValue_x;
    this.posLimit -= subValue_x;
    this.pos -= subValue_x;
    this.streamPos -= subValue_x;
  }

  /** Get number of available bytes in the input window */
  getNumAvailableBytes(): number {
    return this.streamPos - this.pos;
  }

  keepSizeBefore: DictSize = 0;
  keepSizeAfter: DictSize = 0;

  ptToLastSafePos = 0;
  stream: BaseStream | null = null;

  /* type */
  HASH_ARRAY = false;
  kNumHashDirectBytes = 0;
  kMinMatchCheck: CLen = 0;
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

  /* hash */
  hashMask: uint32 = 0;
  /** @example 1_115_136 = 0x11_0400 = 0x10_0000 + 0x1_0400 */
  hashSizeSum: uint32 = 0;
  /** Initialized in {@linkcode Create()} */
  hash!: uint[];

  /**
   * Calculate hash size for match finder hash table
   * `in( this.HASH_ARRAY)`
   * @const @param dictSize_x
   */
  #calcHashSize(dictSize_x: DictSize): void {
    let hs = dictSize_x - 1;
    hs |= hs >> 1;
    hs |= hs >> 2;
    hs |= hs >> 4;
    hs |= hs >> 8;
    hs >>= 1;
    hs |= 0xFFFF;

    if (hs > 0x100_0000) hs >>= 1;

    this.hashMask = hs;
    hs += 1;
    this.hashSizeSum = hs + this.kFixHashSize;
  }
  /* ~ */

  /* son */
  cyclicBufferSize: DictSize = 0;
  cyclicBufferPos: DictSize = 0;
  /** Initialized in {@linkcode Create()} */
  son!: uint[];
  /* ~ */

  matchMaxLen: CLen = 0;
  //jjjj TOCLEANUP
  // cutValue: uint8 = 0;

  /**
   * @const @param numHashBytes_x
   * @const @param dictSize_x
   * @const @param numFastBytes_x
   */
  Create(numHashBytes_x: uint8, dictSize_x: DictSize, numFastBytes_x: uint8) {
    this.#SetType(numHashBytes_x);

    const keepAddBufferBefore = 0x1000;
    const keepAddBufferAfter = 274;
    if (dictSize_x >= DICTSIZE_THRESHOLD) return;

    this.matchMaxLen = numFastBytes_x;
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

    this.cyclicBufferSize = dictSize_x + 1;
    this.son = Array.mock(this.cyclicBufferSize * 2);

    if (this.HASH_ARRAY) {
      this.#calcHashSize(dictSize_x);
    } else {
      this.hashMask = 0;
      this.hashSizeSum = 0x1_0000;
    }
    this.hash = Array.mock(this.hashSizeSum);
  }

  /** `in( this.stream)` */
  Init() {
    this.bufferOffset = 0;
    this.pos = 0;
    this.streamPos = 0;
    this.#streamEndReached = false;
    this.readBlock();

    this.cyclicBufferPos = 0;
    this.#reduceOffsets(-1);
  }
  /*64||||||||||||||||||||||||||||||||||||||||||||||||||||||||||*/

  /**
   * @const @param keepSizeBefore_x
   * @const @param keepSizeAfter_x
   * @const @param keepSizeReserv_x
   */
  private _Create_4(
    keepSizeBefore_x: DictSize,
    keepSizeAfter_x: DictSize,
    keepSizeReserv_x: DictSize,
  ): void {
    this.keepSizeBefore = keepSizeBefore_x;
    this.keepSizeAfter = keepSizeAfter_x;
    const blockSize = keepSizeBefore_x + keepSizeAfter_x + keepSizeReserv_x;

    this.bufferBase = Array.mock(blockSize);
    this.blockSize = blockSize;

    this.ptToLastSafePos = this.blockSize - keepSizeAfter_x;
  }

  /**
   * Read data from the input stream into the buffer\
   * `in( this.stream)`
   *
   * Modify
   *    - `bufferBase[i]`, `stream.pos`
   *
   * @const @param off_x
   * @param len_x
   */
  private _readFromStream(off_x: number, len_x: number): uint | -1 {
    const stream = this.stream!;
    const buffer = this.bufferBase;

    if (stream.pos >= stream.count) return -1;

    const srcBuf = stream.buf instanceof Uint8Array
      ? Array.from(stream.buf)
      : stream.buf;

    len_x = Math.min(len_x, stream.count - stream.pos);
    arraycopy(srcBuf, stream.pos, buffer, off_x, len_x);
    stream.pos += len_x;

    return len_x;
  }

  /**
   * Read a block of data from the input stream
   *
   * Modify
   *    - `streamPos`, `posLimit`, `#streamEndReached`
   *    - {@linkcode _readFromStream()}
   */
  readBlock(): void {
    if (this.#streamEndReached) return;

    while (true) {
      const size = this.blockSize - this.#bufpos_1;
      if (!size) return;

      const bytesRead = this._readFromStream(this.#bufpos_1, size);

      if (bytesRead === -1) {
        this.posLimit = this.streamPos;
        if (this.#bufpos_1 > this.ptToLastSafePos) {
          this.posLimit = this.ptToLastSafePos - this.bufferOffset;
        }
        this.#streamEndReached = true;
        return;
      }

      this.streamPos += bytesRead;
      if (this.streamPos >= this.pos + this.keepSizeAfter) {
        this.posLimit = this.streamPos - this.keepSizeAfter;
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
    let offset = this.bufpos_0 - this.keepSizeBefore;
    if (offset > 0) --offset;

    const numBytes = this.#bufpos_1 - offset;
    for (let i = 0; i < numBytes; ++i) {
      this.bufferBase[i] = this.bufferBase[offset + i];
    }

    this.bufferOffset -= offset;
  }

  /**
   * Modify
   *    - `pos`
   *    - {@linkcode _moveBlock()}
   *    - {@linkcode readBlock()}
   */
  private _MovePos_1(): void {
    this.pos += 1;
    if (this.pos > this.posLimit) {
      if (this.bufpos_0 > this.ptToLastSafePos) {
        this._moveBlock();
      }
      this.readBlock();
    }
  }

  /**
   * This is only called after reading one whole gigabyte.
   *
   * Modify
   *    - `son[i]`
   */
  private _NormalizeLinks(numItems: number, subValue: number): void {
    const items = this.son;
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
   *    - {@linkcode #reduceOffsets()}
   */
  MovePos_0(): void {
    this.cyclicBufferPos += 1;
    if (this.cyclicBufferPos >= this.cyclicBufferSize) {
      this.cyclicBufferPos = 0;
    }

    this._MovePos_1();

    if (this.pos === DICTSIZE_THRESHOLD) {
      const subValue = this.pos - this.cyclicBufferSize;

      this._NormalizeLinks(this.cyclicBufferSize * 2, subValue);
      this._NormalizeLinks(this.hashSizeSum, subValue);

      this.#reduceOffsets(subValue);
    }
  }

  /** @param num_x */
  Skip(num_x: CLen): void {
    for (; num_x--;) {
      const lenLimit = Math.min(this.streamPos - this.pos, this.matchMaxLen);
      if (lenLimit < this.kMinMatchCheck) {
        this.MovePos_0();
        continue;
      }

      const matchMinPos = Math.max(this.pos - this.cyclicBufferSize, 0);

      const cur = this.bufpos_0;

      let hashValue: uint32;
      if (this.HASH_ARRAY) {
        let temp = CRC32_TABLE[this.bufferBase[cur] & 0xFF] ^
          (this.bufferBase[cur + 1] & 0xFF);
        const hash2Value = temp & 0x3FF;
        this.hash[hash2Value] = this.pos;
        temp ^= (this.bufferBase[cur + 2] & 0xFF) << 8;
        const hash3Value = temp & 0xFFFF;
        this.hash[0x400 + hash3Value] = this.pos;
        hashValue =
          (temp ^ (CRC32_TABLE[this.bufferBase[cur + 3] & 0xFF] << 5)) &
          this.hashMask;
      } else {
        hashValue = (this.bufferBase[cur] & 0xFF) ^
          ((this.bufferBase[cur + 1] & 0xFF) << 8);
      }

      let curMatch: uint = this.hash[this.kFixHashSize + hashValue] || 0;
      this.hash[this.kFixHashSize + hashValue] = this.pos;
      let ptr1 = this.cyclicBufferPos << 1;
      let ptr0 = ptr1 + 1;
      let len1 = this.kNumHashDirectBytes;
      let len0 = len1;
      //jjjj TOCLEANUP
      // let count = this.cutValue;

      while (1) {
        //jjjj TOCLEANUP
        // if (curMatch <= matchMinPos || this.cutValue === 0) {
        if (curMatch <= matchMinPos) {
          //jjjj TOCLEANUP
          // count -= 1;
          this.son[ptr0] = this.son[ptr1] = 0;
          break;
        }
        const delta = this.pos - curMatch;

        const cyclicPos = (delta <= this.cyclicBufferPos
          ? this.cyclicBufferPos - delta
          : this.cyclicBufferPos - delta + this.cyclicBufferSize) << 1;

        const pby1 = this.bufferOffset + curMatch;
        let len: CLen = len0 < len1 ? len0 : len1;

        if (this.bufferBase[pby1 + len] === this.bufferBase[cur + len]) {
          while ((len += 1) !== lenLimit) {
            if (this.bufferBase[pby1 + len] !== this.bufferBase[cur + len]) {
              break;
            }
          }

          if (len === lenLimit) {
            this.son[ptr1] = this.son[cyclicPos];
            this.son[ptr0] = this.son[cyclicPos + 1];
            break;
          }
        }

        if (
          (this.bufferBase[pby1 + len] & 0xFF) <
            (this.bufferBase[cur + len] & 0xFF)
        ) {
          this.son[ptr1] = curMatch;
          ptr1 = cyclicPos + 1;
          curMatch = this.son[ptr1];
          len1 = len;
        } else {
          this.son[ptr0] = curMatch;
          ptr0 = cyclicPos;
          curMatch = this.son[ptr0];
          len0 = len;
        }
      }
      this.MovePos_0();
    }
  }

  /**
   * Get a byte at the specified index relative to current position
   * @const @param index_x
   */
  getIndexByte(index_x: int): uint8 {
    const byte = this.bufferBase[this.bufpos_0 + index_x];
    return byte;
  }

  /**
   * Calculate match length between current position and a previous position
   * @const
   * @const @param index_x
   * @param dist_x
   * @param limit_x
   */
  getMatchLen(index_x: CLen | -1, dist_x: DictSize, limit_x: CLen): CLen {
    if (this.#streamEndReached) {
      if (this.pos + index_x + limit_x > this.streamPos) {
        limit_x = this.streamPos - (this.pos + index_x);
      }
    }

    ++dist_x;

    let i_;
    const pby = this.bufpos_0 + index_x;
    for (
      i_ = 0;
      i_ < limit_x &&
      this.bufferBase[pby + i_] === this.bufferBase[pby + i_ - dist_x];
      ++i_
    );

    return i_;
  }
}
/*80--------------------------------------------------------------------------*/
