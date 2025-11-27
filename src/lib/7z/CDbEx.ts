/** 80**************************************************************************
 * @module lib/7z/CDbEx
 * @license LGPL-2.1
 ******************************************************************************/

import type { uint, uint16, uint32, uint8 } from "../alias.ts";
import { k_LZMA, kMajorVersion } from "./alias.ts";
import { CDist } from "./lzma/alias.ts";
import { ArcFileInfo, IncorrectFormat, writeUint8m, wtsFrom } from "./util.ts";
/*80--------------------------------------------------------------------------*/

export class CCoderInfo {
  MethodID: uint32 = 0;
  readonly Props: uint8[] = [];

  NumStreams: uint8 = 0;
  get IsSimpleCoder() {
    return this.NumStreams === 1;
  }

  // readonly PackStreams: uint8[] = [0];

  /**
   * @const @param methodId_x
   * @const @param props_x
   * @const @param numStreams_x
   */
  constructor(methodId_x?: uint32, props_x?: uint8[], numStreams_x?: uint8) {
    if (methodId_x === undefined) return;

    this.MethodID = methodId_x;
    this.Props = props_x!;
    this.NumStreams = numStreams_x!;
  }
  /*64||||||||||||||||||||||||||||||||||||||||||||||||||||||||||*/

  /** For testing only */
  toString() {
    return `MethodID: ${this.MethodID.toString(16)}, Props: [${this.Props}]`;
  }
}

export class Folder {
  /** always `length === 1` for the moment */
  Coders: CCoderInfo[] = [];

  /** @const @param coders_x */
  constructor(coders_x?: CCoderInfo[]) {
    if (!coders_x) return;

    this.Coders = coders_x;
  }
}

export class CFolders {
  NumPackStreams: uint8 = 0;
  NumFolders: uint8 = 0;

  PackPos: uint = 0; // in context
  /** `NumPackStreams + 1` */
  readonly PackPositions: uint[] = [];
  /** `FoStartPackStreamIndex`: `NumFolders + 1` */
  readonly FoToStartPsi: uint8[] = [];

  //jjjj TOCLEANUP
  // /** `NumFolders + 1` */
  // readonly FoCodersDataOffset: uint32[] = [];

  readonly CoderUnpackSizes: uint[] = [];
  /** `NumFolders + 1` */
  readonly FoToCoderUnpackSizes: uint16[] = [];
  /** `NumFolders` */
  readonly FoToMainUnpackSizeIndex: uint8[] = [];
  /** @const @param fi_x folder index */
  GetFolderUnpackSize(fi_x: uint): uint {
    return this.CoderUnpackSizes[
      this.FoToCoderUnpackSizes[fi_x] + this.FoToMainUnpackSizeIndex[fi_x]
    ];
  }

  /** `NumFolders` */
  readonly FolderCRCs: (uint32 | undefined)[] = [];

  /** `NumUnpackStreamsVector`: `NumFolders` */
  readonly NumUnpackStreams_a: uint8[] = [];

  /** `NumFolders` */
  readonly folder_a: Folder[] = [];

  /**
   * @const @param afi_a_x
   * @const @param dictSize_x
   */
  constructor(afi_a_x?: ArcFileInfo[], dictSize_x?: CDist) {
    if (!afi_a_x) return;

    this.NumPackStreams = 1;
    this.NumFolders = 1;
    this.PackPositions = [0];
    this.FoToStartPsi = [0, 1];

    this.CoderUnpackSizes = [
      afi_a_x.reduce<uint>((acc, cur) => acc + cur.size, 0),
    ];
    this.FoToCoderUnpackSizes = [0, 1];
    this.FoToMainUnpackSizeIndex = [0];
    this.NumUnpackStreams_a = [
      afi_a_x.reduce<uint8>((acc, cur) => acc + (cur.size > 0 ? 1 : 0), 0),
    ];

    const lzmaProps = new Array<uint8>(5);
    lzmaProps[0] = (/* pb */ 2 * 5 + /* lp*/ 0) * 9 + /* lc*/ 3;
    writeUint8m(dictSize_x!, 4, lzmaProps, 1);
    const coder = new CCoderInfo(k_LZMA, lzmaProps, 1);
    this.folder_a = [new Folder([coder])];
  }
}

export type CFileItem = {
  Size: uint;
  Crc?: uint32 | undefined;
  HasStream: boolean;
  IsDir: boolean;
};

export class CDatabase extends CFolders {
  readonly Files: CFileItem[] = [];

  CTime?: (bigint | undefined)[];
  ATime?: (bigint | undefined)[];
  MTime?: (bigint | undefined)[];
  StartPos?: (bigint | undefined)[];
  Attrib?: (uint32 | undefined)[];
  IsAnti?: boolean[];

  readonly Names: string[] = [];

  /**
   * @const @param afi_a_x
   * @const @param dictSize_x
   */
  constructor(afi_a_x?: ArcFileInfo[], dictSize_x?: CDist) {
    super(afi_a_x, dictSize_x);
    if (!afi_a_x) return;

    const numFiles = afi_a_x.length;
    this.Files.length = numFiles;
    this.MTime = Array.sparse<bigint>(numFiles);
    this.Names = Array.sparse(numFiles);
    for (let i = 0; i < numFiles; i++) {
      const afi_i = afi_a_x[i];
      this.Files[i] = {
        Size: afi_i.size,
        HasStream: afi_i.size > 0,
        IsDir: afi_i.isDir,
      };
      if (afi_i.mtime !== undefined) {
        this.MTime[i] = wtsFrom(afi_i.mtime!);
      }
      this.Names[i] = afi_i.arcPath;
    }
  }
}

type CInArchiveInfo = {
  Version: { Major: uint8; Minor: uint8 };
};

/** @final */
export class CDbEx extends CDatabase {
  readonly ArcInfo = {} as CInArchiveInfo;

  /** `FolderStartFileIndex`: `NumFolders` */
  readonly FoToStartFi: uint[] = [];
  /** `FileIndexToFolderIndexMap`: `Files.length` */
  readonly FiToFo: (uint8 | -1)[] = [];

  /**
   * @const @param afi_a_x
   * @const @param dictSize_x
   */
  constructor(afi_a_x?: ArcFileInfo[], dictSize_x?: CDist) {
    super(afi_a_x, dictSize_x);
    if (!afi_a_x) return;

    this.ArcInfo = { Version: { Major: kMajorVersion, Minor: 4 } };
    const i_ = afi_a_x.findIndex((afi) => afi.size > 0);
    this.FoToStartFi = [i_ >= 0 ? i_ : this.NumFolders];
    for (let i = 0, iI = afi_a_x.length; i < iI; i++) {
      this.FiToFo[i] = afi_a_x[i].size > 0 ? 0 : -1;
    }
  }
  /*64||||||||||||||||||||||||||||||||||||||||||||||||||||||||||*/

  /** @throw {@linkcode IncorrectFormat} */
  FillLinks() {
    this.FoToStartFi.length = this.NumFolders;
    this.FiToFo.length = this.Files.length;

    /** folderIndex */
    let fo: uint = 0;
    let indexInFolder: uint = 0;
    let fi: uint = 0;

    for (const fiI = this.Files.length; fi < fiI; fi++) {
      const emptyStream = !this.Files[fi].HasStream;
      if (indexInFolder === 0) {
        if (emptyStream) {
          this.FiToFo[fi] = -1;
          continue;
        }

        for (;;) {
          if (fo >= this.NumFolders) throw new IncorrectFormat();

          this.FoToStartFi[fo] = fi;
          if (this.NumUnpackStreams_a[fo] !== 0) break;

          fo += 1;
        }
      }
      this.FiToFo[fi] = fo;
      if (emptyStream) continue;

      if (++indexInFolder >= this.NumUnpackStreams_a[fo]) {
        fo += 1;
        indexInFolder = 0;
      }
    }

    if (indexInFolder !== 0) throw new IncorrectFormat();

    // console.log({ fi });
    for (; fo < this.NumFolders; fo++) {
      this.FoToStartFi[fo] = fi;
      if (this.NumUnpackStreams_a[fo] !== 0) throw new IncorrectFormat();
    }
  }
}
/*80--------------------------------------------------------------------------*/
