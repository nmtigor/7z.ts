/** 80**************************************************************************
 * Ref. [[lzma1]/src/len-coder.ts](https://github.com/xseman/lzma1/blob/master/src/len-coder.ts)
 *    * Add `#numPosStates`, `Create()` in `LenEncoder`
 *
 * @module lib/7z/lzma/LenEncoder
 * @license MIT
 ******************************************************************************/

import type { uint, uint8 } from "@fe-lib/alias.ts";
import "@fe-lib/jslang.ts";
import type { CProb } from "./alias.ts";
import type { RangeEncoder } from "./RangeEncoder.ts";
import { CBitTreeDecoder, getBitPrice, initProbs } from "./util.ts";
/*80--------------------------------------------------------------------------*/

/**
 * Length encoder class for LZMA compression
 * Handles encoding of match lengths with price optimization
 */
export class LenEncoder {
  /**
   * `1 << pb`
   * Initialized in `Create()`
   */
  #numPosStates: uint8 = 0;

  /** Choice probability arrays for length range selection */
  readonly #choice = Array.mock<CProb>(2);
  /** Low range coders (for lengths 2-9) */
  #lowCoder: CBitTreeDecoder[] = [];
  /** Mid range coders (for lengths 10-17) */
  #midCoder: CBitTreeDecoder[] = [];
  /** High range coder (for lengths 18+) */
  readonly #highCoder = new CBitTreeDecoder(8);

  /* Price optimization properties */
  #tableSize: uint8 = 0;
  readonly #prices: number[] = [];
  readonly #counters: number[] = [];
  /* ~ */

  /** @const @param numPosStates_x */
  Create(numPosStates_x: uint8) {
    this.#numPosStates = numPosStates_x;

    this.#lowCoder = Array.mock(numPosStates_x);
    this.#midCoder = Array.mock(numPosStates_x);
    for (let posState = 0; posState < numPosStates_x; posState++) {
      this.#lowCoder[posState] = new CBitTreeDecoder(3);
      this.#midCoder[posState] = new CBitTreeDecoder(3);
    }
  }

  /** Initialize the encoder with specified number of position states */
  Init(): void {
    initProbs(this.#choice);
    this.#highCoder.Init();
    for (let posState = 0; posState < this.#numPosStates; ++posState) {
      this.#lowCoder[posState].Init();
      this.#midCoder[posState].Init();
    }
  }

  /** @const @param tableSize_x */
  Init_2(tableSize_x: uint8) {
    this.#tableSize = tableSize_x;
    this.updateTables(this.#numPosStates);
  }
  /*64||||||||||||||||||||||||||||||||||||||||||||||||||||||||||*/

  /** Encode a length value using the provided range encoder */
  encode(
    symbol_x: number,
    posState_x: number,
    rangeEncoder_x: RangeEncoder,
  ): void {
    if (symbol_x < 8) {
      /* Length 2-9: use low coder */
      rangeEncoder_x.encodeBit(this.#choice, 0, 0);
      rangeEncoder_x.encodeBitTree(this.#lowCoder[posState_x], symbol_x);
    } else {
      symbol_x -= 8;
      rangeEncoder_x.encodeBit(this.#choice, 0, 1);

      if (symbol_x < 8) {
        /* Length 10-17: use mid coder */
        rangeEncoder_x.encodeBit(this.#choice, 1, 0);
        rangeEncoder_x.encodeBitTree(this.#midCoder[posState_x], symbol_x);
      } else {
        /* Length 18+: use high coder */
        rangeEncoder_x.encodeBit(this.#choice, 1, 1);
        rangeEncoder_x.encodeBitTree(this.#highCoder, symbol_x - 8);
      }
    }
  }

  /** Get price for encoding a symbol at the given position state */
  getPrice(symbol_x: number, posState_x: number): number {
    return this.#prices[posState_x * 0x110 + symbol_x];
  }

  /** Update price tables for all position states */
  updateTables(numPosStates: uint8): void {
    for (let posState = 0; posState < numPosStates; ++posState) {
      this.setPrices(posState, this.#tableSize, this.#prices, 0);

      if (this.#counters) {
        this.#counters[posState] = this.#tableSize;
      }
    }
  }

  /** Calculate price for bit tree encoder */
  #getBitTreePrice(encoder: CBitTreeDecoder, symbol: number): number {
    let bit, bitIndex: uint, m = 1, price = 0;

    for (bitIndex = encoder.NumBits; bitIndex != 0;) {
      bitIndex -= 1;
      bit = symbol >>> bitIndex & 1;
      price += getBitPrice(encoder.Probs[m], bit);
      m = (m << 1) + bit;
    }

    return price;
  }

  /** Set prices for all symbols in a position state range */
  private setPrices(
    posState: uint8,
    numSymbols: uint8,
    prices: number[],
    priceIndex: number,
  ): void {
    const a0 = getBitPrice(this.#choice[0], 0);
    const a1 = getBitPrice(this.#choice[0], 1);
    const b0 = a1 + getBitPrice(this.#choice[1], 0);
    const b1 = a1 + getBitPrice(this.#choice[1], 1);

    let i = 0;
    const st = priceIndex + posState * 0x110;

    /* Set prices for low range (lengths 2-9) */
    for (i = 0; i < 8; ++i) {
      if (i >= numSymbols) return;
      prices[st + i] = a0 + this.#getBitTreePrice(this.#lowCoder[posState], i);
    }

    /* Set prices for mid range (lengths 10-17) */
    for (; i < 16; ++i) {
      if (i >= numSymbols) return;
      prices[st + i] = b0 +
        this.#getBitTreePrice(this.#midCoder[posState], i - 8);
    }

    /* Set prices for high range (lengths 18+) */
    for (; i < numSymbols; ++i) {
      prices[st + i] = b1 + this.#getBitTreePrice(this.#highCoder, i - 8 - 8);
    }
  }
}
/*80--------------------------------------------------------------------------*/
