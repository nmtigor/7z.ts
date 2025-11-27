/** 80**************************************************************************
 * @module lib/7z/lzma/Lzma
 * @license MIT
 ******************************************************************************/

import { _TRACE } from "@fe-src/preNs.ts";
import "../../jslang.ts";
import { decodeABV, encodeStr } from "../../util/string.ts";
import { trace, traceOut } from "../../util/trace.ts";
import { LzmaDecodeStream } from "./LzmaDecodeStream.ts";
import { LzmaEncodeStream } from "./LzmaEncodeStream.ts";
import type { CompressionMode } from "./alias.ts";
import { MAX_UINT48 } from "./alias.ts";
/*80--------------------------------------------------------------------------*/

export const Lzma = new class {
  /**
   * Decompress LZMA compressed data
   *
   * @headconst @param data_x Compressed data
   * @return Decompressed data
   */
  @traceOut(_TRACE)
  async decompress(data_x: Uint8Array): Promise<Uint8Array> {
    /*#static*/ if (_TRACE) {
      console.log(`${trace.indent}>>>>>>> Lzma.decompress() >>>>>>>`);
    }
    const lds = new LzmaDecodeStream();

    {
      await using ldsWritable = lds.writable;
      using ldsWriter = ldsWritable.getWriter();
      // const ChunkSize = 4;
      // for (let i = 0, iI = data_x.length; i < iI; i += ChunkSize) {
      //   await ldsWriter.ready;
      //   await ldsWriter.write(new Uint8Array(data_x.slice(i, i + ChunkSize)));
      // }
      await ldsWriter.ready;
      await ldsWriter.write(data_x);
      // console.log(`%crun here: decompress()`, `color:yellow`);
    }

    const ret = await Uint8Array.fromRsU8ary(lds.readable);

    await lds.safeguard.promise;

    return ret;
  }

  /**
   * Decompress LZMA compressed data
   *
   * @headconst @param data_x Compressed data
   * @return Decompressed data
   */
  @traceOut(_TRACE)
  async decompressString(data_x: Uint8Array): Promise<string> {
    /*#static*/ if (_TRACE) {
      console.log(`${trace.indent}>>>>>>> Lzma.decompressString() >>>>>>>`);
    }
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
  @traceOut(_TRACE)
  decompressRs(rs_x: ReadableStream<Uint8Array>): LzmaDecodeStream {
    /*#static*/ if (_TRACE) {
      console.log(`${trace.indent}>>>>>>> Lzma.decompressRs() >>>>>>>`);
    }
    const lds = new LzmaDecodeStream();
    rs_x.pipeThrough(lds);
    return lds;
  }
  /*64||||||||||||||||||||||||||||||||||||||||||||||||||||||||||*/

  /**
   * Compress data using LZMA algorithm
   *
   * @headconst @param data_x Data to compress
   * @const @param mode_x
   * @return Compressed data
   */
  @traceOut(_TRACE)
  async compress(
    data_x: Uint8Array,
    mode_x: CompressionMode = 5,
  ): Promise<Uint8Array> {
    /*#static*/ if (_TRACE) {
      console.log(`${trace.indent}>>>>>>> Lzma.compress() >>>>>>>`);
    }
    const les = new LzmaEncodeStream({
      size: data_x.length <= MAX_UINT48 ? data_x.length : 0,
      mode: mode_x,
    });

    {
      await using lesWriable = les.writable;
      using lesWriter = lesWriable.getWriter();
      // const ChunkSize = 4;
      // for (let i = 0, iI = data_x.length; i < iI; i += ChunkSize) {
      //   await lesWriter.ready;
      //   await lesWriter.write(new Uint8Array(data_x.slice(i, i + ChunkSize)));
      //   if (lds.wsDone) break;
      // }
      await lesWriter.ready;
      await lesWriter.write(data_x);
      // console.log(`%crun here: compress()`, `color:yellow`);
    }
    /* MUST `lesWriable.close()` before `fromRsU8ary()`, otherwise it will
    stuck. */

    const ret = await Uint8Array.fromRsU8ary(les.readable);

    await les.safeguard.promise;

    return ret;
  }

  /**
   * Compress a string using LZMA algorithm
   *
   * @const @param str_x
   * @const @param mode_x
   * @return Compressed data
   */
  @traceOut(_TRACE)
  async compressString(
    str_x: string,
    mode_x: CompressionMode = 5,
  ): Promise<Uint8Array> {
    /*#static*/ if (_TRACE) {
      console.log(`${trace.indent}>>>>>>> Lzma.compressString() >>>>>>>`);
    }
    return await this.compress(encodeStr(str_x), mode_x);
  }

  /**
   * Compress data from a readable stream using LZMA algorithm
   *
   * @headconst @param rs_x Readable stream of data to compress
   * @const @param mode_x
   */
  @traceOut(_TRACE)
  compressRs(
    rs_x: ReadableStream<Uint8Array>,
    mode_x: CompressionMode = 5,
  ): LzmaEncodeStream {
    /*#static*/ if (_TRACE) {
      console.log(`${trace.indent}>>>>>>> Lzma.compressRs() >>>>>>>`);
    }
    const les = new LzmaEncodeStream({ mode: mode_x });
    rs_x.pipeThrough(les);
    return les;
  }
}();
/*80--------------------------------------------------------------------------*/
