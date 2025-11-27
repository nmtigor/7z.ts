/** 80**************************************************************************
 * @module lib/7z/Z7StreamBufr
 * @license MIT
 ******************************************************************************/

import { _TRACE, INOUT } from "../../preNs.ts";
import type { uint, uint16, uint32, uint8 } from "../alias.ts";
import "../jslang.ts";
import { assert } from "../util.ts";
import { k_LZMA, NID } from "./alias.ts";
import type { CDatabase, CDbEx, CFileItem, CFolders } from "./CDbEx.ts";
import { CCoderInfo, Folder } from "./CDbEx.ts";
import { StreamBufr } from "./StreamBufr.ts";
import { ExceedSize, IncorrectFormat, UnsupportedFeature } from "./util.ts";
import { trace, traceOut } from "../util/trace.ts";
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
  /*64||||||||||||||||||||||||||||||||||||||||||||||||||||||||||*/

  /** For testing only */
  toString() {
    return this.#pa ? `+${this.rofs}` : `${this.rofs}`;
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

  get ctxsLen() {
    return this.#ctxs.length;
  }

  get aofs_0() {
    return this.#ctxs.at(-1)!.aofs;
  }

  @traceOut(_TRACE)
  ctxIn() {
    /*#static*/ if (_TRACE) {
      console.log(`${trace.indent}>>>>>>> ${this._type_id_}.ctxIn() >>>>>>>`);
    }
    const ctx = new Ctx_(this.#cofs, this.#ctxs.at(-1));
    this.#ctxs.push(ctx);
    this.#cofs = 0;
    /*#static*/ if (_TRACE) {
      console.log(
        `${trace.dent}#ctxs: ${this.#ctxs} (${this.#ctxs.at(-1)?.aofs})`,
      );
    }
  }
  /** `in( this.#ctx.length >= 2)` */
  @traceOut(_TRACE)
  ctxOut() {
    /*#static*/ if (_TRACE) {
      console.log(`${trace.indent}>>>>>>> ${this._type_id_}.ctxOut() >>>>>>>`);
      console.log(
        `${trace.dent}#ctxs: ${this.#ctxs} (${this.#ctxs.at(-1)?.aofs})`,
      );
    }
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

  /** @const @param _x in context */
  set cofs(_x: uint) {
    if (_x === this.#cofs) return;

    this.setCnd$(this.aofs_0 + _x);
    this.#cofs = _x;
  }

  /** current absolute offset */
  get caofs(): uint {
    return this.aofs_0 + this.#cofs;
  }
  /* ~ */
  /*64||||||||||||||||||||||||||||||||||||||||||||||||||||||||||*/

  override prepare(size_x: uint, strt_x = this.caofs): uint {
    return super.prepare(size_x, strt_x);
  }

  override peek(size_x: uint, strt_x = this.caofs): Uint8Array[] {
    return super.peek(size_x, strt_x);
  }
  /*49|||||||||||||||||||||||||||||||||||||||||||*/

  /** @throw {@linkcode ExceedSize} */
  readByte(): uint8 {
    const aofs = this.caofs;
    this.#cofs += 1;

    let cnd = this.cnd;
    if (aofs === cnd.payload.stop) {
      if (!cnd.next) throw new ExceedSize(`aofs: ${aofs}`);
      cnd = cnd.next;
    }

    return cnd.payload.readByte(aofs);
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
   * @out @param bs_x
   * @throw {@linkcode ExceedSize}
   */
  #readBools(bs_x: boolean[]): void {
    let v_: uint8 = 0;
    let mask: uint8 = 0;
    for (let i = 0, iI = bs_x.length; i < iI; i++) {
      if (mask === 0) {
        v_ = this.readByte();
        mask = 0x80;
      }
      bs_x[i] = (v_ & mask) !== 0;
      mask >>= 1;
    }
  }

  /**
   * Ref. `ReadBoolVector2()` in "[ip7z/7zip]/.../7zIn.cpp"
   * @out @param bs_x
   * @throw {@linkcode ExceedSize}
   */
  #readBoolsAll(bs_x: boolean[]): void {
    const allTrue = !!this.readByte();
    if (allTrue) bs_x.fill(true);
    else this.#readBools(bs_x);
  }

  /**
   * Ref. `ReadHashDigests()` in "[ip7z/7zip]/.../7zIn.cpp"
   * @out @param _x
   */
  #readHashDigests(_x: (uint32 | undefined)[]): void {
    const b_a = Array.sparse<boolean>(_x.length);
    this.#readBoolsAll(b_a);
    for (let i = 0, iI = _x.length; i < iI; i++) {
      _x[i] = b_a[i] ? this.readUint32() : undefined;
    }
  }

  /**
   * Ref. `Read_UInt32_Vector()` in "[ip7z/7zip]/.../7zIn.cpp"
   * @out @param _x
   * @throw {@linkcode UnsupportedFeature}
   */
  #readUint32s(_x: (uint32 | undefined)[]): void {
    const b_a = Array.sparse<boolean>(_x.length);
    this.#readBoolsAll(b_a);
    const external = this.readByte();
    if (external !== 0) throw new UnsupportedFeature(`external: ${external}`);
    for (let i = 0, iI = _x.length; i < iI; i++) {
      _x[i] = b_a[i] ? this.readUint32() : undefined;
    }
  }

  /**
   * Ref. `ReadUInt64DefVector()` in "[ip7z/7zip]/.../7zIn.cpp"
   * @out @param _x
   * @throw {@linkcode UnsupportedFeature}
   */
  #readUint64s(_x: (bigint | undefined)[]): void {
    const b_a = Array.sparse<boolean>(_x.length);
    this.#readBoolsAll(b_a);
    const external = this.readByte();
    if (external !== 0) throw new UnsupportedFeature(`external: ${external}`);
    for (let i = 0, iI = _x.length; i < iI; i++) {
      _x[i] = b_a[i] ? this.readUint64() : undefined;
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
        const NumCoders = this.readUint() as uint8;
        // if (NumCoders === 0 || NumCoders > k_Scan_NumCoders_MAX) {
        if (NumCoders !== 1) {
          throw new UnsupportedFeature(`NumCoders: ${NumCoders}`);
        }
        for (let ci = 0; ci < NumCoders; ci++) {
          const mainByte = this.readByte();
          // console.log(`mainByte: 0x${mainByte.toString(16)}`);
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
        numCodersOutStreams += NumCoders;
        folders_x.FoToMainUnpackSizeIndex[fo] = 0;
        folders_x.folder_a[fo] = folder;
      }
      //jjjj TOCLEANUP
      // folders_x.FoCodersDataOffset[fo] = this.#cofs - startBufPtr;
      folders_x.FoToStartPsi[fo] = fo;
      folders_x.FoToCoderUnpackSizes[fo] = numCodersOutStreams;
    }
    this.ctxOut();

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
        const b_a = Array.sparse<boolean>(numDigests);
        this.#readBoolsAll(b_a);
        for (let fo = 0, k = 0, k2 = 0; fo < folders_x.NumFolders; fo++) {
          const numSubstreams = folders_x.NumUnpackStreams_a[fo];
          if (
            numSubstreams === 1 && folders_x.FolderCRCs.at(fo) !== undefined
          ) {
            digests_x[k++] = folders_x.FolderCRCs[fo]!;
          } else {
            for (let j = numSubstreams; j--;) {
              digests_x[k++] = b_a[k2++] ? this.readUint32() : undefined;
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
   * @const @param stop_x in context
   * @out @param folders_x
   * @out @param unpackSizes_x
   * @out @param digests_x
   * @throw {@linkcode ExceedSize}
   * @throw {@linkcode IncorrectFormat}
   * @throw {@linkcode UnsupportedFeature}
   */
  @traceOut(_TRACE)
  readStreamsInfo(
    stop_x: uint,
    folders_x: CFolders,
    unpackSizes_x: uint[],
    digests_x?: (uint32 | undefined)[],
  ): void {
    /*#static*/ if (_TRACE) {
      console.log(
        `${trace.indent}>>>>>>> ${this._type_id_}.readStreamsInfo( ${stop_x}) >>>>>>>`,
      );
    }
    const strt = this.cofs;
    let type = this.readUint();
    if (type === NID.kPackInfo) {
      folders_x.PackPos = this.readUint();
      if (strt <= folders_x.PackPos && folders_x.PackPos < stop_x) {
        throw new IncorrectFormat();
      }

      this.#readPackInfo(folders_x);

      const packSize = folders_x.PackPositions.at(-1)!;
      if (packSize > 0) {
        const packStop = folders_x.PackPos + packSize;
        if (strt < packStop && packStop <= stop_x) {
          throw new IncorrectFormat();
        }
      }

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
  }

  /**
   * @out @param db_x
   * @const @param unpackSizes_x
   * @const @param digests_x
   */
  #readFilesInfo(
    db_x: CDatabase,
    unpackSizes_x: uint[],
    digests_x: (uint32 | undefined)[],
  ): void {
    const numFiles = this.readUint();
    const emptyStream_bs = Array.sparse<boolean>(numFiles);
    const emptyFile_bs: boolean[] = [];
    const antiFile_bs: boolean[] = [];
    let numEmptyStreams: uint = 0;
    for (;;) {
      const type = this.readUint();
      if (type === NID.kEnd) break;

      const size = this.readUint();
      // console.log("type: ", type, ", size: ", size);
      const useStop = this.caofs + size;
      this.ctxIn();
      {
        switch (type) {
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
            this.#readBools(emptyFile_bs);
            break;
          case NID.kAnti:
            this.#readBools(antiFile_bs);
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
            throw new UnsupportedFeature(`type: ${type}`);
        }
      }
      this.ctxOut();
      if (this.caofs !== useStop) throw new IncorrectFormat();
    }

    if (numFiles - numEmptyStreams !== unpackSizes_x.length) {
      throw new UnsupportedFeature();
    }

    let numAntiItems: uint = 0;
    for (const b of antiFile_bs) if (b) numAntiItems += 1;
    if (numAntiItems > 0) db_x.IsAnti = Array.sparse<boolean>(numFiles);

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
        file.Size = unpackSizes_x[sizeIndex];
        file.Crc = digests_x[sizeIndex];
        sizeIndex += 1;
      }
      if (numAntiItems > 0) db_x.IsAnti![fi] = isAnti;
    }
  }

  /**
   * Ref. `ReadHeader()` in "[ip7z/7zip]/.../7zIn.cpp"
   * @const @param stop_x in context
   * @out @param db_x
   * @throw {@linkcode ExceedSize}
   * @throw {@linkcode IncorrectFormat}
   * @throw {@linkcode UnsupportedFeature}
   */
  @traceOut(_TRACE)
  readHeader(stop_x: uint, db_x: CDbEx) {
    /*#static*/ if (_TRACE) {
      console.log(
        `${trace.indent}>>>>>>> ${this._type_id_}.readHeader( ${stop_x}) >>>>>>>`,
      );
    }
    let type = this.readUint();
    if (type === NID.kArchiveProperties) {
      for (; this.readUint() !== NID.kEnd; this.readUint());
      type = this.readUint();
    }

    if (type === NID.kAdditionalStreamsInfo) {
      throw new UnsupportedFeature();
    }

    const unpackSizes: uint[] = [];
    const digests: (uint32 | undefined)[] = [];
    if (type === NID.kMainStreamsInfo) {
      this.readStreamsInfo(stop_x, db_x, unpackSizes, digests);
      // console.log({ db_x });
      // console.log({ unpackSizes });
      // console.log({ digests });
      type = this.readUint();
    }

    if (type === NID.kFilesInfo) {
      this.#readFilesInfo(db_x, unpackSizes, digests);
      type = this.readUint();
    }

    db_x.FillLinks();

    if (type !== NID.kEnd || this.cofs !== stop_x) throw new IncorrectFormat();
    // console.log(db_x);
  }
}
/*80--------------------------------------------------------------------------*/
