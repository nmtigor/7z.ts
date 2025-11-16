/** 80**************************************************************************
 * Ref. [[lzma1]/src/lit-coder.ts](https://github.com/xseman/lzma1/blob/master/src/lit-coder.ts)
 *    * Refactor heavily
 *
 * @module lib/7z/lzma/LitCoder
 * @license MIT
 ******************************************************************************/

import type { uint, uint8 } from "@fe-lib/alias.ts";
import "@fe-lib/jslang.ts";
import type { CProb, CProbPrice } from "./alias.ts";
import { LZMA_LIT_SIZE, PROB_INIT_VAL } from "./alias.ts";
import type { ProbState3D } from "./ChunkState.ts";
import { getBitPrice, initProbs } from "./util.ts";
/*80--------------------------------------------------------------------------*/

abstract class LitCoder {
  /** number of literal context bits */
  protected lc$: uint8 = 0;
  /** number of literal position state bits */
  protected lp$: uint8 = 0;
  /** `(1 << lp) - 1` */
  protected posMask$: uint8 = 0;

  /**
   * @const @param pos_x
   * @const @param prevByte_x
   */
  protected getLitState$(pos_x: uint, prevByte_x: uint8): uint8 {
    return ((pos_x & this.posMask$) << this.lc$) +
      (prevByte_x >> (8 - this.lc$));
  }
}

/** Literal decoder/encoder for optimization */
export type ILitSubCoder = {
  /** `length === LZMA_LIT_SIZE` */
  decoders: CProb[];
};
/*64----------------------------------------------------------*/

export class LitDecoder extends LitCoder {
  /* coders */
  /** Initialized in {@linkcode Create()} */
  #coders!: ILitSubCoder[];

  /**
   * Get sub-coder for position and previous byte
   * @const @param pos_x
   * @const @param prevByte_x
   * @out @param pss_x
   */
  getSubCoder(
    pos_x: uint,
    prevByte_x: uint8,
    s3_x?: ProbState3D,
  ): ILitSubCoder {
    const ls_ = this.getLitState$(pos_x, prevByte_x);
    if (s3_x) s3_x.d1 = ls_;
    return this.#coders[ls_];
  }

  /** @const @param s3_x */
  restoreState(s3_x: ProbState3D): void {
    s3_x.restoreToSubCoders(this.#coders);
  }
  /* ~ */

  Create({ lc, lp }: { lc: uint8; lp: uint8 }): void {
    this.lc$ = lc;
    this.lp$ = lp;
    this.posMask$ = (1 << lp) - 1;

    /** <= 4096 */
    const numStates = 1 << (lc + lp);
    this.#coders = Array.from(
      { length: numStates },
      () => ({ decoders: Array.sparse(LZMA_LIT_SIZE) }),
    );
  }

  Init(): void {
    for (let i = 1 << (this.lc$ + this.lp$); i--;) {
      initProbs(this.#coders[i].decoders);
    }
  }
}
/*64----------------------------------------------------------*/

class LitSubCoder_ implements ILitSubCoder {
  readonly #coders = Array.sparse(LZMA_LIT_SIZE, PROB_INIT_VAL);

  /** @implement */
  get decoders(): CProb[] {
    return this.#coders;
  }
  /*64||||||||||||||||||||||||||||||||||||||||||||||||||||||||||*/

  /**
   * Get price for encoding literal symbol
   * @const @param matchMode_x
   * @const @param matchByte_x
   * @const @param symbol_x
   */
  getPrice(
    matchMode_x: boolean,
    matchByte_x: uint8,
    symbol_x: uint8,
  ): CProbPrice {
    let price: CProbPrice = 0;
    let context = 1;
    let i_ = 7;

    if (matchMode_x) {
      for (; i_ >= 0; --i_) {
        const matchBit = (matchByte_x >> i_) & 1;
        const bit = ((symbol_x >> i_) & 1) as 0 | 1;
        price += getBitPrice(
          this.#coders[((1 + matchBit) << 8) + context],
          bit,
        );
        context = context << 1 | bit;

        if (matchBit !== bit) {
          --i_;
          break;
        }
      }
    }

    for (; i_ >= 0; --i_) {
      const bit = (symbol_x >> i_ & 1) as 0 | 1;
      price += getBitPrice(this.#coders[context], bit);
      context = (context << 1) | bit;
    }

    return price;
  }

  /** Reset coder to initial state */
  reset(): void {
    this.#coders.fill(PROB_INIT_VAL);
  }
}

export class LitEncoder extends LitCoder {
  /* coders */
  /** Initialized in {@linkcode Create()} */
  #coders!: LitSubCoder_[];

  /**
   * Get sub-coder for position and previous byte
   * @const @param pos_x
   * @const @param prevByte_x
   */
  getSubCoder(pos_x: uint, prevByte_x: uint8): LitSubCoder_ {
    return this.#coders[this.getLitState$(pos_x, prevByte_x)];
  }
  /* ~ */

  Create({ lc, lp }: { lc: uint8; lp: uint8 }) {
    this.lc$ = lc;
    this.lp$ = lp;
    this.posMask$ = (1 << lp) - 1;

    /** <= 4096 */
    const numStates = 1 << (lc + lp);
    this.#coders = Array.from(
      { length: numStates },
      () => new LitSubCoder_(),
    );
  }

  Init() {
    for (let i = 1 << (this.lc$ + this.lp$); i--;) {
      initProbs(this.#coders[i].decoders);
    }
  }

  /** Reset all sub-coders */
  reset(): void {
    this.#coders.forEach((coder) => coder.reset());
  }
}
/*80--------------------------------------------------------------------------*/
