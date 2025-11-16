/** 80**************************************************************************
 * @module lib/7z/lzma/alias
 * @license MIT
 ******************************************************************************/

import type { uint16, uint32, uint8 } from "@fe-lib/alias.ts";
/*80--------------------------------------------------------------------------*/

export type Mode = {
  searchDepth: uint8;
  filterStrength: uint8;
  matchFinderType: boolean;
};

/**
 * LZMA compression mode levels (1-9)
 * Higher values provide better compression but are slower
 */
export type CompressionMode = keyof typeof MODES;

/**
 * Compression modes
 *
 * Ref. https://github.com/xseman/lzma1/blob/master/src/lzma.ts
 */
export const MODES = {
  1: { searchDepth: 16, filterStrength: 0x40, matchFinderType: false },
  2: { searchDepth: 20, filterStrength: 0x40, matchFinderType: false },
  3: { searchDepth: 19, filterStrength: 0x40, matchFinderType: true },
  4: { searchDepth: 20, filterStrength: 0x40, matchFinderType: true },
  5: { searchDepth: 21, filterStrength: 0x80, matchFinderType: true },
  6: { searchDepth: 22, filterStrength: 0x80, matchFinderType: true },
  7: { searchDepth: 23, filterStrength: 0x80, matchFinderType: true },
  8: { searchDepth: 24, filterStrength: 0xFF, matchFinderType: true },
  9: { searchDepth: 25, filterStrength: 0xFF, matchFinderType: true },
} as const;
/*80--------------------------------------------------------------------------*/

/** uint16 */
export type CLen = uint16;
/** uint32 */
export type CDist = uint32;

/** uint16 */
export type CProb = uint16;
/** uint32 */
export type CProbPrice = uint32;

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
/** 16 */
const kNumPosStatesMax = 1 << kNumPosBitsMax;

const kLenNumLowBits = 3;
const kLenNumHighBits = 8;
/** 256 */
const kLenNumHighSymbols = 1 << kLenNumHighBits;

const LenLow = 0;
/** 256 */
const LenHigh = LenLow + 2 * (kNumPosStatesMax << kLenNumLowBits);
/** 512 */
const kNumLenProbs = LenHigh + kLenNumHighSymbols;

export const kNumStates = 12;
export type kNumStates = 12;
const kNumStates2 = 16;

export const kStartPosModelIndex = 4;
export const kEndPosModelIndex = 14;
/** 128 */
const kNumFullDistances = 1 << (kEndPosModelIndex >> 1);

export const kNumPosSlotBits = 6;
export const kNumLenToPosStates = 4;
export type kNumLenToPosStates = 4;

export const kNumAlignBits = 4;
/** 16 */
export const kAlignTableSize = 1 << kNumAlignBits;

export const kMatchMinLen = 2;
/** 273, `LZMA_MATCH_LEN_MAX` */
export const kMatchMaxLen: CLen = kMatchMinLen + 256 + 16 - 1;

/** 2048 */
export const kNumOpts = 1 << 11;
/*49-------------------------------------------*/

/** 4096 */
export const LZMA_DIC_MIN: CDist = 1 << 12;
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

export const LZMA_LIT_SIZE = 0x300;
export type LZMA_LIT_SIZE = 0x300;

export const CHOICE_ARRAY_SIZE = 2;
export type CHOICE_ARRAY_SIZE = 2;
/*49-------------------------------------------*/
/* Additional LZMA constants */

/** `2**28 - 1` */
export const INFINITY_PRICE: CProbPrice = 0xFFF_FFFF;
/** `2**48 - 1 */
export const MAX_UINT48 = 0xFFFF_FFFF_FFFF;
/** `2**30 - 1` */
export const DICTSIZE_THRESHOLD: CDist = 0x3FFF_FFFF;
/*80--------------------------------------------------------------------------*/
/* Ref. 7zip/C/LzmaDec.c */

// const kStartOffset = 0
// const SpecPos = -0;
// /** 128 */
// const IsRep0Long = SpecPos + kNumFullDistances;
// /** 384 */
// const RepLenCoder = IsRep0Long + (kNumStates2 << kNumPosBitsMax);
// /** 896 */
// const LenCoder = RepLenCoder + kNumLenProbs;
// /** 1408 */
// const IsMatch = LenCoder + kNumLenProbs;
// /** 1664 */
// const Align = IsMatch + (kNumStates2 << kNumPosBitsMax);
// /** 1680 */
// const IsRep = Align + kAlignTableSize;
// /** 1692 */
// const IsRepG0 = IsRep + kNumStates;
// /** 1704 */
// const IsRepG1 = IsRepG0 + kNumStates;
// /** 1716 */
// const IsRepG2 = IsRepG1 + kNumStates;
// /** 1728 */
// const PosSlot = IsRepG2 + kNumStates;
// /** 1984 */
// const Literal = PosSlot + (kNumLenToPosStates << kNumPosSlotBits);
// /** 1984 */
// const NUM_BASE_PROBS = Literal + kStartOffset;
/*80--------------------------------------------------------------------------*/
