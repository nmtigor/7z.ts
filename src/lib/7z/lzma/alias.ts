/** 80**************************************************************************
 * @module lib/7z/lzma/alias
 * @license MIT
 ******************************************************************************/

import type { uint16, uint32, uint8 } from "@fe-lib/alias.ts";
/*80--------------------------------------------------------------------------*/

/** uint16 */
export type CLen = uint16;
/** uint32 */
export type DictSize = uint32;

/** uint16 */
export type CProb = uint16;
/** uint8 */
export type CProbPrice = uint8;

/** uint8 */
export type CState = uint8;

export enum DecodeChunkR {
  err = -1,
  /** success and continue */
  suc = 0,
  /** end of stream */
  end = 1,
}
/*80--------------------------------------------------------------------------*/

export const kNumBitModelTotalBits = 11;
export const kNumMoveBits = 5;

/** 1024 */
export const PROB_INIT_VAL: CProb = (1 << kNumBitModelTotalBits) / 2;
// console.log({ PROB_INIT_VAL }); // 1024
/*49-------------------------------------------*/

/** 0x100_0000 */
export const kTopValue = 1 << 24;
/*49-------------------------------------------*/

export const kNumPosBitsMax = 4;
export type kNumPosBitsMax = 4;

export const kNumStates = 12;
export type kNumStates = 12;
export const kNumLenToPosStates = 4;
export type kNumLenToPosStates = 4;
export const kNumAlignBits = 4;
export const kEndPosModelIndex = 14;
/** 128 */
const kNumFullDistances = 1 << (kEndPosModelIndex >> 1);
export const kMatchMinLen: CLen = 2;
/*49-------------------------------------------*/

/** 4096 */
export const LZMA_DIC_MIN = 1 << 12;
/*49-------------------------------------------*/

/** 16 */
export const LEN_CODERS_SIZE = 1 << kNumPosBitsMax;
export type LEN_CODERS_SIZE = 16;

/** 0xC0 */
export const MATCH_DECODERS_SIZE = kNumStates << kNumPosBitsMax; // 0xC0, 192
export type MATCH_DECODERS_SIZE = 0xC0;

/** 115 */
export const POS_CODERS_SIZE = 1 + kNumFullDistances - kEndPosModelIndex;
// console.log({ POS_CODERS_SIZE }); // 115
export type POS_CODERS_SIZE = 115;

export const LITERAL_DECODER_SIZE = 0x300;
export type LITERAL_DECODER_SIZE = 0x300;

export const CHOICE_ARRAY_SIZE = 2;
export type CHOICE_ARRAY_SIZE = 2;
/*49-------------------------------------------*/
/* Additional LZMA constants */

export const INFINITY_PRICE: CProbPrice = 0xFFF_FFFF;
export const MAX_UINT48 = 0xFFFF_FFFF_FFFF;
export const DICTSIZE_THRESHOLD: DictSize = 0x3FFF_FFFF;
/*80--------------------------------------------------------------------------*/
