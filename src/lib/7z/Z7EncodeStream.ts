/** 80**************************************************************************
 * @module lib/7z/Z7EncodeStream
 * @license LGPL-2.1
 ******************************************************************************/

import { _TRACE } from "../../preNs.ts";
import type { uint, uint8 } from "../alias.ts";
import { assert, bind, out } from "../util.ts";
import { calcCRC32 } from "../util/crc32.ts";
import { trace, traceOut } from "../util/trace.ts";
import { kHeaderSize, NID, RsU8aSize } from "./alias.ts";
import type { CDatabase, CFolders } from "./CDbEx.ts";
import { CDbEx } from "./CDbEx.ts";
import type { CompressionMode } from "./lzma/alias.ts";
import { MODES } from "./lzma/alias.ts";
import { LzmaEncodeStream } from "./lzma/LzmaEncodeStream.ts";
import { StreamBufr } from "./StreamBufr.ts";
import type { ArcFileInfo } from "./util.ts";
import { ExceedSize, ExcessiveMemoryUsage, getZ7L1, Z7Num_a } from "./util.ts";
/*80--------------------------------------------------------------------------*/

type Ofs1_ = [nl1: uint8, ofs: uint];
type OfsO_ = {
  StartHeaderCRC: uint;
  NextHeaderSize: uint;
  NextHeaderCRC: uint;

  PackPos: Ofs1_;
  PackSize: Ofs1_;
};

/**
 * Continuous, and each chunk of length `RsU8aSize`
 * @final
 */
export class Z7EncodeStream extends StreamBufr {
  readonly #afi_a;
  readonly #mode;

  /* _cofs */
  /** current (last chunk) offset */
  private _cofs: uint = 0;

  get #caofs(): uint {
    return Math.max(this.size - (RsU8aSize - this._cofs), 0);
  }
  /* ~ */

  readonly #ofs = {} as OfsO_;

  /* readable */
  #rsEnque!: (chunk_x: Uint8Array) => void;
  #rsClose!: () => void;

  readonly readable;
  /* ~ */

  readonly safeguard = Promise.withResolvers<void>();

  /**
   * @const @param afi_a_x
   * @const @param mode_x
   */
  constructor(afi_a_x: ArcFileInfo[], mode_x: CompressionMode = 5) {
    super();
    this.#afi_a = afi_a_x;
    this.#mode = mode_x;

    this.readable = new ReadableStream<Uint8Array>({
      start: this._rsStart,
      //jjjj TOCLEANUP
      // pull: this._rsPull,
      // cancel: this._rsCancel,
    });

    this.#archive();
  }
  /*64||||||||||||||||||||||||||||||||||||||||||||||||||||||||||*/

  @bind
  @traceOut(_TRACE)
  private _rsStart(rc_x: ReadableStreamDefaultController<Uint8Array>) {
    /*#static*/ if (_TRACE) {
      console.log(`${trace.indent}>>>>>>> Z7EncodeStream._rsStart() >>>>>>>`);
    }
    this.#rsEnque = (_y) => rc_x.enqueue(_y);
    this.#rsClose = () => rc_x.close();
  }

  //jjjj TOCLEANUP
  // @bind
  // @traceOut(_TRACE)
  // private _rsPull(_rc_x: ReadableStreamDefaultController<Uint8Array>) {
  //   /*#static*/ if (_TRACE) {
  //     console.log(`${trace.indent}>>>>>>> Z7EncodeStream._rsPull() >>>>>>>`);
  //   }
  //   ///
  // }

  //jjjj TOCLEANUP
  // @bind
  // @traceOut(_TRACE)
  // private _rsCancel(r_x: unknown) {
  //   /*#static*/ if (_TRACE) {
  //     console.log(
  //       `${trace.indent}>>>>>>> Z7EncodeStream._rsCancel() >>>>>>>`,
  //     );
  //     console.log(`${trace.dent}reason: ${r_x}`);
  //   }
  //   ///
  // }
  /*49|||||||||||||||||||||||||||||||||||||||||||*/

  /**
   * @const @param val_x
   * @const @param ofs_x If provided, `_cofs` will not change.
   * @throw {@linkcode ExceedSize}
   * @throw {@linkcode ExcessiveMemoryUsage}
   */
  #writeByte(val_x: uint, ofs_x?: uint): void {
    if (this.size === 0) this.add(new Uint8Array(RsU8aSize));

    if (ofs_x === undefined) {
      let u8a = this.last$!.payload.chunk;
      if (this._cofs >= RsU8aSize) {
        if (this.#caofs >= 2 ** 20) {
          throw new ExcessiveMemoryUsage(`#caofs: ${this.#caofs} (>=2**20)`);
        }
        this.add(u8a = new Uint8Array(RsU8aSize));
        this._cofs = 0;
      }

      u8a[this._cofs++] = val_x & 0xFF;
    } else {
      let cnd = this.setCnd$(ofs_x);
      if (ofs_x === cnd.payload.stop) {
        if (!cnd.next) throw new ExceedSize(`ofs_x: ${ofs_x}`);
        cnd = cnd.next;
      }

      cnd.payload.writeByte(ofs_x, val_x);
    }
  }

  /**
   * Use little-endian format
   * @const @param val_x
   * @const @param nby_x number of bytes
   * @const @param ofs_x
   * @throw {@linkcode ExceedSize}
   * @throw {@linkcode ExcessiveMemoryUsage}
   */
  #writeUint8m(
    val_x: uint | bigint,
    nby_x: 2 | 3 | 4 | 5 | 6 | 7 | 8,
    ofs_x?: uint,
  ): void {
    const bv_ = BigInt(val_x);
    if (ofs_x === undefined) {
      for (let i = 0n; i < nby_x; i++) {
        this.#writeByte(Number(bv_ >> 8n * i & 0xFFn));
      }
    } else {
      for (let i = 0; i < nby_x; i++) {
        this.#writeByte(Number(bv_ >> BigInt(8 * i) & 0xFFn), ofs_x + i);
      }
    }
  }

  /**
   * `in( 0 <= val_x && val_x < 2**64)`
   * @const @param val_x
   * @const @param l_1_x minimal number of leading 1s, `[0,8]`
   * @const @param ofs_x
   * @throw {@linkcode ExceedSize}
   * @throw {@linkcode ExcessiveMemoryUsage}
   */
  #writeUint(val_x: uint | bigint, l_1_x: uint8 = 0, ofs_x?: uint): void {
    if (val_x < Z7Num_a[3] && l_1_x <= 3) {
      const nv_ = Number(val_x);
      if (val_x < Z7Num_a[0] && l_1_x <= 0) {
        this.#writeByte(nv_, ofs_x);
      } else if (val_x < Z7Num_a[1] && l_1_x <= 1) {
        this.#writeByte(nv_ >>> 8 | 0x80, ofs_x);
        this.#writeByte(nv_, ofs_x === undefined ? ofs_x : ofs_x + 1);
      } else if (val_x < Z7Num_a[2] && l_1_x <= 2) {
        this.#writeByte(nv_ >>> 16 | 0xC0, ofs_x);
        this.#writeUint8m(nv_, 2, ofs_x === undefined ? ofs_x : ofs_x + 1);
      } else {
        this.#writeByte(nv_ >>> 24 | 0xE0, ofs_x);
        this.#writeUint8m(nv_, 3, ofs_x === undefined ? ofs_x : ofs_x + 1);
      }
    } else {
      const bv_ = BigInt(val_x);
      if (bv_ < Z7Num_a[4] && l_1_x <= 4) {
        this.#writeByte(Number(bv_ >> 32n | 0xF0n), ofs_x);
        this.#writeUint8m(bv_, 4, ofs_x === undefined ? ofs_x : ofs_x + 1);
      } else if (bv_ < Z7Num_a[5] && l_1_x <= 5) {
        this.#writeByte(Number(bv_ >> 40n | 0xF8n), ofs_x);
        this.#writeUint8m(bv_, 5, ofs_x === undefined ? ofs_x : ofs_x + 1);
      } else if (bv_ < Z7Num_a[6] && l_1_x <= 6) {
        this.#writeByte(Number(bv_ >> 48n | 0xFCn), ofs_x);
        this.#writeUint8m(bv_, 6, ofs_x === undefined ? ofs_x : ofs_x + 1);
      } else if (bv_ < Z7Num_a[7] && l_1_x <= 7) {
        this.#writeByte(0xFE, ofs_x);
        this.#writeUint8m(bv_, 7, ofs_x === undefined ? ofs_x : ofs_x + 1);
      } else {
        this.#writeByte(0xFF, ofs_x);
        this.#writeUint8m(bv_, 8, ofs_x === undefined ? ofs_x : ofs_x + 1);
      }
    }
  }

  /**
   * `in( bs_x.length > 0)`
   * @const @param bs_x
   * @throw {@linkcode ExceedSize}
   * @throw {@linkcode ExcessiveMemoryUsage}
   */
  #writeBools(bs_x: boolean[]): void {
    let v_: uint8 = 0;
    let mask: uint8 = 0;
    for (let i = 0, iI = bs_x.length; i < iI; i++) {
      if (mask === 0) {
        if (i > 0) {
          this.#writeByte(v_);
          v_ = 0;
        }
        mask = 0x80;
      }
      if (bs_x[i]) v_ |= mask;
      mask >>= 1;
    }
    this.#writeByte(v_);
  }

  /**
   * @const @param bs_x
   * @throw {@linkcode ExceedSize}
   * @throw {@linkcode ExcessiveMemoryUsage}
   */
  #writeBoolsAll(bs_x: boolean[]): void {
    const allTrue = bs_x.every(Boolean);
    this.#writeByte(allTrue ? 1 : 0);
    if (!allTrue) this.#writeBools(bs_x);
  }

  /**
   * @const @param ary_x
   * @const @param nby_x
   * @throw {@linkcode ExceedSize}
   * @throw {@linkcode ExcessiveMemoryUsage}
   */
  #writeUint8ms(
    ary_x: (uint | bigint | undefined)[],
    nby_x: 2 | 3 | 4 | 5 | 6 | 7 | 8,
  ): void {
    const b_a = Array.from({ length: ary_x.length }, () => false);
    for (let i = ary_x.length; i--;) if (ary_x[i] !== undefined) b_a[i] = true;
    this.#writeBoolsAll(b_a);
    this.#writeByte(0); // External
    for (let i = 0, iI = ary_x.length; i < iI; i++) {
      if (b_a[i]) this.#writeUint8m(ary_x[i]!, nby_x);
    }
  }
  /*49|||||||||||||||||||||||||||||||||||||||||||*/

  /**
   * @const @param db_x
   * @throw {@linkcode ExceedSize}
   * @throw {@linkcode ExcessiveMemoryUsage}
   */
  @out((self: Z7EncodeStream) => {
    assert(self._cofs === kHeaderSize);
  })
  private _writeSignatureHeader(db_x: CDbEx): void {
    this.#writeByte(/* "7" */ 0x37);
    this.#writeByte(/* "z" */ 0x7A);
    this.#writeByte(0xBC);
    this.#writeByte(0xAF);
    this.#writeByte(0x27);
    this.#writeByte(0x1C);
    this.#writeByte(db_x.ArcInfo.Version.Major);
    this.#writeByte(db_x.ArcInfo.Version.Minor);
    this.#ofs.StartHeaderCRC = this._cofs;
    this._cofs += 4;
    this.#writeUint8m(0, 8);
    this.#ofs.NextHeaderSize = this._cofs;
    this._cofs += 8;
    this.#ofs.NextHeaderCRC = this._cofs;
    this._cofs += 4;
  }

  /**
   * @const @param folders_x
   * @throw {@linkcode ExceedSize}
   * @throw {@linkcode ExcessiveMemoryUsage}
   */
  #writeMainPackInfo(folders_x: CFolders): void {
    this.#writeUint(NID.kPackInfo);

    let nl1 = getZ7L1(2 ** 20);
    this.#ofs.PackPos = [nl1, this.#caofs];
    this.#writeUint(0, nl1);
    this.#writeUint(folders_x.NumPackStreams);
    this.#writeUint(NID.kSize);
    nl1 = getZ7L1(2n ** 48n);
    this.#ofs.PackSize = [nl1, this.#caofs];
    for (let i = 0; i < folders_x.NumPackStreams; i++) {
      this.#writeUint(0, nl1);
    }

    this.#writeUint(NID.kEnd);
  }

  /**
   * @const @param folders_x
   * @throw {@linkcode ExceedSize}
   * @throw {@linkcode ExcessiveMemoryUsage}
   */
  #writeMainCodersInfo(folders_x: CFolders): void {
    this.#writeUint(NID.kUnpackInfo);

    this.#writeUint(NID.kFolder);
    this.#writeUint(folders_x.NumFolders);
    this.#writeByte(0); // External
    for (let fo = 0; fo < folders_x.NumFolders; fo++) {
      const coders = folders_x.folder_a[fo].Coders;
      this.#writeUint(coders.length);
      for (let ci = 0; ci < coders.length; ci++) {
        this.#writeUint(0b0010_0000 | 4);
        for (let i = 4; i--;) {
          this.#writeByte(coders[ci].MethodID >>> 8 * i);
        }
        this.#writeUint(coders[ci].Props.length);
        for (let k = 0; k < coders[ci].Props.length; k++) {
          this.#writeByte(coders[ci].Props[k]);
        }
      }
    }
    this.#writeUint(NID.kCodersUnpackSize);
    for (const coderUnpackSize of folders_x.CoderUnpackSizes) {
      this.#writeUint(coderUnpackSize);
    }

    this.#writeUint(NID.kEnd);
  }

  /**
   * @const @param db_x
   * @throw {@linkcode ExceedSize}
   * @throw {@linkcode ExcessiveMemoryUsage}
   */
  #writeMainSubStreamsInfo(db_x: CDatabase): void {
    this.#writeUint(NID.kSubStreamsInfo);

    this.#writeUint(NID.kNumUnpackStream);
    for (let fo = 0; fo < db_x.NumFolders; fo++) {
      this.#writeUint(db_x.NumUnpackStreams_a[fo]);
    }
    this.#writeUint(NID.kSize);
    for (let fo = 0, fi = 0; fo < db_x.NumFolders; fo++) {
      const numSubstreams = db_x.NumUnpackStreams_a[fo];
      if (numSubstreams === 0) continue;

      for (let j = numSubstreams; j--;) {
        for (; fi < db_x.Files.length; fi++) {
          if (db_x.Files[fi].Size > 0) {
            /* no need to wrtie last size */
            if (j > 0) this.#writeUint(db_x.Files[fi].Size);
            fi += 1;
            break;
          }
        }
      }
    }

    this.#writeUint(NID.kEnd);
  }

  /**
   * @const @param db_x
   * @throw {@linkcode ExceedSize}
   * @throw {@linkcode ExcessiveMemoryUsage}
   */
  #writeMainStreamsInfo(db_x: CDatabase): void {
    this.#writeUint(NID.kMainStreamsInfo);

    this.#writeMainPackInfo(db_x);
    this.#writeMainCodersInfo(db_x);
    this.#writeMainSubStreamsInfo(db_x);

    this.#writeUint(NID.kEnd);
  }

  /**
   * @const @param db_x
   * @throw {@linkcode ExceedSize}
   * @throw {@linkcode ExcessiveMemoryUsage}
   */
  #writeFilesInfo(db_x: CDatabase): void {
    this.#writeUint(NID.kFilesInfo);

    const numFiles = db_x.Files.length;
    this.#writeUint(numFiles);
    let ofsSize, /** number of leading 1s */ nl1, sizeStrt, size;

    this.#writeUint(NID.kName);
    nl1 = getZ7L1((/* `arcPath` length in average */ 1000 + 1) * 2 * numFiles);
    // console.log(`%crun here: ${nl1}`, `color:red`);
    ofsSize = this.#caofs;
    this.#writeUint(0, nl1);
    sizeStrt = this.#caofs;
    this.#writeByte(0); // External
    for (let fi = 0; fi < numFiles; fi++) {
      const arcPath = db_x.Names[fi];
      for (let i = 0, iI = arcPath.length; i < iI; i++) {
        this.#writeUint8m(arcPath.charCodeAt(i), 2);
      }
      this.#writeUint8m(0, 2);
    }
    size = this.#caofs - sizeStrt;
    if (size >= Z7Num_a[nl1]) {
      throw new ExceedSize(`size: ${size} >= ${Z7Num_a[nl1]}`);
    }
    this.#writeUint(size, nl1, ofsSize);

    if (db_x.Attrib) {
      this.#writeUint(NID.kWinAttrib);
      nl1 = getZ7L1(
        /* `#writeBoolsAll()` */ ((numFiles >>> 3) + 1 + 1) +
          /* External */ 1 + 4 * numFiles,
      );
      ofsSize = this.#caofs;
      this.#writeUint(0, nl1);
      sizeStrt = this.#caofs;
      this.#writeUint8ms(db_x.Attrib, 4);
      size = this.#caofs - sizeStrt;
      this.#writeUint(size, nl1, ofsSize);
    }

    const mtStream_bs = Array.from({ length: numFiles }, () => false);
    let hasMtStream = false;
    for (let fi = 0; fi < numFiles; fi++) {
      if (db_x.Files[fi].Size === 0) {
        mtStream_bs[fi] = true;
        hasMtStream = true;
      }
    }
    if (hasMtStream) {
      this.#writeUint(NID.kEmptyStream);
      nl1 = getZ7L1(/* `#writeBools()` */ (numFiles >>> 3) + 1);
      ofsSize = this.#caofs;
      this.#writeUint(0, nl1);
      sizeStrt = this.#caofs;
      this.#writeBools(mtStream_bs);
      size = this.#caofs - sizeStrt;
      this.#writeUint(size, nl1, ofsSize);

      const numMtStream = mtStream_bs.length;

      const mtFile_bs = Array.from({ length: numMtStream }, () => false);
      let hasMtFile = false;
      let i_ = 0;
      for (const file of db_x.Files) {
        if (file.Size === 0) {
          if (!file.IsDir) {
            mtFile_bs[i_] = true;
            hasMtFile = true;
          }
          i_ += 1;
        }
      }
      if (hasMtFile) {
        this.#writeUint(NID.kEmptyFile);
        nl1 = getZ7L1(/* `#writeBools()` */ (numMtStream >>> 3) + 1);
        ofsSize = this.#caofs;
        this.#writeUint(0, nl1);
        sizeStrt = this.#caofs;
        this.#writeBools(mtFile_bs);
        size = this.#caofs - sizeStrt;
        this.#writeUint(size, nl1, ofsSize);
      }

      if (db_x.IsAnti) {
        const antiFile_bs = Array.from({ length: numMtStream }, () => false);
        let hasAntiFile = false;
        let i_ = 0;
        for (let fi = 0; fi < numFiles; fi++) {
          if (db_x.Files[fi].Size === 0) {
            if (db_x.IsAnti[i_]) {
              antiFile_bs[i_] = true;
              hasAntiFile = true;
            }
            i_ += 1;
          }
        }
        if (hasAntiFile) {
          this.#writeUint(NID.kAnti);
          nl1 = getZ7L1(/* `#writeBools()` */ (numMtStream >>> 3) + 1);
          ofsSize = this.#caofs;
          this.#writeUint(0, nl1);
          sizeStrt = this.#caofs;
          this.#writeBools(antiFile_bs);
          size = this.#caofs - sizeStrt;
          this.#writeUint(size, nl1, ofsSize);
        }
      }
    }

    if (db_x.StartPos) {
      this.#writeUint(NID.kStartPos);
      nl1 = getZ7L1(
        /* `#writeBoolsAll()` */ ((numFiles >>> 3) + 1 + 1) +
          /* External */ 1 + 8 * numFiles,
      );
      ofsSize = this.#caofs;
      this.#writeUint(0, nl1);
      sizeStrt = this.#caofs;
      this.#writeUint8ms(db_x.StartPos, 8);
      size = this.#caofs - sizeStrt;
      this.#writeUint(size, nl1, ofsSize);
    }

    if (db_x.CTime) {
      this.#writeUint(NID.kCTime);
      nl1 = getZ7L1(
        /* `#writeBoolsAll()` */ ((numFiles >>> 3) + 1 + 1) +
          /* External */ 1 + 8 * numFiles,
      );
      ofsSize = this.#caofs;
      this.#writeUint(0, nl1);
      sizeStrt = this.#caofs;
      this.#writeUint8ms(db_x.CTime, 8);
      size = this.#caofs - sizeStrt;
      this.#writeUint(size, nl1, ofsSize);
    }

    if (db_x.ATime) {
      this.#writeUint(NID.kATime);
      nl1 = getZ7L1(
        /* `#writeBoolsAll()` */ ((numFiles >>> 3) + 1 + 1) +
          /* External */ 1 + 8 * numFiles,
      );
      ofsSize = this.#caofs;
      this.#writeUint(0, nl1);
      sizeStrt = this.#caofs;
      this.#writeUint8ms(db_x.ATime, 8);
      size = this.#caofs - sizeStrt;
      this.#writeUint(size, nl1, ofsSize);
    }

    if (db_x.MTime) {
      this.#writeUint(NID.kMTime);
      nl1 = getZ7L1(
        /* `#writeBoolsAll()` */ ((numFiles >>> 3) + 1 + 1) +
          /* External */ 1 + 8 * numFiles,
      );
      ofsSize = this.#caofs;
      this.#writeUint(0, nl1);
      sizeStrt = this.#caofs;
      this.#writeUint8ms(db_x.MTime, 8);
      size = this.#caofs - sizeStrt;
      this.#writeUint(size, nl1, ofsSize);
    }

    this.#writeUint(NID.kEnd);
  }

  /**
   * @const @param db_x
   * @throw {@linkcode ExceedSize}
   * @throw {@linkcode ExcessiveMemoryUsage}
   */
  #writeHeader(db_x: CDatabase): void {
    this.#writeUint(NID.kHeader);

    this.#writeMainStreamsInfo(db_x);
    this.#writeFilesInfo(db_x);

    this.#writeUint(NID.kEnd);
  }
  /*49|||||||||||||||||||||||||||||||||||||||||||*/

  /**
   * @throw {@linkcode ExceedSize}
   * @throw {@linkcode ExcessiveMemoryUsage}
   * @throw `LzmaEncodeStream.error`
   */
  @traceOut(_TRACE)
  async #processAsync(): Promise<void> {
    /*#static*/ if (_TRACE) {
      console.log(
        `${trace.indent}>>>>>>> Z7EncodeStream.#processAsync() >>>>>>>`,
      );
      // console.log(
      //   `${trace.dent}#afi_a: `,
      //   this.#afi_a.map((afi) => afi.toJSON()),
      // );
    }
    const db_ = new CDbEx(this.#afi_a, 1 << MODES[this.#mode].searchDepth);
    // console.log({ db_ });
    this._writeSignatureHeader(db_);
    this.#writeHeader(db_);

    // console.log("#caofs: ", this.#caofs);
    const nextHeaderSize = db_.PackPos = this.#caofs - kHeaderSize;
    this.#writeUint(db_.PackPos, ...this.#ofs.PackPos);
    this.#writeUint8m(nextHeaderSize, 8, this.#ofs.NextHeaderSize);
    let crc32 = calcCRC32(this.peek(nextHeaderSize, kHeaderSize));
    this.#writeUint8m(crc32, 4, this.#ofs.NextHeaderCRC);
    crc32 = calcCRC32(this.peek(20, kHeaderSize - 20));
    this.#writeUint8m(crc32, 4, this.#ofs.StartHeaderCRC);

    for (const pl of this) {
      if (pl === this.last$?.payload) {
        this.#rsEnque(
          this._cofs === RsU8aSize
            ? pl.chunk
            : pl.chunk.subarray(0, this._cofs),
        );
        break;
      }

      this.#rsEnque(pl.chunk);
    }

    const les = new LzmaEncodeStream({
      size: db_.CoderUnpackSizes[0],
      mode: this.#mode,
      stal: false,
    });
    (async () => {
      await using lesWriable = les.writable;
      using lesWriter = lesWriable.getWriter();
      for (const afi of this.#afi_a) {
        if (afi.size === 0) continue;

        const res = await fetch(afi.url);
        for await (const chunk of res.body!) {
          await lesWriter.ready;
          await lesWriter.write(chunk);
        }
      }
    })();
    for await (const chunk of les.readable) this.#rsEnque(chunk);

    await les.safeguard.promise;
  }

  #archive(): void {
    this.#processAsync().then(() => {
      this.safeguard.resolve();
    }).catch(this.safeguard.reject)
      .finally(() => {
        // console.log(
        //   `%crun here: ${this._type_id_}.#processAsync().finally()`,
        //   `color:orange`,
        // );
        this.#rsClose();
      });
  }
}
/*80--------------------------------------------------------------------------*/
