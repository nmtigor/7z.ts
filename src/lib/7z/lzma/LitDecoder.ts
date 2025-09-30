/** 80**************************************************************************
 * @module lib/7z/lzma/LitDecoder
 * @license MIT
 ******************************************************************************/

import type { uint8 } from "@fe-lib/alias.ts";
import "@fe-lib/jslang.ts";
import { CProb, LITERAL_DECODER_SIZE } from "./alias.ts";
import { initProbs } from "./util.ts";
/*80--------------------------------------------------------------------------*/

export class LitDecoder {
  /** `lc` */
  numPrevBits: uint8 = 0;
  /** `lp` */
  numPosBits: uint8 = 0;
  /** `(1 << lp) - 1` */
  posMask: uint8 = 0;

  /** Initialized in `Create()` */
  coders!: {
    /** `length === LITERAL_DECODER_SIZE` */
    decoders: CProb[];
  }[];

  Create(
    { numPrevBits, numPosBits, posMask }: {
      numPrevBits: uint8;
      numPosBits: uint8;
      posMask: uint8;
    },
  ): void {
    this.numPrevBits = numPrevBits;
    this.numPosBits = numPosBits;
    this.posMask = posMask;

    /** <= 4096 */
    const numStates = 1 << (this.numPrevBits + this.numPosBits);
    this.coders = Array.from(
      { length: numStates },
      () => ({ decoders: Array.mock(LITERAL_DECODER_SIZE) }),
    );
  }

  Init(): void {
    for (let i = 1 << (this.numPrevBits + this.numPosBits); i--;) {
      initProbs(this.coders[i].decoders);
    }
  }
}
/*80--------------------------------------------------------------------------*/
