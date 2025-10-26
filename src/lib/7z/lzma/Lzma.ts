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

/**
 * Compresses data using LZMA algorithm
 *
 * @headconst @param data_x Data to compress
 * @const @param mode_x
 * @return Compressed data
 */
export async function compress(
  data_x: Uint8Array,
  mode_x: CompressionMode = 5,
): Promise<Uint8Array> {
  const les = new LzmaEncodeStream().compress(data_x.length, mode_x);

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
 * Compresses data using LZMA algorithm
 *
 * @headconst @param data_x String to compress
 * @const @param mode_x
 * @return Compressed data
 */
export function compressString(
  data_x: string,
  mode_x: CompressionMode = 5,
): Promise<Uint8Array> {
  return compress(encodeStr(data_x), mode_x);
}
/*64----------------------------------------------------------*/

/**
 * Decompresses LZMA compressed data
 *
 * @headconst @param data_x Compressed data
 * @return Decompressed data
 */
export async function decompress(data_x: Uint8Array): Promise<Uint8Array> {
  const lds = new LzmaDecodeStream().decompress();

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
 * Decompresses LZMA compressed data
 *
 * @headconst @param data_x Compressed data
 * @return Decompressed data
 */
export async function decompressString(data_x: Uint8Array): Promise<string> {
  const decodedByteArray = await decompress(data_x);
  try {
    return decodeABV(decodedByteArray);
  } catch (_) {
    /* If decoding failed and returned binary data, convert to string anyway */
    return String.fromCharCode(...decodedByteArray);
  }
}
/*80--------------------------------------------------------------------------*/
