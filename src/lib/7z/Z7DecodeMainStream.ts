/** 80**************************************************************************
 * @module lib/7z/Z7DecodeMainStream
 * @license LGPL-2.1
 ******************************************************************************/

import { _TRACE, INOUT } from "../../preNs.ts";
import type { uint, uint32, uint8 } from "../alias.ts";
import { assert, bind } from "../util.ts";
import { calcCRC32 } from "../util/crc32.ts";
import { trace, traceOut } from "../util/trace.ts";
import { k_LZMA, kHeaderSize, kMajorVersion, NID } from "./alias.ts";
import { CDbEx, CFolders } from "./CDbEx.ts";
import { ExtractedFile } from "./ExtractedFile.ts";
import { LzmaDecodeStream } from "./lzma/LzmaDecodeStream.ts";
import { StreamBufr } from "./StreamBufr.ts";
import {
  ExcessiveMemoryUsage,
  IncorrectFormat,
  UnsupportedFeature,
} from "./util.ts";
import { Z7DecodeHeaderStream } from "./Z7DecodeHeaderStream.ts";
import { Z7DecodeStream } from "./Z7DecodeStream.ts";
/*80--------------------------------------------------------------------------*/

type DecompressR_ = {
  lds: LzmaDecodeStream;
  outSize: uint | -1;
};

class LDSData_ {
  readonly #lds;

  #outMax: uint = 0;
  readonly #outBufr = new StreamBufr();

  constructor(lds_x: LzmaDecodeStream) {
    this.#lds = lds_x;
  }
  /*64||||||||||||||||||||||||||||||||||||||||||||||||||||||||||*/

  /**
   * @const @param outStop_x
   * @const @param outStrt_x
   */
  async *#read(outStop_x: uint, outStrt_x: uint = this.#outMax) {
    /*#static*/ if (INOUT) {
      assert(this.#outMax <= outStrt_x);
    }
    using ldsReader = this.#lds.readable.getReader();
    while (this.#outMax < outStop_x) {
      const { done, value: u8a } = await ldsReader.read();
      if (done) {
        await this.#lds.safeguard.promise;
        break;
      }

      const newMax = this.#outMax + u8a.length;
      if (newMax <= outStrt_x) {
        this.#outBufr.add(u8a, this.#outMax);
      } else if (outStrt_x < this.#outMax) {
        if (outStop_x < newMax) {
          yield u8a.subarray(0, outStop_x - this.#outMax);
          this.#outBufr.add(u8a.subarray(outStop_x - this.#outMax), outStop_x);
        } else {
          yield u8a;
        }
      } else {
        if (this.#outMax < outStrt_x) {
          this.#outBufr.add(
            u8a.subarray(0, outStrt_x - this.#outMax),
            this.#outMax,
          );
        }
        if (outStop_x < newMax) {
          yield u8a.subarray(
            outStrt_x - this.#outMax,
            outStop_x - this.#outMax,
          );
          this.#outBufr.add(u8a.subarray(outStop_x - this.#outMax), outStop_x);
        } else {
          yield this.#outMax === outStrt_x
            ? u8a
            : u8a.subarray(outStrt_x - this.#outMax);
        }
      }
      this.#outMax = newMax;
    }
  }

  /**
   * @const @param outStop_x
   * @const @param outStrt_x
   */
  async *createGen(
    outStop_x: uint,
    outStrt_x: uint,
  ): AsyncGenerator<Uint8Array> {
    if (outStrt_x < this.#outMax) {
      if (this.#outMax < outStop_x) {
        const u8a_a = this.#outBufr.peek(
          this.#outMax - outStrt_x,
          outStrt_x,
        );
        for (const u8a of u8a_a) yield u8a;

        //jjjj TOCLEANUP
        // yield* await this.#read(outStop_x);
        yield* this.#read(outStop_x);
      } else {
        const u8a_a = this.#outBufr.peek(outStop_x - outStrt_x, outStrt_x);
        for (const u8a of u8a_a) yield u8a;
      }
    } else {
      //jjjj TOCLEANUP
      // yield* await this.#read(outStop_x, outStrt_x);
      yield* this.#read(outStop_x, outStrt_x);
    }
    this.#outBufr.disuse(outStrt_x, outStop_x);
  }
}

export class Z7DecodeMainStream extends Z7DecodeStream {
  readonly #db = new CDbEx();
  get _db_() {
    return this.#db;
  }

  /** `NumFolders` */
  readonly #ldsdata_a: LDSData_[] = [];

  constructor() {
    super();

    this.#extract();
  }
  /*64||||||||||||||||||||||||||||||||||||||||||||||||||||||||||*/

  /**
   * @const @param folders_x
   * @const @param fo_x
   * @throw {@linkcode UnsupportedFeature}
   */
  @traceOut(_TRACE)
  private _decompress(folders_x: CFolders, fo_x: uint8): DecompressR_ {
    /*#static*/ if (_TRACE) {
      console.log(
        `${trace.indent}>>>>>>> ${this._type_id_}._decompress( , fo_x: ${fo_x}) >>>>>>>`,
      );
    }
    const bufr = this.bufr$;

    const j_ = folders_x.FoToStartPsi[fo_x];
    let inSize: uint = folders_x.PackPositions[j_ + 1] -
      folders_x.PackPositions[j_];

    const folder = folders_x.folder_a[fo_x];
    if (folder.Coders.length !== 1) throw new UnsupportedFeature();
    const coder = folder.Coders[0];
    if (coder.MethodID !== k_LZMA) throw new UnsupportedFeature();

    const outSize =
      folders_x.CoderUnpackSizes[folders_x.FoToCoderUnpackSizes[fo_x]];
    if (inSize === 0) {
      inSize = outSize * 2;
    }
    const lds = new LzmaDecodeStream({ props: coder.Props, outSize });
    const aofs_0 = bufr.aofs_0;
    (async () => {
      await using ldsWritable = lds.writable;
      using ldsWriter = ldsWritable.getWriter();
      let cofs = bufr.cofs;
      let writtn = inSize - bufr.prepare(inSize);
      if (writtn > 0) {
        for (const u8a of bufr.peek(writtn, aofs_0 + cofs)) {
          await ldsWriter.ready;
          // console.log(
          //   Array.from(u8a).map((v) => v.toString(16)),
          // );
          // console.log(
          //   Array.from(u8a.reverse()).map((v) => v.toString(16)),
          // );
          await ldsWriter.write(u8a);
        }
        cofs += writtn;
      }
      let lastChunk;
      while (inSize - writtn > 0) {
        await this.chunk$;
        /* Actual instream size is smaller than `inSize`.
         */ if (this.wsDone$) break;

        await ldsWriter.ready;

        lastChunk = this.wsU8a$!;

        await ldsWriter.write(lastChunk);
        cofs += lastChunk.length;
        writtn += lastChunk.length;
      }

      bufr.cofs = cofs;
    })();
    return { lds, outSize };
  }

  /**
   * @const @param fo_x
   * @const @param outStrt_x in context
   * @const @param outSize_x
   * @throw {@linkcode NoInput}
   * @throw {@linkcode ExceedSize}
   * @throw {@linkcode UnsupportedFeature}
   */
  @traceOut(_TRACE)
  private async _createGen(fo_x: uint8, outStrt_x: uint, outSize_x: uint) {
    /*#static*/ if (_TRACE) {
      console.log(
        `${trace.indent}>>>>>>> ${this._type_id_}._createGen( fo_x: ${fo_x}, outStrt_x: ${outStrt_x}, outSize_x: ${outSize_x}) >>>>>>>`,
      );
    }
    if (!this.#ldsdata_a.at(fo_x)) {
      const j_ = this.#db.FoToStartPsi[fo_x];
      const packPosition = this.#db.PackPositions[j_];
      await this.locateAsync$(this.#db.PackPos + packPosition);
      const { lds } = this._decompress(this.#db, fo_x);
      this.#ldsdata_a[fo_x] = new LDSData_(lds);
    }
    const ldsdata = this.#ldsdata_a[fo_x];
    return ldsdata.createGen(outStrt_x + outSize_x, outStrt_x);
  }

  @traceOut(_TRACE)
  [Symbol.asyncIterator]() {
    /*#static*/ if (_TRACE) {
      console.log(
        `${trace.indent}>>>>>>> ${this._type_id_}[Symbol.asyncIterator]() >>>>>>>`,
      );
    }
    let fi: uint = 0;
    const fiI = this.#db.Names.length;

    /*#static*/ if (INOUT) {
      assert(this.bufr$.ctxsLen === 1);
    }
    this.bufr$.cofs = kHeaderSize;
    this.bufr$.ctxIn();

    const ait: AsyncIterator<ExtractedFile> = {
      return: async () => {
        this.bufr$.ctxOut();
        this.cleanup(); //!
        return { value: undefined, done: true };
      },
      next: async () => {
        if (fi >= fiI) return ait.return!();

        let gen: AsyncGenerator<Uint8Array> | undefined;
        if (this.#db.Files[fi].HasStream) {
          const fo = this.#db.FiToFo[fi];
          /*#static*/ if (INOUT) {
            assert(0 <= fo && fo < this.#db.NumFolders);
          }
          let outStrt = 0;
          for (let fj = this.#db.FoToStartFi[fo]; fj < fi; fj++) {
            outStrt += this.#db.Files[fj].Size;
          }
          // console.log({ outStrt });
          gen = await this._createGen(fo, outStrt, this.#db.Files[fi].Size);
        }
        return { value: new ExtractedFile(this.#db, fi++, gen) };
      },
    };
    return ait;
  }
  /*64||||||||||||||||||||||||||||||||||||||||||||||||||||||||||*/

  /**
   * @throw {@linkcode NoInput}
   * @throw {@linkcode ExceedSize}
   * @throw {@linkcode IncorrectFormat}
   * @throw {@linkcode UnsupportedFeature}
   * @throw {@linkcode ExcessiveMemoryUsage}
   */
  @traceOut(_TRACE)
  async #processAsync(): Promise<void> {
    /*#static*/ if (_TRACE) {
      console.log(
        `${trace.indent}>>>>>>> ${this._type_id_}.#processAsync() >>>>>>>`,
      );
    }
    const bufr = this.bufr$;

    let nextHeaderOffset: uint | bigint;
    let nextHeaderSize: uint | bigint;
    let nextHeaderCRC: uint32;
    await this.prepareAsync$(kHeaderSize);
    {
      if (
        !(bufr.readByte() === /* "7" */ 0x37 &&
          bufr.readByte() === /* "z" */ 0x7A &&
          bufr.readByte() === 0xBC && bufr.readByte() === 0xAF &&
          bufr.readByte() === 0x27 && bufr.readByte() === 0x1C)
      ) throw new IncorrectFormat();

      const Major = bufr.readByte();
      if (Major !== kMajorVersion) throw new IncorrectFormat();
      const Minor = bufr.readByte();
      this.#db.ArcInfo.Version = { Major, Minor };

      const u32 = bufr.readUint32();
      if (u32 !== calcCRC32(bufr.peek(20))) throw new IncorrectFormat();

      nextHeaderOffset = bufr.readUint64();
      nextHeaderSize = bufr.readUint64();
      // console.log({ nextHeaderOffset, nextHeaderSize });
      nextHeaderCRC = bufr.readUint32();
    }
    if (bufr.caofs !== kHeaderSize) throw new IncorrectFormat();
    bufr.disuse(0, kHeaderSize);

    if (nextHeaderOffset >= 2 ** 24) {
      throw new ExcessiveMemoryUsage(
        `nextHeaderOffset: 0x${nextHeaderOffset.toString(16)} (>=2**24)` +
          " (Please extract a streamable archive instead)",
      );
    }
    if (nextHeaderSize >= 2 ** 20) {
      throw new ExcessiveMemoryUsage(
        `nextHeaderSize: ${nextHeaderSize} (>=2**20)`,
      );
    }
    bufr.ctxIn();
    {
      let headerFolders: CFolders | undefined;
      let headerUnpackSizes: uint[] | undefined;
      await this.locateAsync$(nextHeaderOffset = Number(nextHeaderOffset));
      await this.prepareAsync$(nextHeaderSize = Number(nextHeaderSize));
      if (nextHeaderCRC !== calcCRC32(bufr.peek(nextHeaderSize))) {
        throw new IncorrectFormat();
      }
      const useStrt = bufr.caofs;
      const useStop = useStrt + nextHeaderSize;
      // bufr.ctxIn();
      // {
      const type = bufr.readUint();
      if (type === NID.kEncodedHeader) {
        headerFolders = new CFolders();
        headerUnpackSizes = [];
        bufr.readStreamsInfo(useStop, headerFolders, headerUnpackSizes);
        // console.log(headerFolders);
        // console.log(`Coder: ${headerFolders.folder_a.at(0)?.Coders.at(0)}`);
        // console.log(headerUnpackSizes);
      } else if (type === NID.kHeader) {
        bufr.readHeader(nextHeaderOffset + nextHeaderSize, this.#db);
      } else {
        throw new IncorrectFormat();
      }
      // }
      // bufr.ctxOut();
      if (bufr.caofs !== useStop) throw new IncorrectFormat();
      bufr.disuse(useStrt, useStop);

      if (headerFolders) {
        if (headerFolders.NumFolders !== 1) {
          throw new IncorrectFormat(
            `headerFolders.NumFolders: ${headerFolders.NumFolders}`,
          );
        }
        const fo = 0;
        const j_ = headerFolders.FoToStartPsi[fo];
        const packPosition = headerFolders.PackPositions[j_];
        await this.locateAsync$(headerFolders.PackPos + packPosition);
        const streamStrt = bufr.caofs;
        const { lds, outSize } = this._decompress(headerFolders, fo);
        const zdhs = new Z7DecodeHeaderStream(outSize, this.#db);
        await lds.readable.pipeTo(zdhs.writable);

        await lds.safeguard.promise;
        if (!lds.checkSize()) throw new IncorrectFormat();
        const u32 = headerFolders.FolderCRCs[fo];
        if (u32 && u32 !== calcCRC32(zdhs.chunk_a)) {
          throw new IncorrectFormat();
        }

        await zdhs.safeguard.promise;

        // console.log("bufr.caofs: ", bufr.caofs);
        bufr.disuse(streamStrt, bufr.caofs);
      }
      // console.log(this.#db);
    }
    bufr.ctxOut();
  }

  #extract(): void {
    this.#processAsync().then(() => {
      this.safeguard.resolve();
    }).catch(this.safeguard.reject);
    //jjjj TOCLEANUP
    // .finally(() => {
    //   console.log(
    //     `%crun here: ${this._type_id_}.#processAsync().finally()`,
    //     `color:orange`,
    //   );
    //   this.cleanup();
    // });
  }
}
/*80--------------------------------------------------------------------------*/
