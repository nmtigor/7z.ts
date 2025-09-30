/** 80**************************************************************************
 * Ref. [[pdf.js]/src/shared/murmurhash3.js](https://github.com/mozilla/pdf.js/blob/master/src/shared/murmurhash3.js)
 *
 * @module lib/util/murmurhash3
 * @license Apache-2.0
 ******************************************************************************/

import type { TypedArray } from "../alias.ts";
import * as Is from "./is.ts";
/*80--------------------------------------------------------------------------*/

const SEED = 0xc3d2_e1f0;
// Workaround for missing math precision in JS.
const MASK_HIGH = 0xffff_0000;
const MASK_LOW = 0xffff;

export class MurmurHash3_64 {
  h1: number;
  h2: number;

  constructor(seed?: number) {
    this.h1 = seed ? seed & 0xffffffff : SEED;
    this.h2 = seed ? seed & 0xffffffff : SEED;
  }

  update(
    input:
      | string
      | ArrayBuffer
      | TypedArray<ArrayBuffer>,
  ) {
    let data: TypedArray<ArrayBuffer>;
    let length;
    if (Is.string(input)) {
      data = new Uint8Array(input.length * 2);
      length = 0;
      for (let i = 0, ii = input.length; i < ii; i++) {
        const code = input.charCodeAt(i);
        if (code <= 0xff) {
          data[length++] = code;
        } else {
          data[length++] = code >>> 8;
          data[length++] = code & 0xff;
        }
      }
    } else if (Is.typedArray(input)) {
      data = input.slice();
      length = data.byteLength;
    } else {
      throw new Error("Invalid data format, must be a string or TypedArray.");
    }

    const blockCounts = length >> 2;
    const tailLength = length - blockCounts * 4;
    // We don't care about endianness here.
    const dataUint32 = new Uint32Array(data.buffer, 0, blockCounts);
    let k1 = 0;
    let k2 = 0;
    let h1 = this.h1;
    let h2 = this.h2;
    const C1 = 0xcc9e_2d51;
    const C2 = 0x1b87_3593;
    const C1_LOW = C1 & MASK_LOW;
    const C2_LOW = C2 & MASK_LOW;

    for (let i = 0; i < blockCounts; i++) {
      if (i & 1) {
        k1 = dataUint32[i];
        k1 = ((k1 * C1) & MASK_HIGH) | ((k1 * C1_LOW) & MASK_LOW);
        k1 = (k1 << 15) | (k1 >>> 17);
        k1 = ((k1 * C2) & MASK_HIGH) | ((k1 * C2_LOW) & MASK_LOW);
        h1 ^= k1;
        h1 = (h1 << 13) | (h1 >>> 19);
        h1 = h1 * 5 + 0xe6546b64;
      } else {
        k2 = dataUint32[i];
        k2 = ((k2 * C1) & MASK_HIGH) | ((k2 * C1_LOW) & MASK_LOW);
        k2 = (k2 << 15) | (k2 >>> 17);
        k2 = ((k2 * C2) & MASK_HIGH) | ((k2 * C2_LOW) & MASK_LOW);
        h2 ^= k2;
        h2 = (h2 << 13) | (h2 >>> 19);
        h2 = h2 * 5 + 0xe6546b64;
      }
    }

    k1 = 0;

    switch (tailLength) {
      case 3:
        k1 ^= data[blockCounts * 4 + 2] << 16;
      /* falls through */
      case 2:
        k1 ^= data[blockCounts * 4 + 1] << 8;
      /* falls through */
      case 1:
        k1 ^= data[blockCounts * 4];
        /* falls through */

        k1 = ((k1 * C1) & MASK_HIGH) | ((k1 * C1_LOW) & MASK_LOW);
        k1 = (k1 << 15) | (k1 >>> 17);
        k1 = ((k1 * C2) & MASK_HIGH) | ((k1 * C2_LOW) & MASK_LOW);
        if (blockCounts & 1) {
          h1 ^= k1;
        } else {
          h2 ^= k1;
        }
    }

    this.h1 = h1;
    this.h2 = h2;
  }

  hexdigest() {
    let h1 = this.h1;
    let h2 = this.h2;

    h1 ^= h2 >>> 1;
    h1 = ((h1 * 0xed558ccd) & MASK_HIGH) | ((h1 * 0x8ccd) & MASK_LOW);
    h2 = ((h2 * 0xff51afd7) & MASK_HIGH) |
      (((((h2 << 16) | (h1 >>> 16)) * 0xafd7ed55) & MASK_HIGH) >>> 16);
    h1 ^= h2 >>> 1;
    h1 = ((h1 * 0x1a85ec53) & MASK_HIGH) | ((h1 * 0xec53) & MASK_LOW);
    h2 = ((h2 * 0xc4ceb9fe) & MASK_HIGH) |
      (((((h2 << 16) | (h1 >>> 16)) * 0xb9fe1a85) & MASK_HIGH) >>> 16);
    h1 ^= h2 >>> 1;

    return (
      (h1 >>> 0).toString(16).padStart(8, "0") +
      (h2 >>> 0).toString(16).padStart(8, "0")
    );
  }
}
/*80--------------------------------------------------------------------------*/
