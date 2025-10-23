/** 80**************************************************************************
 * Ref. [[lzma1]/src/len-coder.ts](https://github.com/xseman/lzma1/blob/master/src/len-coder.ts)
 *    * Refactor heavily
 *
 * @module lib/7z/lzma/LenCoder
 * @license MIT
 ******************************************************************************/

import type { uint, uint8 } from "@fe-lib/alias.ts";
import "@fe-lib/jslang.ts";
import type { CLen, CProb, CProbPrice, CState } from "./alias.ts";
import { CHOICE_ARRAY_SIZE } from "./alias.ts";
import type { RangeEncoder } from "./RangeEncoder.ts";
import { BitTree, getBitPrice, initProbs } from "./util.ts";
import { RangeDecoder } from "./RangeDecoder.ts";
/*80--------------------------------------------------------------------------*/

abstract class LenCoder {
  /** `1 << pb` */
  protected numPosStates$: CState = 0;

  /** Choice probability arrays for length range selection */
  protected readonly choice$ = Array.mock<CProb>(CHOICE_ARRAY_SIZE);
  /**
   * Low range coders (for lengths 2-9)\
   * Initialized in {@linkcode Create()}
   */
  protected lowCoder$!: BitTree[];
  /**
   * Mid range coders (for lengths 10-17)\
   * Initialized in {@linkcode Create()}
   */
  protected midCoder$!: BitTree[];
  /** High range coder (for lengths 18+) */
  protected readonly highCoder$ = new BitTree(8);

  /** @const @param numPosStates_x */
  Create(numPosStates_x: uint8) {
    this.numPosStates$ = numPosStates_x;

    this.lowCoder$ = Array.mock(numPosStates_x);
    this.midCoder$ = Array.mock(numPosStates_x);
    for (let posState = numPosStates_x; posState--;) {
      this.lowCoder$[posState] = new BitTree(3);
      this.midCoder$[posState] = new BitTree(3);
    }
  }

  /** Initialize with specified number of position states */
  Init(): void {
    initProbs(this.choice$);
    this.highCoder$.Init();
    for (let posState = this.numPosStates$; posState--;) {
      this.lowCoder$[posState].Init();
      this.midCoder$[posState].Init();
    }
  }
}

/*64----------------------------------------------------------*/

export class LenDecoder extends LenCoder {
  /**
   * @const @param posState_x
   * @borrow @headconst @param rd_x
   */
  async decode(posState_x: CState, rd_x: RangeDecoder): Promise<CLen> {
    const len: CLen = await rd_x.decodeBit(this.choice$, 0) === 0
      ? await rd_x.decodeBitTree(this.lowCoder$[posState_x])
      : await rd_x.decodeBit(this.choice$, 1) === 0
      ? 8 + await rd_x.decodeBitTree(this.midCoder$[posState_x])
      : 16 + await rd_x.decodeBitTree(this.highCoder$);
    return len;
  }
}
/*64----------------------------------------------------------*/

/**
 * Length encoder class for LZMA compression\
 * Handles encoding of match lengths with price optimization
 */
export class LenEncoder extends LenCoder {
  /* Price optimization properties */
  #tableSize: uint8 = 0;
  readonly #prices: CProbPrice[] = [];
  /** `lnegth < 16` */
  readonly #counters: uint8[] = [];
  /* ~ */

  /** @const @param tableSize_x */
  Init_2(tableSize_x: uint8) {
    this.#tableSize = tableSize_x;
    this.#updateTables();
  }
  /*64||||||||||||||||||||||||||||||||||||||||||||||||||||||||||*/

  /**
   * Encode a length value using the provided range encoder
   * @param symbol_x
   * @const @param posState_x
   * @borrow @headconst @param re_x
   */
  encode(symbol_x: uint8, posState_x: uint8, re_x: RangeEncoder): void {
    if (symbol_x < 8) {
      /* Length 2-9: use low coder */
      re_x.encodeBit(this.choice$, 0, 0);
      re_x.encodeBitTree(this.lowCoder$[posState_x], symbol_x);
    } else {
      symbol_x -= 8;
      re_x.encodeBit(this.choice$, 0, 1);

      if (symbol_x < 8) {
        /* Length 10-17: use mid coder */
        re_x.encodeBit(this.choice$, 1, 0);
        re_x.encodeBitTree(this.midCoder$[posState_x], symbol_x);
      } else {
        /* Length 18+: use high coder */
        re_x.encodeBit(this.choice$, 1, 1);
        re_x.encodeBitTree(this.highCoder$, symbol_x - 8);
      }
    }
  }

  /**
   * Get price for encoding a symbol at the given position state
   * @const @param symbol_x
   * @const @param posState_x
   */
  getPrice(symbol_x: CLen, posState_x: CState): CProbPrice {
    return this.#prices[posState_x * 0x110 + symbol_x];
  }

  /** Update price tables for all position states */
  #updateTables(): void {
    for (let posState: CState = this.numPosStates$; posState--;) {
      this.#setPrices(posState, 0);
      this.#counters[posState] = this.#tableSize;
    }
  }

  /**
   * Calculate price for bit tree encoder
   * @const @param encoder_x
   * @const @param symbol_x
   */
  #getBitTreePrice(encoder_x: BitTree, symbol_x: uint8): CProbPrice {
    let m_ = 1, price: CProbPrice = 0;
    for (let bitIndex = encoder_x.NumBits; bitIndex--;) {
      const bit = (symbol_x >>> bitIndex & 1) as 0 | 1;
      price += getBitPrice(encoder_x.Probs[m_], bit);
      m_ = (m_ << 1) + bit;
    }
    return price;
  }

  /**
   * Set prices for all symbols in a position state range
   * @const @param posState_x
   * @const @param priceIndex_x
   */
  #setPrices(posState_x: CState, priceIndex_x: uint): void {
    const a0 = getBitPrice(this.choice$[0], 0);
    const a1 = getBitPrice(this.choice$[0], 1);
    const b0 = a1 + getBitPrice(this.choice$[1], 0);
    const b1 = a1 + getBitPrice(this.choice$[1], 1);

    let i = 0;
    const st = priceIndex_x + posState_x * 0x110;

    /* Set prices for low range (lengths 2-9) */
    for (i = 0; i < 8; ++i) {
      if (i >= this.#tableSize) return;

      this.#prices[st + i] = a0 +
        this.#getBitTreePrice(this.lowCoder$[posState_x], i);
    }

    /* Set prices for mid range (lengths 10-17) */
    for (; i < 16; ++i) {
      if (i >= this.#tableSize) return;

      this.#prices[st + i] = b0 +
        this.#getBitTreePrice(this.midCoder$[posState_x], i - 8);
    }

    /* Set prices for high range (lengths 18+) */
    for (; i < this.#tableSize; ++i) {
      this.#prices[st + i] = b1 +
        this.#getBitTreePrice(this.highCoder$, i - 8 - 8);
    }
  }
}
/*80--------------------------------------------------------------------------*/
