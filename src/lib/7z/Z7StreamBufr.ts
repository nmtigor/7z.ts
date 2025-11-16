/** 80**************************************************************************
 * @module lib/7z/Z7StreamBufr
 * @license MIT
 ******************************************************************************/

import { INOUT } from "../../preNs.ts";
import type { uint, uint16, uint32, uint8 } from "../alias.ts";
import "../jslang.ts";
import { assert } from "../util.ts";
import { k_LZMA, NID } from "./alias.ts";
import type { CDbEx, CFileItem, CFolders } from "./CDbEx.ts";
import { CCoderInfo, Folder } from "./CDbEx.ts";
import { StreamBufr } from "./StreamBufr.ts";
import { ExceedSize, IncorrectFormat, UnsupportedFeature } from "./util.ts";
/*80--------------------------------------------------------------------------*/

class Ctx_ {
  readonly #pa: Ctx_ | null;

  /** relative offset in `#pa` */
  readonly rofs: uint;

  /** absolute offset */
  #aofs: uint | undefined;
  get aofs(): uint {
    this.#aofs ??= (this.#pa?.aofs ?? 0) + this.rofs;
    return this.#aofs;
  }

  /**
   * @const @param pa_x
   * @const @param rofs_x
   */
  constructor(rofs_x: uint, pa_x?: Ctx_) {
    this.#pa = pa_x ?? null;
    this.rofs = rofs_x;
  }
}

/**
 * All methods in this are sync.
 * @final
 */
export class Z7StreamBufr extends StreamBufr {
  /* #ctxs */
  /** contexts */
  #ctxs: Ctx_[] = [new Ctx_(0)];
  get _ctxs_() {
    return this.#ctxs;
  }

  ctxIn() {
    const ctx = new Ctx_(this.#cofs, this.#ctxs.at(-1));
    this.#ctxs.push(ctx);
    this.#cofs = 0;
  }
  /** `in( this.#ctx.length >= 2)` */
  ctxOut() {
    const ctx = this.#ctxs.pop()!;
    this.#cofs += ctx.rofs;
  }
  /* ~ */

  /* #cofs */
  /** current offset in `#ctxs.at(-1)` */
  #cofs: uint = 0;
  get cofs() {
    return this.#cofs;
  }

  /** @const @param aofs_x absolute */
  #setCnd(aofs_x: uint) {
    let cnd = this.cnd;
    if (aofs_x < cnd.payload.strt) {
      try {
        for (cnd = cnd.prev!; aofs_x < cnd.payload.strt; cnd = cnd.prev!);
      } catch (_) {
        throw new ExceedSize(`${aofs_x} < ${cnd.payload.strt}`);
      }
      this.cnd$ = cnd;
    } else if (cnd.payload.stop < aofs_x) {
      try {
        for (cnd = cnd.next!; cnd.payload.stop < aofs_x; cnd = cnd.next!);
      } catch (_) {
        throw new ExceedSize(`${aofs_x} > ${cnd.payload.stop}`);
      }
      this.cnd$ = cnd;
    }
  }
  /**
   * @const @param _x in context
   * @throw {@linkcode ExceedSize}
   */
  set cofs(_x: uint) {
    if (_x === this.#cofs) return;

    this.#setCnd(this.#ctxs.at(-1)!.aofs + _x);
    this.#cofs = _x;
  }

  /** current absolute offset */
  get caofs(): uint {
    return this.#ctxs.at(-1)!.aofs + this.#cofs;
  }
  /* ~ */
  /*64||||||||||||||||||||||||||||||||||||||||||||||||||||||||||*/

  override prepare(len_x: uint, strt_x = this.caofs): uint {
    return super.prepare(len_x, strt_x);
  }

  override peek(len_x: uint, strt_x = this.caofs): Uint8Array[] {
    return super.peek(len_x, strt_x);
  }
  /*49|||||||||||||||||||||||||||||||||||||||||||*/

  /** @throw {@linkcode ExceedSize} */
  readByte(): uint8 {
    const aofs = this.caofs;
    this.#cofs += 1;

    const cpl = this.cnd.payload;
    if (aofs < cpl.stop) return cpl.chunk[aofs - cpl.strt];

    /*#static*/ if (INOUT) {
      assert(aofs === cpl.stop);
    }
    if (!this.cnd$!.next) throw new ExceedSize(`${aofs + 1} > ${aofs}`);

    this.cnd$ = this.cnd$!.next;
    return this.cnd$.payload.chunk[0];
  }

  #readUint16(): uint16 {
    /* little endian */
    return this.readByte() | this.readByte() << 8;
  }

  readUint32(): uint32 {
    let value: uint32 = 0;
    for (let i = 0; i < 4; i++) {
      /* little endian */
      value |= this.readByte() << i * 8;
    }
    return value >>> 0;
  }

  readUint64(): bigint {
    let value: bigint = 0n;
    for (let i = 0n; i < 8; i++) {
      /* little endian */
      value |= BigInt(this.readByte()) << i * 8n;
    }
    return value;
  }

  /**
   * Ref. `ReadNumber()` in "[ip7z/7zip]/.../7zIn.cpp"
  //jjjj TOCLEANUP
  //  * @return `uint32` in `[0, 0xfff_ffff]` if reads 1-4 bytes;
  //  *    `bigint` in `[0, 2**64)` if reads 5-9 bytes
   * @throw {@linkcode ExceedSize}
   * @throw {@linkcode UnsupportedFeature}
   */
  readUint(): uint {
    let b_: uint8 | bigint = this.readByte();
    if ((b_ & 0x80) === 0) return b_;

    let value: uint32 | bigint = this.readByte();
    for (let i = 1; i < 4; i++) {
      const mask = 0x80 >> i;
      if ((b_ & mask) === 0) {
        const high = b_ & mask - 1;
        value |= high << i * 8;
        return value;
      }

      /* little endian */
      value |= this.readByte() << i * 8;
    }

    b_ = BigInt(b_);
    value = BigInt(value >>> 0);
    for (let i = 4n; i < 8; i++) {
      const mask = 0x80n >> i;
      if ((b_ & mask) === 0n) {
        const high = b_ & mask - 1n;
        value |= high << i * 8n;
        break;
      }

      /* little endian */
      value |= BigInt(this.readByte()) << i * 8n;
    }

    if (value >= 2 ** 48) {
      throw new UnsupportedFeature(`value: 0x${value.toString(16)}`);
    }
    return Number(value);
  }

  /**
   * Ref. `ReadBoolVector2()` in "[ip7z/7zip]/.../7zIn.cpp"
   * @out @param _x
   * @throw {@linkcode ExceedSize}
   */
  #readBools(_x: boolean[]): void {
    let b_: uint8 = 0;
    let mask: uint8 = 0;
    for (let i = 0, iI = _x.length; i < iI; i++) {
      if (mask === 0) {
        b_ = this.readByte();
        mask = 0x80;
      }
      _x[i] = (b_ & mask) !== 0;
      mask >>= 1;
    }
  }

  /**
   * Ref. `ReadBoolVector2()` in "[ip7z/7zip]/.../7zIn.cpp"
   * @out @param _x
   * @throw {@linkcode ExceedSize}
   */
  #readBoolsAll(_x: boolean[]): void {
    const allDefined = !!this.readByte();
    if (allDefined) _x.fill(true);
    else this.#readBools(_x);
  }

  /**
   * Ref. `ReadHashDigests()` in "[ip7z/7zip]/.../7zIn.cpp"
   * @out @param _x
   */
  #readHashDigests(_x: (uint32 | undefined)[]): void {
    const bs_ = Array.sparse<boolean>(_x.length);
    this.#readBoolsAll(bs_);
    for (let i = 0, iI = _x.length; i < iI; i++) {
      _x[i] = bs_[i] ? this.readUint32() : undefined;
    }
  }

  /**
   * Ref. `Read_UInt32_Vector()` in "[ip7z/7zip]/.../7zIn.cpp"
   * @out @param _x
   * @throw {@linkcode UnsupportedFeature}
   */
  #readUint32s(_x: (uint32 | undefined)[]): void {
    const bs_ = Array.sparse<boolean>(_x.length);
    this.#readBoolsAll(bs_);
    const external = this.readByte();
    if (external !== 0) throw new UnsupportedFeature(`external: ${external}`);
    for (let i = 0, iI = _x.length; i < iI; i++) {
      _x[i] = bs_[i] ? this.readUint32() : undefined;
    }
  }

  /**
   * Ref. `ReadUInt64DefVector()` in "[ip7z/7zip]/.../7zIn.cpp"
   * @out @param _x
   * @throw {@linkcode UnsupportedFeature}
   */
  #readUint64s(_x: (bigint | undefined)[]): void {
    const bs_ = Array.sparse<boolean>(_x.length);
    this.#readBoolsAll(bs_);
    const external = this.readByte();
    if (external !== 0) throw new UnsupportedFeature(`external: ${external}`);
    for (let i = 0, iI = _x.length; i < iI; i++) {
      _x[i] = bs_[i] ? this.readUint64() : undefined;
    }
  }
  /*49|||||||||||||||||||||||||||||||||||||||||||*/

  /**
   * Ref. `ReadPackInfo()` in "[ip7z/7zip]/.../7zIn.cpp"
   * @out @param folders_x
   * @throw {@linkcode ExceedSize}
   * @throw {@linkcode IncorrectFormat}
   * @throw {@linkcode UnsupportedFeature}
   */
  #readPackInfo(folders_x: CFolders): void {
    const numPackStreams = this.readUint() as uint8;
    if (numPackStreams > 0xff) {
      throw new UnsupportedFeature(
        `numPackStreams: ${numPackStreams} (> 0xff)`,
      );
    }
    let type = this.readUint();
    if (type !== NID.kSize) throw new IncorrectFormat();
    folders_x.NumPackStreams = numPackStreams;
    let sum: uint = 0;
    for (let i = 0; i < numPackStreams; i++) {
      folders_x.PackPositions[i] = sum;
      const packSize = this.readUint();
      sum += packSize;
      if (sum < packSize) throw new IncorrectFormat();
    }
    folders_x.PackPositions[numPackStreams] = sum;

    for (;;) {
      type = this.readUint();
      if (type === NID.kEnd) break;

      if (type === NID.kCRC) {
        /* we don't use PackCRCs now */
        this.#readHashDigests(Array.sparse<uint32>(numPackStreams));
      } else {
        this.readUint();
      }
    }
  }

  /**
   * Ref. `ReadUnpackInfo()` in "[ip7z/7zip]/.../7zIn.cpp"
   * @out @param folders_x
   * @throw {@linkcode ExceedSize}
   * @throw {@linkcode IncorrectFormat}
   * @throw {@linkcode UnsupportedFeature}
   */
  #readUnpackInfo(folders_x: CFolders) {
    let type = this.readUint();
    if (type !== NID.kFolder) throw new IncorrectFormat();
    const numFolders = this.readUint() as uint8;
    if (numFolders > 0xff) {
      throw new UnsupportedFeature(`numFolders: ${numFolders} (> 0xff)`);
    }
    folders_x.NumFolders = numFolders;
    let numCodersOutStreams: uint16 = 0;
    const ctxStrt = this.caofs;
    this.ctxIn();
    {
      const external = this.readByte();
      if (external !== 0) throw new UnsupportedFeature(`external: ${external}`);
      //jjjj TOCLEANUP
      // const startBufPtr = this.#cofs;

      let fo: uint8 = 0;
      for (; fo < numFolders; fo++) {
        const folder = new Folder();

        //jjjj TOCLEANUP
        // folders_x.FoCodersDataOffset[fo] = this.#cofs - startBufPtr;
        const numCoders = this.readUint() as uint8;
        // if (numCoders === 0 || numCoders > k_Scan_NumCoders_MAX) {
        if (numCoders !== 1) {
          throw new UnsupportedFeature(`numCoders: ${numCoders}`);
        }
        for (let ci = 0; ci < numCoders; ci++) {
          const mainByte = this.readByte();
          if ((mainByte & 0xC0) !== 0) {
            throw new UnsupportedFeature(
              `mainByte: 0x${mainByte.toString(16)}`,
            );
          }
          const idSize = mainByte & 0xF;
          if (idSize > 4) {
            new UnsupportedFeature(`idSize: 0x${idSize.toString(16)}`);
          }
          let id: uint32 = 0;
          for (let j = 0; j < idSize; j++) {
            id = id << 8 | this.readByte();
          }
          const coder = new CCoderInfo();
          coder.MethodID = id;
          if ((mainByte & 0x10) !== 0) {
            new UnsupportedFeature("Complex Coder");
          } else {
            coder.NumStreams = 1;
          }
          if ((mainByte & 0x20) !== 0) {
            const propSize = this.readUint();
            if (!(id === k_LZMA && propSize === 5)) {
              new UnsupportedFeature(`id: 0x${id.toString(16)}`);
            }
            for (let k = 0; k < propSize; k++) {
              coder.Props[k] = this.readByte();
            }
            //jjjj TOCLEANUP
            // if (id === k_LZMA2 && propSize === 1) {
            //   folders_x.ParsedMethods.LzmaProp = this.readByte();
            // } else if (id === k_LZMA && propSize === 5) {
            //   folders_x.ParsedMethods.LzmaProp = this.readByte();
            //   folders_x.ParsedMethods.LzmaDic = this.readUint32();
            // } else {
            //   new UnsupportedFeature(`id: 0x${id.toString(16)}`);
            // }
          }
          folder.Coders[ci] = coder;
        }
        folders_x.FoToStartPsi[fo] = fo;
        folders_x.FoToCoderUnpackSizes[fo] = numCodersOutStreams;
        numCodersOutStreams += numCoders;
        folders_x.FoToMainUnpackSizeIndex[fo] = 0;
        folders_x.folder_a[fo] = folder;
      }
      //jjjj TOCLEANUP
      // folders_x.FoCodersDataOffset[fo] = this.#cofs - startBufPtr;
      folders_x.FoToStartPsi[fo] = fo;
      folders_x.FoToCoderUnpackSizes[fo] = numCodersOutStreams;
    }
    this.ctxOut();
    this.disuse(ctxStrt, this.caofs);

    type = this.readUint();
    if (type !== NID.kCodersUnpackSize) throw new IncorrectFormat();
    for (let i = 0; i < numCodersOutStreams; i++) {
      folders_x.CoderUnpackSizes[i] = this.readUint();
    }

    for (;;) {
      type = this.readUint();
      if (type === NID.kEnd) break;

      if (type === NID.kCRC) {
        folders_x.FolderCRCs.length = numFolders;
        this.#readHashDigests(folders_x.FolderCRCs);
      } else {
        this.readUint();
      }
    }
  }

  /**
   * Ref. `ReadSubStreamsInfo()` in "[ip7z/7zip]/.../7zIn.cpp"
   * @out @param folders_x
   * @out @param unpackSizes_x
   * @out @param digests_x
   * @throw {@linkcode ExceedSize}
   * @throw {@linkcode IncorrectFormat}
   * @throw {@linkcode UnsupportedFeature}
   */
  #readSubStreamsInfo(
    folders_x: CFolders,
    unpackSizes_x: uint[],
    digests_x: (uint32 | undefined)[],
  ): void {
    for (let fo = 0; fo < folders_x.NumFolders; fo++) {
      folders_x.NumUnpackStreams_a[fo] = 1;
    }

    let type;
    for (;;) {
      type = this.readUint();
      if (type === NID.kNumUnpackStream) {
        for (let fo = 0; fo < folders_x.NumFolders; fo++) {
          const numSubstreams = this.readUint();
          if (numSubstreams > 0xff) {
            throw new UnsupportedFeature(
              `numSubstreams: ${numSubstreams} (> 0xff)`,
            );
          }
          folders_x.NumUnpackStreams_a[fo] = numSubstreams;
        }
        continue;
      }

      if (type === NID.kCRC || type === NID.kSize || type === NID.kEnd) {
        break;
      }

      this.readUint();
    }

    if (type === NID.kSize) {
      for (let fo = 0; fo < folders_x.NumFolders; fo++) {
        const numSubstreams = folders_x.NumUnpackStreams_a[fo];
        if (numSubstreams === 0) continue;

        let sum = 0;
        for (let j = numSubstreams - 1; j--;) {
          const unpackSize = this.readUint();
          unpackSizes_x.push(unpackSize);
          sum += unpackSize;
        }
        const folderUnpackSize = folders_x.GetFolderUnpackSize(fo);
        if (folderUnpackSize < sum) throw new IncorrectFormat();
        unpackSizes_x.push(folderUnpackSize - sum);
      }
      type = this.readUint();
    } else {
      for (let fo = 0; fo < folders_x.NumFolders; fo++) {
        const numSubstreams = folders_x.NumUnpackStreams_a[fo];
        if (numSubstreams > 1) throw new IncorrectFormat();
        if (numSubstreams === 1) {
          unpackSizes_x.push(folders_x.GetFolderUnpackSize(fo));
        }
      }
    }

    let numDigests: uint = 0;
    for (let fo = 0; fo < folders_x.NumFolders; fo++) {
      const numSubstreams = folders_x.NumUnpackStreams_a[fo];
      if (numSubstreams !== 1 || folders_x.FolderCRCs.at(fo) === undefined) {
        numDigests += numSubstreams;
      }
    }
    for (;;) {
      if (type === NID.kEnd) break;

      if (type === NID.kCRC) {
        const bs_ = Array.sparse<boolean>(numDigests);
        this.#readBoolsAll(bs_);
        for (let fo = 0, k = 0, k2 = 0; fo < folders_x.NumFolders; fo++) {
          const numSubstreams = folders_x.NumUnpackStreams_a[fo];
          if (
            numSubstreams === 1 && folders_x.FolderCRCs.at(fo) !== undefined
          ) {
            digests_x[k++] = folders_x.FolderCRCs[fo]!;
          } else {
            for (let j = numSubstreams; j--;) {
              digests_x[k++] = bs_[k2++] ? this.readUint32() : undefined;
            }
          }
        }
      } else {
        this.readUint();
      }

      type = this.readUint();
    }
    if (digests_x.length !== unpackSizes_x.length) {
      digests_x.length = unpackSizes_x.length;
      for (let fo = 0, k = 0; fo < folders_x.NumFolders; fo++) {
        const numSubstreams = folders_x.NumUnpackStreams_a[fo];
        if (numSubstreams === 1 && folders_x.FolderCRCs.at(fo) !== undefined) {
          digests_x[k++] = folders_x.FolderCRCs[fo];
        } else {
          for (let j = numSubstreams; j--;) digests_x[k++] = undefined;
        }
      }
    }
  }

  /**
   * Ref. `ReadStreamsInfo()` in "[ip7z/7zip]/.../7zIn.cpp"
   * @const @param strt_x in context
   * @const @param stop_x in context
   * @out @param folders_x
   * @out @param unpackSizes_x
   * @out @param digests_x
   * @throw {@linkcode ExceedSize}
   * @throw {@linkcode IncorrectFormat}
   * @throw {@linkcode UnsupportedFeature}
   */
  readStreamsInfo(
    strt_x: uint,
    stop_x: uint,
    folders_x: CFolders,
    unpackSizes_x: uint[],
    digests_x?: (uint32 | undefined)[],
  ): uint {
    let dataOffset: uint = 0;
    let type = this.readUint();
    if (type === NID.kPackInfo) {
      dataOffset = this.readUint();
      if (strt_x <= dataOffset && dataOffset < stop_x) {
        throw new IncorrectFormat();
      }

      this.#readPackInfo(folders_x);

      const headerPackStop = dataOffset + folders_x.PackPositions.at(-1)!;
      if (strt_x < headerPackStop && headerPackStop <= stop_x) {
        throw new IncorrectFormat();
      }
      // console.log(
      //   `headerPackStrt: ${dataOffset}, headerPackStop: ${headerPackStop}`,
      // );

      type = this.readUint();
    }

    if (type === NID.kUnpackInfo) {
      this.#readUnpackInfo(folders_x);
      type = this.readUint();
    }

    if (folders_x.NumFolders !== 0 && folders_x.PackPositions.length === 0) {
      /* if there are folders, we need PackPositions also */
      folders_x.PackPositions[0] = 0;
    }

    if (type === NID.kSubStreamsInfo) {
      this.#readSubStreamsInfo(folders_x, unpackSizes_x, digests_x!);
      type = this.readUint();
    } else {
      for (let fo = 0; fo < folders_x.NumFolders; fo++) {
        folders_x.NumUnpackStreams_a[fo] = 1;
        unpackSizes_x.push(folders_x.GetFolderUnpackSize(fo));
      }
    }

    if (type !== NID.kEnd) throw new IncorrectFormat();

    return dataOffset;
  }

  /**
   * Ref. `ReadHeader()` in "[ip7z/7zip]/.../7zIn.cpp"
   * @const @param stop_x in context
   * @out @param db_x
   * @throw {@linkcode ExceedSize}
   * @throw {@linkcode IncorrectFormat}
   * @throw {@linkcode UnsupportedFeature}
   */
  readHeader(stop_x: uint, db_x: CDbEx) {
    let ty_0 = this.readUint();
    if (ty_0 === NID.kArchiveProperties) {
      for (; this.readUint() !== NID.kEnd; this.readUint());
      ty_0 = this.readUint();
    }

    if (ty_0 === NID.kAdditionalStreamsInfo) {
      throw new UnsupportedFeature();
    }

    const unpackSizes: uint[] = [];
    const digests: (uint32 | undefined)[] = [];
    if (ty_0 === NID.kMainStreamsInfo) {
      this.readStreamsInfo(this.cofs, stop_x, db_x, unpackSizes, digests);
      // console.log({ db_x });
      // console.log({ unpackSizes });
      // console.log({ digests });
      ty_0 = this.readUint();
    }

    if (ty_0 === NID.kFilesInfo) {
      const numFiles = this.readUint();
      const emptyStream_bs = Array.sparse<boolean>(numFiles);
      const emptyFile_bs: boolean[] = [];
      const antiFile_bs: boolean[] = [];
      let numEmptyStreams: uint = 0;
      for (;;) {
        const ty_1 = this.readUint();
        if (ty_1 === NID.kEnd) break;

        const size = this.readUint();
        // console.log("ty_1: ", ty_1, ", size: ", size);
        const ctxStrt = this.caofs;
        const ctxStop = ctxStrt + size;
        this.ctxIn();
        {
          switch (ty_1) {
            case NID.kName:
              {
                const external = this.readByte();
                if (external !== 0) {
                  throw new UnsupportedFeature(`external: ${external}`);
                }
                for (let fi = 0; fi < numFiles; fi++) {
                  const u16_a: uint16[] = [];
                  for (;;) {
                    const u16 = this.#readUint16();
                    if (u16 === 0) break;

                    u16_a.push(u16);
                  }
                  if (u16_a.length === 0) throw new IncorrectFormat();
                  db_x.Names[fi] = String.fromCharCode(...u16_a);
                }
                // console.log("db_x.Names: ", db_x.Names);
              }
              break;
            case NID.kWinAttrib:
              db_x.Attrib = Array.sparse<uint32>(numFiles);
              this.#readUint32s(db_x.Attrib);
              break;
            case NID.kEmptyStream:
              this.#readBools(emptyStream_bs);
              for (const b of emptyStream_bs) if (b) numEmptyStreams += 1;
              emptyFile_bs.length = numEmptyStreams;
              antiFile_bs.length = numEmptyStreams;
              break;
            case NID.kEmptyFile:
              this.#readBools(emptyFile_bs!);
              break;
            case NID.kAnti:
              this.#readBools(antiFile_bs!);
              break;
            case NID.kStartPos:
              db_x.StartPos = Array.sparse<bigint>(numFiles);
              this.#readUint64s(db_x.StartPos);
              break;
            case NID.kCTime:
              db_x.CTime = Array.sparse<bigint>(numFiles);
              this.#readUint64s(db_x.CTime);
              break;
            case NID.kATime:
              db_x.ATime = Array.sparse<bigint>(numFiles);
              this.#readUint64s(db_x.ATime);
              break;
            case NID.kMTime:
              db_x.MTime = Array.sparse<bigint>(numFiles);
              this.#readUint64s(db_x.MTime);
              break;
            case NID.kDummy:
              for (let j = size; j--;) {
                if (this.readByte() !== 0) throw new IncorrectFormat();
              }
              break;
            default:
              throw new UnsupportedFeature(`ty_1: ${ty_1}`);
          }
        }
        this.ctxOut();
        if (this.caofs !== ctxStop) throw new IncorrectFormat();
        this.disuse(ctxStrt, ctxStop);
      }

      ty_0 = this.readUint();

      if (numFiles - numEmptyStreams !== unpackSizes.length) {
        throw new UnsupportedFeature();
      }

      let numAntiItems: uint = 0;
      for (const b of antiFile_bs) if (b) numAntiItems += 1;
      if (numAntiItems > 0) db_x.IsAnti = Array.sparse<boolean>(numAntiItems);

      for (let fi = 0, emptyFileIndex = 0, sizeIndex = 0; fi < numFiles; fi++) {
        const file = db_x.Files[fi] = {} as CFileItem;
        let isAnti: boolean;
        if (emptyStream_bs[fi]) {
          file.HasStream = false;
          file.IsDir = !emptyFile_bs[emptyFileIndex];
          isAnti = antiFile_bs[emptyFileIndex];
          emptyFileIndex += 1;
          file.Size = 0;
        } else {
          file.HasStream = true;
          file.IsDir = false;
          isAnti = false;
          file.Size = unpackSizes[sizeIndex];
          file.Crc = digests[sizeIndex];
          sizeIndex += 1;
        }
        if (numAntiItems > 0) db_x.IsAnti![fi] = isAnti;
      }
    }

    db_x.FillLinks();

    if (ty_0 !== NID.kEnd || this.cofs !== stop_x) throw new IncorrectFormat();
    // console.log(db_x);
  }
}
/*80--------------------------------------------------------------------------*/
