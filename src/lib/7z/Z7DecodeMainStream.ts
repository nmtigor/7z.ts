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
  inSize: uint;
  outSize: uint | -1;
};

type LDSData_ = {
  lds: LzmaDecodeStream;
  outMax: uint;
  outBufr: StreamBufr;
};

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
  #decompress(folders_x: CFolders, fo_x: uint8): DecompressR_ {
    const bufr = this.bufr$;

    const j_ = folders_x.FoToStartPsi[fo_x];
    const streamSize: uint = folders_x.PackPositions[j_ + 1] -
      folders_x.PackPositions[j_];

    const folder = folders_x.folder_a[fo_x];
    if (folder.Coders.length !== 1) throw new UnsupportedFeature();
    const coder = folder.Coders[0];
    if (coder.MethodID !== k_LZMA) throw new UnsupportedFeature();

    const outSize =
      folders_x.CoderUnpackSizes[folders_x.FoToCoderUnpackSizes[fo_x]];
    const lds = new LzmaDecodeStream({ props: coder.Props, outSize });
    const streamStrt = bufr.caofs;
    const streamStop = streamStrt + streamSize;
    // console.log({ streamStrt, streamStop });
    (async () => {
      const ldsWriter = lds.writable.getWriter();
      let writtn = streamSize - bufr.prepare(streamSize);
      if (writtn > 0) {
        for (const u8a of bufr.peek(writtn, streamStrt)) {
          await ldsWriter.ready;
          // console.log(
          //   Array.from(u8a).map((v) => v.toString(16)),
          // );
          // console.log(
          //   Array.from(u8a.reverse()).map((v) => v.toString(16)),
          // );
          await ldsWriter.write(u8a);
        }
      }
      let rest: uint;
      const VALVE = 10_000;
      let valve = VALVE;
      while ((rest = streamSize - writtn) > 0 && --valve) {
        await this.chunk$;
        await ldsWriter.ready;

        if (this.wsU8a$!.length >= rest) {
          if (this.wsU8a$!.length > rest) {
            await ldsWriter.write(this.wsU8a$!.subarray(0, rest));
            bufr.add(this.wsU8a$!.subarray(rest), streamStop);
          } else {
            await ldsWriter.write(this.wsU8a$!);
            bufr.add(this.wsU8a$!);
          }
          break;
        }

        await ldsWriter.write(this.wsU8a$!);
        writtn += this.wsU8a$!.length;
      }
      assert(valve, `Loop ${VALVE}±1 times`);

      ldsWriter.releaseLock();
      await lds.writable.close();

      bufr.cofs += streamSize;
    })();
    return { lds, inSize: streamSize, outSize };
  }

  /**
   * @const @param fo_x
   * @const @param outStrt_x in context
   * @const @param outSize_x
   * @throw {@linkcode NoInput}
   * @throw {@linkcode ExceedSize}
   * @throw {@linkcode UnsupportedFeature}
   */
  async #createGen(
    fo_x: uint8,
    outStrt_x: uint,
    outSize_x: uint,
  ): Promise<AsyncGenerator<Uint8Array>> {
    if (!this.#ldsdata_a.at(fo_x)) {
      const j_ = this.#db.FoToStartPsi[fo_x];
      const packPosition = this.#db.PackPositions[j_];
      await this.locateAsync$(packPosition);
      const { lds } = this.#decompress(this.#db, fo_x);
      this.#ldsdata_a[fo_x] = { lds, outMax: 0, outBufr: new StreamBufr() };
    }
    const ldsdata = this.#ldsdata_a[fo_x];
    const outStop = outStrt_x + outSize_x;
    return (async function* () {
      if (outStrt_x < ldsdata.outMax) {
        const u8a_a = ldsdata.outBufr.peek(outSize_x, outStrt_x);
        for (const u8a of u8a_a) yield u8a;
      } else {
        const reader = ldsdata.lds.readable.getReader();
        try {
          while (ldsdata.outMax < outStop) {
            const { done, value } = await reader.read();
            if (done) {
              const err = await ldsdata.lds.error;
              if (err) throw err;
              break;
            }

            const newMax = ldsdata.outMax + value.length;
            if (ldsdata.outMax <= outStrt_x && outStrt_x < newMax) {
              if (ldsdata.outMax < outStrt_x) {
                ldsdata.outBufr.add(
                  value.subarray(0, outStrt_x - ldsdata.outMax),
                );
              }
              if (newMax <= outStop) {
                yield value.subarray(outStrt_x - ldsdata.outMax);
              } else {
                yield value.subarray(
                  outStrt_x - ldsdata.outMax,
                  outStop - ldsdata.outMax,
                );
                ldsdata.outBufr.add(
                  value.subarray(outStop - ldsdata.outMax),
                  outStop,
                );
              }
            } else {
              ldsdata.outBufr.add(value);
            }
            ldsdata.outMax = newMax;
          }
        } finally {
          reader.releaseLock();
        }
      }
      ldsdata.outBufr.disuse(outStrt_x, outStop);
    })();
  }

  [Symbol.asyncIterator](): AsyncIterator<ExtractedFile> {
    let fi: uint = 0;
    const fI = this.#db.Names.length;

    this.bufr$.cofs = kHeaderSize;
    this.bufr$.ctxIn(); //!

    return {
      next: async () => {
        if (fi >= fI) {
          this.bufr$.ctxOut();

          return { value: undefined, done: true };
        }

        const path = this.#db.Names[fi];
        const meta = this.#db.Files[fi];
        // console.log({ path, meta });
        let gen: AsyncGenerator<Uint8Array> | undefined;
        if (meta.HasStream) {
          const fo = this.#db.FiToFo[fi];
          /*#static*/ if (INOUT) {
            assert(0 <= fo && fo < this.#db.NumFolders);
          }
          let outStrt = 0;
          for (let fj = this.#db.FoToStartFi[fo]; fj < fi; fj++) {
            outStrt += this.#db.Files[fj].Size;
          }
          // console.log({ outStrt });
          gen = await this.#createGen(fo, outStrt, meta.Size);
        }
        fi += 1;
        return { value: new ExtractedFile(path, meta, gen) };
      },
    };
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
        `${trace.indent}>>>>>>> ${this._type_}.#processAsync() >>>>>>>`,
      );
    }
    const bufr = this.bufr$;

    let nextHeaderOffset: bigint | uint;
    let nextHeaderSize: bigint | uint;
    let nextHeaderCRC: uint32;
    await this.prepareAsync$(kHeaderSize);
    bufr.ctxIn();
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
    bufr.ctxOut();
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
        `nextHeaderSize: 0x${nextHeaderSize.toString(16)}`,
      );
    }
    bufr.ctxIn();
    {
      let headerPackStrt: uint | undefined;
      let headerFolders: CFolders | undefined;
      let headerUnpackSizes: uint[] | undefined;
      await this.locateAsync$(nextHeaderOffset = Number(nextHeaderOffset));
      await this.prepareAsync$(nextHeaderSize = Number(nextHeaderSize));
      if (nextHeaderCRC !== calcCRC32(bufr.peek(nextHeaderSize))) {
        throw new IncorrectFormat();
      }
      const ctxStrt = bufr.caofs;
      const ctxStop = ctxStrt + nextHeaderSize;
      bufr.ctxIn();
      {
        const ty_0 = bufr.readUint();
        if (ty_0 === NID.kEncodedHeader) {
          headerFolders = new CFolders();
          headerUnpackSizes = [];
          headerPackStrt = bufr.readStreamsInfo(
            nextHeaderOffset,
            nextHeaderOffset + nextHeaderSize,
            headerFolders,
            headerUnpackSizes,
          );
          // console.log({ headerPackStrt });
          // console.log(headerFolders);
          // console.log(`${headerFolders.folder_a[0].Coders[0]}`);
          // console.log(headerUnpackSizes);
        } else if (ty_0 === NID.kHeader) {
          bufr.readHeader(nextHeaderOffset + nextHeaderSize, this.#db);
        } else {
          throw new IncorrectFormat();
        }
      }
      bufr.ctxOut();
      if (bufr.caofs !== ctxStop) throw new IncorrectFormat();
      bufr.disuse(ctxStrt, ctxStop);

      if (headerFolders) {
        if (headerFolders.NumFolders !== 1) {
          throw new IncorrectFormat(
            `headerFolders.NumFolders: ${headerFolders.NumFolders}`,
          );
        }
        const fo = 0;
        const j_ = headerFolders.FoToStartPsi[fo];
        const packPosition = headerFolders.PackPositions[j_];
        await this.locateAsync$(headerPackStrt! + packPosition);
        const streamStrt = bufr.caofs;
        const { lds, inSize, outSize } = this.#decompress(headerFolders, fo);
        const streamStop = streamStrt + inSize;
        const zdhs = new Z7DecodeHeaderStream(outSize, this.#db);
        await lds.readable.pipeTo(zdhs.writable);

        let err = await lds.error.promise;
        if (err) throw err;
        if (!lds.checkSize()) throw new IncorrectFormat();
        const u32 = headerFolders.FolderCRCs[fo];
        if (u32 && u32 !== calcCRC32(zdhs.chunk_a)) {
          throw new IncorrectFormat();
        }

        err = await zdhs.error.promise;
        if (err) throw err;

        // console.log("bufr.caofs: ", bufr.caofs, ", streamStop: ", streamStop);
        if (bufr.caofs !== streamStop) throw new IncorrectFormat();
        bufr.disuse(streamStrt, streamStop);
      }
      // console.log(this.#db);

      //jjjj TOCLEANUP
      // const fo = 0;
      // const j_ = this.#db.FoToStartPsi[fo];
      // const packPosition = this.#db.PackPositions[j_];
      // await this.locateAsync$(packPosition);
      // const streamStrt = bufr.caofs;
      // const { lds, inSize, outSize } = this.#decompress(this.#db, fo);
      // const streamStop = streamStrt + inSize;
      // const ret = await Uint8Array.fromRsU8ary(lds.readable);
      // console.log("ret: ", ret.length);

      // let err = await lds.error.promise;
      // console.log(`%crun here: `, `color:blue`);
      // if (err) throw err;
      // if (!lds.checkSize()) throw new IncorrectFormat();

      // if (bufr.caofs !== streamStop) throw new IncorrectFormat();
      // bufr.disuse(streamStrt, streamStop);
      //~

      //jjjj TOCLEANUP
      // for (let fi = 0, fI = this.#db.Names.length; fi < fI; fi++) {
      //   this.#tak ??= Promise.withResolvers();
      //   this.#tuk?.resolve(
      //     new ExtractedFile(this.#db.Names[fi], this.#db.Files[fi]),
      //   );
      //   this.#tuk = undefined;
      //   console.log(`%crun here: `, `color:#abc`);
      //   await this.#tak.promise;
      // }
      // this.#tuk?.resolve(null);
      // this.#tuk = undefined;
    }
    bufr.ctxOut();
  }

  #extract(): void {
    this.#processAsync().then(() => {
      this.error.resolve(null);
    }).catch(this.error.resolve)
      .finally(() => {
        // console.log(
        //   `%crun here: ${this._type_}.#processAsync().finally()`,
        //   `color:orange`,
        // );
        this.cleanup();
      });
  }
}
/*80--------------------------------------------------------------------------*/
