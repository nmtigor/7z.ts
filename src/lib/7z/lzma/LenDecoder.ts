/** 80**************************************************************************
 * @module lib/7z/lzma/LenDecoder
 * @license MIT
 ******************************************************************************/

import type { uint8 } from "@fe-lib/alias.ts";
import "@fe-lib/jslang.ts";
import type { CProb } from "./alias.ts";
import { CHOICE_ARRAY_SIZE } from "./alias.ts";
import { BitTree, initProbs } from "./util.ts";
/*80--------------------------------------------------------------------------*/

export class LenDecoder {
  /** `1 << pb` */
  numPosStates: uint8 = 0;

  readonly choice = Array.mock<CProb>(CHOICE_ARRAY_SIZE);
  /**
   * `length <= LEN_CODERS_SIZE`\
   * Initialized in {@linkcode Create()}
   */
  LowCoder!: BitTree[];
  /**
   * `length <= LEN_CODERS_SIZE`\
   * Initialized in {@linkcode Create()}
   */
  MidCoder!: BitTree[];
  readonly HighCoder = new BitTree(8);

  /** @const @param numPosStates_x */
  Create(numPosStates_x: uint8): void {
    this.numPosStates = numPosStates_x;

    this.LowCoder = Array.mock(numPosStates_x);
    this.MidCoder = Array.mock(numPosStates_x);
    for (let posState = 0; posState < numPosStates_x; posState++) {
      this.LowCoder[posState] = new BitTree(3);
      this.MidCoder[posState] = new BitTree(3);
    }
  }

  Init(): void {
    initProbs(this.choice);
    this.HighCoder.Init();
    for (let posState = 0; posState < this.numPosStates; ++posState) {
      this.LowCoder[posState].Init();
      this.MidCoder[posState].Init();
    }
  }
}
/*80--------------------------------------------------------------------------*/
