/** 80**************************************************************************
 * @module lib/7z/lzma/alias
 * @license MIT
 ******************************************************************************/

import type { Brand, uint16, uint8 } from "@fe-lib/alias.ts";
/*80--------------------------------------------------------------------------*/

export type State = Brand<uint8, "State">;
// export type State2 = Brand<uint16, "State2">;

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

export type CProb = Brand<uint16, "CProb">;

export const PROB_INIT_VAL = (1 << kNumBitModelTotalBits) / 2 as CProb;
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
const kNumFullDistances = 1 << (kEndPosModelIndex >> 1);
export const kMatchMinLen = 2;
/*49-------------------------------------------*/

export const LZMA_DIC_MIN = 1 << 12; // 4096
/*49-------------------------------------------*/

export const LEN_CODERS_SIZE = 1 << kNumPosBitsMax; // 16
export type LEN_CODERS_SIZE = 16; // 16

/** 0xC0 */
export const MATCH_DECODERS_SIZE = kNumStates << kNumPosBitsMax; // 0xC0, 192
export type MATCH_DECODERS_SIZE = 0xC0;

/** 115 */
export const POS_CODERS_SIZE = 1 + kNumFullDistances - kEndPosModelIndex;
// console.log({ POS_CODERS_SIZE }); // 115
export type POS_CODERS_SIZE = 115;

export const LITERAL_DECODER_SIZE = 0x300; // 768
export type LITERAL_DECODER_SIZE = 0x300;

export const CHOICE_ARRAY_SIZE = 2;
export type CHOICE_ARRAY_SIZE = 2;
/*80--------------------------------------------------------------------------*/
