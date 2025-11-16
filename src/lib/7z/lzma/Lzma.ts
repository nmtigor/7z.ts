/** 80**************************************************************************
 * @module lib/7z/lzma/Lzma
 * @license MIT
 ******************************************************************************/

import "../../jslang.ts";
import { decodeABV, encodeStr } from "../../util/string.ts";
import { LzmaDecodeStream } from "./LzmaDecodeStream.ts";
import { LzmaEncodeStream } from "./LzmaEncodeStream.ts";
import type { CompressionMode } from "./alias.ts";
/*80--------------------------------------------------------------------------*/

export const Lzma = new class {
  /**
   * Compress data using LZMA algorithm
   *
   * @headconst @param data_x Data to compress
   * @const @param mode_x
   * @return Compressed data
   */
  async compress(
    data_x: Uint8Array,
    mode_x: CompressionMode = 5,
  ): Promise<Uint8Array> {
    const les = new LzmaEncodeStream({ size: data_x.length, mode: mode_x });

    const ws_ = les.writable;
    const writer = ws_.getWriter();
    // const ChunkSize = 4;
    // for (let i = 0, iI = data_x.length; i < iI; i += ChunkSize) {
    //   await writer.ready;
    //   await writer.write(new Uint8Array(data_x.slice(i, i + ChunkSize)));
    //   if (lds.wsDone) break;
    // }
    await writer.ready;
    await writer.write(data_x);
    // console.log(`%crun here: compress()`, `color:yellow`);
    writer.releaseLock();
    await ws_.close();

    const ret = await Uint8Array.fromRsU8ary(les.readable);

    const err = await les.error.promise;
    if (err) throw err;

    return ret;
  }

  /**
   * Compress a string using LZMA algorithm
   *
   * @const @param str_x
   * @const @param mode_x
   * @return Compressed data
   */
  compressString(
    str_x: string,
    mode_x: CompressionMode = 5,
  ): Promise<Uint8Array> {
    return this.compress(encodeStr(str_x), mode_x);
  }

  /**
   * Compress data from a readable stream using LZMA algorithm
   *
   * @headconst @param rs_x Readable stream of data to compress
   * @const @param mode_x
   */
  compressRs(
    rs_x: ReadableStream<Uint8Array>,
    mode_x: CompressionMode = 5,
  ): LzmaEncodeStream {
    const les = new LzmaEncodeStream({ mode: mode_x });
    rs_x.pipeThrough(les);
    return les;
  }
  /*64||||||||||||||||||||||||||||||||||||||||||||||||||||||||||*/

  /**
   * Decompress LZMA compressed data
   *
   * @headconst @param data_x Compressed data
   * @return Decompressed data
   */
  async decompress(data_x: Uint8Array): Promise<Uint8Array> {
    const lds = new LzmaDecodeStream();

    const ws_ = lds.writable;
    const writer = ws_.getWriter();
    // const ChunkSize = 4;
    // for (let i = 0, iI = data_x.length; i < iI; i += ChunkSize) {
    //   await writer.ready;
    //   await writer.write(new Uint8Array(data_x.slice(i, i + ChunkSize)));
    // }
    await writer.ready;
    await writer.write(data_x);
    // console.log(`%crun here: decompress()`, `color:yellow`);
    writer.releaseLock();
    await ws_.close();

    const ret = await Uint8Array.fromRsU8ary(lds.readable);

    const err = await lds.error.promise;
    if (err) throw err;

    return ret;
  }

  /**
   * Decompress LZMA compressed data
   *
   * @headconst @param data_x Compressed data
   * @return Decompressed data
   */
  async decompressString(data_x: Uint8Array): Promise<string> {
    const decodedByteArray = await this.decompress(data_x);
    try {
      return decodeABV(decodedByteArray);
    } catch (_) {
      /* If decoding failed and returned binary data, convert to string anyway */
      return String.fromCharCode(...decodedByteArray);
    }
  }

  /**
   * Decompress LZMA compressed data from a readable stream
   *
   * @headconst @param rs_x Readable stream of compressed data
   */
  decompressRs(rs_x: ReadableStream<Uint8Array>): LzmaDecodeStream {
    const lds = new LzmaDecodeStream();
    rs_x.pipeThrough(lds);
    return lds;
  }
}();
/*80--------------------------------------------------------------------------*/
