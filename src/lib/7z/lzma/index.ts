/** 80**************************************************************************
 * Ref. [[lzma1]/src/index.ts](https://github.com/xseman/lzma1/blob/master/src/index.ts)
 *    * Remove parameter type `ArrayBuffer`
 *
 * @module lib/7z/lzma/index
 * @license MIT
 ******************************************************************************/

import type { CompressionMode } from "./Lzma.ts";
import { Lzma } from "./Lzma.ts";
/*80--------------------------------------------------------------------------*/

/**
 * Compresses data using LZMA algorithm
 *
 * @headconst @param data_x Data to compress
 * @const @param mode_x
 * @return Compressed data
 */
export function compress(
  data_x: Uint8Array,
  mode_x: CompressionMode = 5,
): Uint8Array {
  return new Lzma().compress(data_x, mode_x);
}

/**
 * Compresses data using LZMA algorithm
 *
 * @param data_x String to compress
 * @param mode_x
 * @return Compressed data
 */
export function compressString(
  data_x: string,
  mode_x: CompressionMode = 5,
): Uint8Array {
  return new Lzma().compressString(data_x, mode_x);
}

/**
 * Decompresses LZMA compressed data
 *
 * @param data_x Compressed data
 * @return Decompressed data
 */
export function decompress(data_x: Uint8Array): Uint8Array {
  return new Lzma().decompress(data_x);
}

/**
 * Decompresses LZMA compressed data
 *
 * @param data_x Compressed data
 * @return Decompressed data
 */
export function decompressString(data_x: Uint8Array): string {
  return new Lzma().decompressString(data_x);
}
/*80--------------------------------------------------------------------------*/
