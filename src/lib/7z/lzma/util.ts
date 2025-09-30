/** 80**************************************************************************
 * Ref. [[lzma1]/src/utils.ts](https://github.com/xseman/lzma1/blob/master/src/utils.ts)
 *    * Simple constants are moved to "alias.ts"
 *
 * @module lib/7z/lzma/util
 * @license MIT
 ******************************************************************************/

import type { uint, uint8 } from "@fe-lib/alias.ts";
import type { CProb, State } from "./alias.ts";
import { kNumLenToPosStates, PROB_INIT_VAL } from "./alias.ts";
/*80--------------------------------------------------------------------------*/

export class CBitTreeDecoder {
  NumBits: uint8;
  Probs;

  constructor(NumBits: uint8) {
    this.NumBits = NumBits;
    this.Probs = Array.mock<CProb>(1 << NumBits);
  }

  Init() {
    initProbs(this.Probs);
  }
}

/** Literal decoder/encoder for optimization */
export interface LiteralDecoderEncoder2 {
  decoders: number[];
}

/* Constants for 64-bit arithmetic */
const MAX_UINT32 = 0x1_0000_0000;
const MAX_INT32 = 0x7FFF_FFFF;
const MIN_INT32 = -0x8000_0000;
/* ~ */

/* Additional LZMA constants */
export const INFINITY_PRICE = 0xFFF_FFFF;
export const _MAX_UINT32 = 0xFFFF_FFFF;
export const _MAX_UINT48 = 0xFFFF_FFFF_FFFF;
export const DICTIONARY_SIZE_THRESHOLD = 0x3FFF_FFFF;
/* ~ */

/* Range coder constants */
export const kNumMoveReducingBits = 2;
export const kNumBitPriceShiftBits = 6;
/* ~ */

// deno-fmt-ignore
/** CRC32 lookup table for hash calculations */
export const CRC32_TABLE = [
  0x00000000,  0x77073096,  0xEE0E612C,  0x990951BA,  0x076DC419,  0x706AF48F,
  0xE963A535,  0x9E6495A3,  0x0EDB8832,  0x79DCB8A4,  0xE0D5E91E,  0x97D2D988,
  0x09B64C2B,  0x7EB17CBD,  0xE7B82D07,  0x90BF1D91,  0x1DB71064,  0x6AB020F2,
  0xF3B97148,  0x84BE41DE,  0x1ADAD47D,  0x6DDDE4EB,  0xF4D4B551,  0x83D385C7,
  0x136C9856,  0x646BA8C0,  0xFD62F97A,  0x8A65C9EC,  0x14015C4F,  0x63066CD9,
  0xFA0F3D63,  0x8D080DF5,  0x3B6E20C8,  0x4C69105E,  0xD56041E4,  0xA2677172,
  0x3C03E4D1,  0x4B04D447,  0xD20D85FD,  0xA50AB56B,  0x35B5A8FA,  0x42B2986C,
  0xDBBBC9D6,  0xACBCF940,  0x32D86CE3,  0x45DF5C75,  0xDCD60DCF,  0xABD13D59,
  0x26D930AC,  0x51DE003A,  0xC8D75180,  0xBFD06116,  0x21B4F4B5,  0x56B3C423,
  0xCFBA9599,  0xB8BDA50F,  0x2802B89E,  0x5F058808,  0xC60CD9B2,  0xB10BE924,
  0x2F6F7C87,  0x58684C11,  0xC1611DAB,  0xB6662D3D,  0x76DC4190,  0x01DB7106,
  0x98D220BC,  0xEFD5102A,  0x71B18589,  0x06B6B51F,  0x9FBFE4A5,  0xE8B8D433,
  0x7807C9A2,  0x0F00F934,  0x9609A88E,  0xE10E9818,  0x7F6A0DBB,  0x086D3D2D,
  0x91646C97,  0xE6635C01,  0x6B6B51F4,  0x1C6C6162,  0x856530D8,  0xF262004E,
  0x6C0695ED,  0x1B01A57B,  0x8208F4C1,  0xF50FC457,  0x65B0D9C6,  0x12B7E950,
  0x8BBEB8EA,  0xFCB9887C,  0x62DD1DDF,  0x15DA2D49,  0x8CD37CF3,  0xFBD44C65,
  0x4DB26158,  0x3AB551CE,  0xA3BC0074,  0xD4BB30E2,  0x4ADFA541,  0x3DD895D7,
  0xA4D1C46D,  0xD3D6F4FB,  0x4369E96A,  0x346ED9FC,  0xAD678846,  0xDA60B8D0,
  0x44042D73,  0x33031DE5,  0xAA0A4C5F,  0xDD0D7CC9,  0x5005713C,  0x270241AA,
  0xBE0B1010,  0xC90C2086,  0x5768B525,  0x206F85B3,  0xB966D409,  0xCE61E49F,
  0x5EDEF90E,  0x29D9C998,  0xB0D09822,  0xC7D7A8B4,  0x59B33D17,  0x2EB40D81,
  0xB7BD5C3B,  0xC0BA6CAD,  0xEDB88320,  0x9ABFB3B6,  0x03B6E20C,  0x74B1D29A,
  0xEAD54739,  0x9DD277AF,  0x04DB2615,  0x73DC1683,  0xE3630B12,  0x94643B84,
  0x0D6D6A3E,  0x7A6A5AA8,  0xE40ECF0B,  0x9309FF9D,  0x0A00AE27,  0x7D079EB1,
  0xF00F9344,  0x8708A3D2,  0x1E01F268,  0x6906C2FE,  0xF762575D,  0x806567CB,
  0x196C3671,  0x6E6B06E7,  0xFED41B76,  0x89D32BE0,  0x10DA7A5A,  0x67DD4ACC,
  0xF9B9DF6F,  0x8EBEEFF9,  0x17B7BE43,  0x60B08ED5,  0xD6D6A3E8,  0xA1D1937E,
  0x38D8C2C4,  0x4FDFF252,  0xD1BB67F1,  0xA6BC5767,  0x3FB506DD,  0x48B2364B,
  0xD80D2BDA,  0xAF0A1B4C,  0x36034AF6,  0x41047A60,  0xDF60EFC3,  0xA867DF55,
  0x316E8EEF,  0x4669BE79,  0xCB61B38C,  0xBC66831A,  0x256FD2A0,  0x5268E236,
  0xCC0C7795,  0xBB0B4703,  0x220216B9,  0x5505262F,  0xC5BA3BBE,  0xB2BD0B28,
  0x2BB45A92,  0x5CB36A04,  0xC2D7FFA7,  0xB5D0CF31,  0x2CD99E8B,  0x5BDEAE1D,
  0x9B64C2B0,  0xEC63F226,  0x756AA39C,  0x026D930A,  0x9C0906A9,  0xEB0E363F,
  0x72076785,  0x05005713,  0x95BF4A82,  0xE2B87A14,  0x7BB12BAE,  0x0CB61B38,
  0x92D28E9B,  0xE5D5BE0D,  0x7CDCEFB7,  0x0BDBDF21,  0x86D3D2D4,  0xF1D4E242,
  0x68DDB3F8,  0x1FDA836E,  0x81BE16CD,  0xF6B9265B,  0x6FB077E1,  0x18B74777,
  0x88085AE6,  0xFF0F6A70,  0x66063BCA,  0x11010B5C,  0x8F659EFF,  0xF862AE69,
  0x616BFFD3,  0x166CCF45,  0xA00AE278,  0xD70DD2EE,  0x4E048354,  0x3903B3C2,
  0xA7672661,  0xD06016F7,  0x4969474D,  0x3E6E77DB,  0xAED16A4A,  0xD9D65ADC,
  0x40DF0B66,  0x37D83BF0,  0xA9BCAE53,  0xDEBB9EC5,  0x47B2CF7F,  0x30B5FFE9,
  0xBDBDF21C,  0xCABAC28A,  0x53B39330,  0x24B4A3A6,  0xBAD03605,  0xCDD70693,
  0x54DE5729,  0x23D967BF,  0xB3667A2E,  0xC4614AB8,  0x5D681B02,  0x2A6F2B94,
  0xB40BBE37,  0xC30C8EA1,  0x5A05DF1B,  0x2D02EF8D,
];

/** Pre-computed static instances for common use */
export const PROB_PRICES: number[] = createProbPrices();
export const G_FAST_POS: number[] = createFastPos();

/**
 * Copy array data with bounds checking and overlap handling
 * @borrow @const @param src_x
 * @const @param srcOfs_x
 * @borrow @param tgt_x
 * @const @param tgtOfs_x
 * @const @param len_x
 */
export function arraycopy(
  src_x: uint8[],
  srcOfs_x: number,
  tgt_x: uint8[],
  tgtOfs_x: number,
  len_x: number,
): void {
  /* Bounds checking */
  if (
    srcOfs_x < 0 || tgtOfs_x < 0 || len_x < 0 ||
    srcOfs_x + len_x > src_x.length || tgtOfs_x + len_x > tgt_x.length
  ) return;

  if (
    src_x === tgt_x &&
    srcOfs_x < tgtOfs_x &&
    tgtOfs_x < srcOfs_x + len_x
  ) {
    /* Overlapping regions - copy backwards */
    for (let i = len_x; i--;) {
      tgt_x[tgtOfs_x + i] = src_x[srcOfs_x + i];
    }
  } else {
    /* Non-overlapping or safe regions - copy forward */
    for (let i = 0; i < len_x; i++) {
      tgt_x[tgtOfs_x + i] = src_x[srcOfs_x + i];
    }
  }
}

/** Get bit price using pre-computed probability prices */
export function getBitPrice(probability: number, bit: number): number {
  return PROB_PRICES[((probability - bit ^ -bit) & 0x7ff) >>> 2];
}
/*80--------------------------------------------------------------------------*/

/** Create a 64-bit number from low and high parts */
export function create64(
  valueLow: number,
  valueHigh: number,
): [number, number] {
  valueHigh %= 1.8446744073709552E19;
  valueLow %= 1.8446744073709552E19;
  const diffHigh = valueHigh % MAX_UINT32;
  const diffLow = Math.floor(valueLow / MAX_UINT32) * MAX_UINT32;
  valueHigh = valueHigh - diffHigh + diffLow;
  valueLow = valueLow - diffLow + diffHigh;

  while (valueLow < 0) {
    valueLow += MAX_UINT32;
    valueHigh -= MAX_UINT32;
  }

  while (valueLow > 0xFFFF_FFFF) {
    valueLow -= MAX_UINT32;
    valueHigh += MAX_UINT32;
  }
  valueHigh = valueHigh % 1.8446744073709552E19;

  while (valueHigh > 9_223_372_032_559_808_512) {
    valueHigh -= 1.8446744073709552E19;
  }

  while (valueHigh < /** -2**63 */ -9_223_372_036_854_775_808) {
    valueHigh += 1.8446744073709552E19;
  }

  return [valueLow, valueHigh];
}

/** Add two 64-bit numbers */
export function add64(
  a: [number, number],
  b: [number, number],
): [number, number] {
  return create64(a[0] + b[0], a[1] + b[1]);
}

/** Subtract two 64-bit numbers */
export function sub64(
  a: [number, number],
  b: [number, number],
): [number, number] {
  return create64(a[0] - b[0], a[1] - b[1]);
}

function pwrAsDouble(n: number): number {
  if (n <= 0x1E) {
    return 1 << n;
  }

  return pwrAsDouble(0x1E) * pwrAsDouble(n - 0x1E);
}

export function shru64(a: [number, number], n: number): [number, number] {
  n &= 0x3F;
  const shiftFact = pwrAsDouble(n);
  let sr = create64(
    Math.floor(a[0] / shiftFact),
    a[1] / shiftFact,
  );
  if (a[1] < 0) {
    sr = add64(sr, shl64([2, 0], 0x3F - n));
  }
  return sr;
}

export function shl64(a: [number, number], n: number): [number, number] {
  let newHigh, newLow;
  n &= 0x3F;

  if (a[0] == 0 && a[1] == -9223372036854775808) {
    if (!n) {
      return a;
    }
    return [0, 0];
  }

  if (a[1] < 0) {
    throw new Error("Neg");
  }
  const twoToN = pwrAsDouble(n);
  newHigh = a[1] * twoToN % 1.8446744073709552E19;
  newLow = a[0] * twoToN;
  const diff = newLow - newLow % 0x100000000;
  newHigh += diff;
  newLow -= diff;

  if (newHigh >= 9223372036854775807) {
    newHigh -= 1.8446744073709552E19;
  }

  return [newLow, newHigh];
}

/**
 * Compare two 64-bit numbers
 * @borrow @const @param a_x
 * @borrow @const @param b_x
 * @return `-1` if `a_x < b_x`; `1` if `a_x > b_x`
 */
export function compare64(
  a_x: [number, number],
  b_x: [number, number],
): 0 | 1 | -1 {
  if (a_x[0] == b_x[0] && a_x[1] == b_x[1]) return 0;

  const nega = a_x[1] < 0;
  const negb = b_x[1] < 0;
  if (nega && !negb) return -1;
  if (!nega && negb) return 1;
  if (sub64(a_x, b_x)[1] < 0) return -1;
  return 1;
}

export function and64(
  a: [number, number],
  b: [number, number],
): [number, number] {
  const highBits =
    ~~Math.max(Math.min(a[1] / 0x100000000, 0x7FFFFFFF), -0x80000000) &
    ~~Math.max(Math.min(b[1] / 0x100000000, 0x7FFFFFFF), -0x80000000);

  const lowBits = lowBits64(a) & lowBits64(b);

  const high = highBits * 0x100000000;
  let low = lowBits;
  if (lowBits < 0) low += 0x100000000;

  return [low, high];
}

/** Extract low bits from 64-bit number */
export function lowBits64(a: [number, number]): number {
  if (a[0] >= 0x8000_0000) {
    return ~~Math.max(Math.min(a[0] - MAX_UINT32, MAX_INT32), MIN_INT32);
  }

  return ~~Math.max(Math.min(a[0], MAX_INT32), MIN_INT32);
}

/** Create 64-bit number from integer */
export function fromInt64(value: number): [number, number] {
  if (value >= 0) {
    return [value, 0];
  } else {
    return [value + MAX_UINT32, -MAX_UINT32];
  }
}

/** Right shift 64-bit number */
export function shr64(a: [number, number], n: number): [number, number] {
  n &= 0x3F;
  if (n <= 0x1E) {
    const shiftFact = 1 << n;
    return create64(Math.floor(a[0] / shiftFact), a[1] / shiftFact);
  }
  const shiftFact = (1 << 0x1E) * (1 << (n - 0x1E));
  return create64(Math.floor(a[0] / shiftFact), a[1] / shiftFact);
}
/*80--------------------------------------------------------------------------*/
/* Bit model operations */

/** Initialize bit models with default probability  */
export function initProbs(probs: CProb[]): void {
  probs.fill(PROB_INIT_VAL);
}
/*80--------------------------------------------------------------------------*/
/* Position and state operations */

/**
 * Get length to position state mapping
 * @const @param len_x
 */
export function getLenToPosState(len_x: uint): uint8 {
  return Math.min(len_x, kNumLenToPosStates - 1);
}

export const UpdateState_Literal = (state: State): State =>
  (state < 4 ? 0 : state < 10 ? state - 3 : state - 6) as State;
export const UpdateState_Match = (state: State): State =>
  (state < 7 ? 7 : 10) as State;
export const UpdateState_Rep = (state: State): State =>
  (state < 7 ? 8 : 11) as State;
export const UpdateState_ShortRep = (state: State): State =>
  (state < 7 ? 9 : 11) as State;
/*80--------------------------------------------------------------------------*/
/* Bit tree operations */

/** Create probability prices lookup table */
export function createProbPrices(): number[] {
  const probPrices = [];
  for (let i = 8; i >= 0; --i) {
    const start = 1 << (9 - i - 1);
    const end = 1 << (9 - i);

    for (let j = start; j < end; ++j) {
      probPrices[j] = (i << 6) + ((end - j) << 6 >>> (9 - i - 1));
    }
  }

  return probPrices;
}

/** Create fast position lookup table */
export function createFastPos(): number[] {
  const gFastPos = [0, 1];
  let c_ = 2;

  for (let slotFast = 2; slotFast < 22; ++slotFast) {
    const k_ = 1 << ((slotFast >> 1) - 1);

    for (let j = 0; j < k_; ++j, ++c_) {
      gFastPos[c_] = slotFast;
    }
  }

  return gFastPos;
}
/*80--------------------------------------------------------------------------*/
