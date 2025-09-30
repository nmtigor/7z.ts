/** 80**************************************************************************
 * Ref. [[lzma1]/src/lit-coder.ts](https://github.com/xseman/lzma1/blob/master/src/lit-coder.ts)
 *    * Refactor heavily
 *
 * @module lib/7z/lzma/LitEncoder
 * @license MIT
 ******************************************************************************/

import type { uint, uint8 } from "@fe-lib/alias.ts";
import "@fe-lib/jslang.ts";
import { CProb, PROB_INIT_VAL } from "./alias.ts";
import { getBitPrice, initProbs } from "./util.ts";
/*80--------------------------------------------------------------------------*/

export class LitSubCoder_ {
  readonly #coders = Array.mock(0x300, 0x400 as CProb);
  /** Get decoders array (for compatibility with LiteralDecoderEncoder2) */
  get decoders(): CProb[] {
    return this.#coders;
  }
  /*64||||||||||||||||||||||||||||||||||||||||||||||||||||||||||*/

  /** Get price for encoding literal symbol */
  getPrice(
    matchMode_x: boolean,
    matchByte_x: number,
    symbol_x: number,
  ): number {
    let price = 0;
    let context = 1;
    let i = 7;

    if (matchMode_x) {
      while (i >= 0) {
        const matchBit = (matchByte_x >> i) & 1;
        const bit = (symbol_x >> i) & 1;
        price += getBitPrice(this.#coders[(1 + matchBit) << 8 + context], bit);
        context = (context << 1) | bit;

        if (matchBit !== bit) {
          i--;
          break;
        }
        i--;
      }
    }

    while (i >= 0) {
      const bit = (symbol_x >> i) & 1;
      price += getBitPrice(this.#coders[context], bit);
      context = (context << 1) | bit;
      i--;
    }

    return price;
  }

  /** Reset coder to initial state */
  reset(): void {
    this.#coders.fill(PROB_INIT_VAL);
  }
}

export class LitEncoder {
  /** `lc` */
  #numPrevBits: uint8 = 0;
  /** `(1 << lp) - 1` */
  #posMask: uint8 = 0;

  /** Initialized in `Create()` */
  coders!: LitSubCoder_[];

  Create({ numPrevBits, numPosBits }: {
    numPrevBits: uint8;
    numPosBits: uint8;
  }) {
    this.#numPrevBits = numPrevBits;
    this.#posMask = (1 << numPosBits) - 1;

    /** <= 4096 */
    const numStates = 1 << (numPrevBits + numPosBits);
    this.coders = Array.from(
      { length: numStates },
      () => new LitSubCoder_(),
    );
  }

  Init() {
    for (let i = 1 << (this.#numPrevBits + this.numPosBits); i--;) {
      initProbs(this.coders[i].decoders);
    }
  }
  /*64||||||||||||||||||||||||||||||||||||||||||||||||||||||||||*/

  /** Get sub-coder for position and previous byte */
  getSubCoder(pos: uint, prevByte: number): LitSubCoder_ {
    return this.coders[
      ((pos & this.#posMask) << this.#numPrevBits) +
      (prevByte >> (8 - this.#numPrevBits))
    ];
  }

  /** Reset all sub-coders */
  reset(): void {
    this.coders.forEach((coder) => coder.reset());
  }

  /** Get number of position bits (for compatibility) */
  get numPosBits(): number {
    /* Calculate from posMask */
    return Math.log2(this.#posMask + 1);
  }
}
/*80--------------------------------------------------------------------------*/
