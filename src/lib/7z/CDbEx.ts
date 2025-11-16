/** 80**************************************************************************
 * @module lib/7z/CDbEx
 * @license LGPL-2.1
 ******************************************************************************/

import type { uint, uint16, uint32, uint8 } from "../alias.ts";
import { IncorrectFormat } from "./util.ts";
/*80--------------------------------------------------------------------------*/

export class CCoderInfo {
  MethodID: uint32 = 0;
  Props: uint8[] = [];

  NumStreams: uint8 = 0;
  get IsSimpleCoder() {
    return this.NumStreams === 1;
  }

  // readonly PackStreams: uint8[] = [0];
  /*64||||||||||||||||||||||||||||||||||||||||||||||||||||||||||*/

  /** For testing only */
  toString() {
    return `MethodID: ${this.MethodID.toString(16)}, Props: [${this.Props}]`;
  }
}

export class Folder {
  /** always `length === 1` for the moment */
  Coders: CCoderInfo[] = [];
}

export class CFolders {
  NumPackStreams: uint8 = 0;
  NumFolders: uint8 = 0;

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
}

export type CFileItem = {
  Size: uint;
  Crc: uint32 | undefined;
  HasStream: boolean;
  IsDir: boolean;
};

class CDatabase extends CFolders {
  readonly Files: CFileItem[] = [];

  CTime?: (bigint | undefined)[];
  ATime?: (bigint | undefined)[];
  MTime?: (bigint | undefined)[];
  StartPos?: (bigint | undefined)[];
  Attrib?: (uint32 | undefined)[];
  IsAnti?: boolean[];

  readonly Names: string[] = [];
}

type CInArchiveInfo = {
  Version?: { Major: uint8; Minor: uint8 };
};

/** @final */
export class CDbEx extends CDatabase {
  readonly ArcInfo: CInArchiveInfo = {};

  /** `FolderStartFileIndex`: `NumFolders` */
  readonly FoToStartFi: uint[] = [];
  /** `FileIndexToFolderIndexMap`: `Files.length` */
  readonly FiToFo: (uint8 | -1)[] = [];
  /*64||||||||||||||||||||||||||||||||||||||||||||||||||||||||||*/

  /** @throw {@linkcode IncorrectFormat} */
  FillLinks() {
    this.FoToStartFi.length = this.NumFolders;
    this.FiToFo.length = this.Files.length;

    /** folderIndex */
    let fo: uint = 0;
    let indexInFolder: uint = 0;
    let fi: uint = 0;

    for (const fI = this.Files.length; fi < fI; fi++) {
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

    for (; fo < this.NumFolders; fo++) {
      this.FoToStartFi[fo] = fi;
      if (this.NumUnpackStreams_a[fo] !== 0) throw new IncorrectFormat();
    }
  }
}
/*80--------------------------------------------------------------------------*/
