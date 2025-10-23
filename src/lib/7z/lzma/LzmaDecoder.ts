/** 80**************************************************************************
 * Ref. [[lzma1]/src/decoder.ts](https://github.com/xseman/lzma1/blob/master/src/decoder.ts)
 *    * Refactor heavily
 *
 * @module lib/7z/lzma/LzmaDecoder
 * @license MIT
 ******************************************************************************/

import type { uint8 } from "@fe-lib/alias.ts";
import "@fe-lib/jslang.ts";
import type { CDist, CLen, CProb, CState } from "./alias.ts";
import {
  DecodeChunkR,
  kEndPosModelIndex,
  kMatchMinLen,
  kNumAlignBits,
  kNumLenToPosStates,
  kNumPosBitsMax,
  kNumPosSlotBits,
  kNumStates,
  LZMA_DIC_MIN,
  MATCH_DECODERS_SIZE,
  POS_CODERS_SIZE,
} from "./alias.ts";
import { LenDecoder } from "./LenCoder.ts";
import { LitDecoder } from "./LitCoder.ts";
import type { LzmaDecodeStream } from "./LzmaDecodeStream.ts";
import { LzOutWindow } from "./LzOutWindow.ts";
import { RangeDecoder } from "./RangeDecoder.ts";
import {
  BitTree,
  getLenToPosState,
  initProbs,
  UpdateState_Literal,
  UpdateState_Match,
  UpdateState_Rep,
  UpdateState_ShortRep,
} from "./util.ts";
/*80--------------------------------------------------------------------------*/

export class LzmaDecoder {
  readonly OutWindow = new LzOutWindow();

  readonly #RangeDec = new RangeDecoder();
  set inStream(_x: LzmaDecodeStream) {
    this.#RangeDec.inStream = _x;
  }

  #rep0: CDist = 0;
  #rep1: CDist = 0;
  #rep2: CDist = 0;
  #rep3: CDist = 0;
  #state: CState = 0;

  outSize = 0;
  #nowPos48: uint8 = 0;
  get nowPos48() {
    return this.#nowPos48;
  }
  #prevByte: uint8 = 0;

  /* Decoder configuration */
  /** `(1 << pb) - 1` */
  #posStateMask: uint8 = 0;
  #dictSizeCheck: CDist = 0;
  /* ~ */

  /* match distance */
  readonly #posSlotDecoder = Array.from(
    { length: kNumLenToPosStates },
    () => new BitTree(kNumPosSlotBits),
  );
  readonly AlignDecoder = new BitTree(kNumAlignBits);
  readonly PosDecoders = Array.mock<CProb>(POS_CODERS_SIZE);

  InitDist() {
    for (let i = 0; i < kNumLenToPosStates; ++i) {
      this.#posSlotDecoder[i].Init();
    }
    this.AlignDecoder.Init();
    initProbs(this.PosDecoders);
  }
  /* ~ */

  /* Probability models for different symbols */
  readonly #isMatch = Array.mock<CProb>(MATCH_DECODERS_SIZE);
  readonly #isRep = Array.mock<CProb>(kNumStates);
  readonly IsRepG0 = Array.mock<CProb>(kNumStates);
  readonly IsRepG1 = Array.mock<CProb>(kNumStates);
  readonly IsRepG2 = Array.mock<CProb>(kNumStates);
  readonly IsRep0Long = Array.mock<CProb>(MATCH_DECODERS_SIZE);
  /* ~ */

  readonly #lendec = new LenDecoder();
  readonly #replendec = new LenDecoder();

  readonly #litdec = new LitDecoder();

  async Init(): Promise<void> {
    await this.#RangeDec.Init();
    this.OutWindow.Init();

    this.#litdec.Init();
    this.InitDist();

    initProbs(this.#isMatch);
    initProbs(this.#isRep);
    initProbs(this.IsRepG0);
    initProbs(this.IsRepG1);
    initProbs(this.IsRepG2);
    initProbs(this.IsRep0Long);

    this.#lendec.Init();
    this.#replendec.Init();
  }
  /*64||||||||||||||||||||||||||||||||||||||||||||||||||||||||||*/

  /** @const @param properties_x */
  setDecoderProperties(properties_x: uint8[]): boolean {
    if (properties_x.length < 5) return false;

    const lc = properties_x[0] % 9;
    const remainder = Math.floor(properties_x[0] / 9);
    const lp = remainder % 5;
    const pb = Math.floor(remainder / 5);
    if (pb > 4) return false;

    this.#posStateMask = (1 << pb) - 1;

    /* Calculate dictionary size from `properties_x[1-4]` */
    let dictSize: CDist = 0;
    for (let i = 0; i < 4; i++) {
      /* Treat bytes as unsigned (0-255) instead of signed (-128 to 127) */
      const unsignedByte = properties_x[1 + i] & 0xFF;
      dictSize += unsignedByte << (i * 8);
    }

    this.#dictSizeCheck = Math.max(dictSize, 1);

    this.OutWindow.Create(Math.max(dictSize, LZMA_DIC_MIN));

    this.#litdec.Create({ lc, lp });

    this.#lendec.Create(1 << pb);
    this.#replendec.Create(1 << pb);

    return true;
  }

  async #decodeLiteral(): Promise<void> {
    let symbol = 1;

    const coder = this.#litdec.getSubCoder(this.#nowPos48, this.#prevByte);
    if (this.#state >= 7) {
      let matchByte = this.OutWindow.GetByte(this.#rep0);
      do {
        const matchBit = (matchByte >> 7) & 1;
        matchByte <<= 1;
        const bit = await this.#RangeDec.decodeBit(
          coder.decoders,
          ((1 + matchBit) << 8) + symbol,
        );
        symbol = symbol << 1 | bit;
        if (matchBit !== bit) break;
      } while (symbol < 0x100);
    }
    while (symbol < 0x100) {
      symbol = symbol << 1 |
        await this.#RangeDec.decodeBit(coder.decoders, symbol);
    }
    this.#state = UpdateState_Literal(this.#state);

    this.#prevByte = symbol & 0xff;
    this.OutWindow.PutByte(this.#prevByte);
  }

  /** @const @param len_x */
  async DecodeDistance(len_x: CLen): Promise<CDist> {
    const posSlot = await this.#RangeDec.decodeBitTree(
      this.#posSlotDecoder[getLenToPosState(len_x)],
    );
    if (posSlot < 4) return posSlot;

    const numDirectBits: uint8 = (posSlot >> 1) - 1;
    let dist: CDist = (2 | (posSlot & 1)) << numDirectBits;
    if (posSlot < kEndPosModelIndex) {
      dist += await this.#RangeDec.decodeReverseBits(
        this.PosDecoders,
        numDirectBits,
        // dist - posSlot - 1,
        dist - posSlot,
      );
    } else {
      dist +=
        await this.#RangeDec.decodeDirectBits(numDirectBits - kNumAlignBits) <<
        kNumAlignBits;
      dist += await this.#RangeDec.decodeReverseBits(
        this.AlignDecoder.Probs,
        this.AlignDecoder.NumBits,
      );
    }
    return dist;
  }

  async codeOneChunk(): Promise<DecodeChunkR> {
    const posState: CState = this.#nowPos48 & this.#posStateMask;

    /* LITERAL symbol */ if (
      await this.#RangeDec.decodeBit(
        this.#isMatch,
        (this.#state << kNumPosBitsMax) + posState,
      ) === 0
    ) {
      await this.#decodeLiteral();
      this.#nowPos48++;
    } else {
      let len: CLen;

      /* Rep Match */ if (
        await this.#RangeDec.decodeBit(this.#isRep, this.#state) === 1
      ) {
        len = 0;
        if (await this.#RangeDec.decodeBit(this.IsRepG0, this.#state) === 0) {
          if (
            await this.#RangeDec.decodeBit(
              this.IsRep0Long,
              (this.#state << kNumPosBitsMax) + posState,
            ) === 0
          ) {
            this.#state = UpdateState_ShortRep(this.#state);
            len = 1;
          }
        } else {
          let distance: CDist;
          if (await this.#RangeDec.decodeBit(this.IsRepG1, this.#state) === 0) {
            distance = this.#rep1;
          } else {
            if (
              await this.#RangeDec.decodeBit(this.IsRepG2, this.#state) === 0
            ) {
              distance = this.#rep2;
            } else {
              distance = this.#rep3;
              this.#rep3 = this.#rep2;
            }
            this.#rep2 = this.#rep1;
          }
          this.#rep1 = this.#rep0;
          this.#rep0 = distance;
        }

        if (len === 0) {
          len = await this.#replendec.decode(posState, this.#RangeDec) +
            kMatchMinLen;
          this.#state = UpdateState_Rep(this.#state);
        }
      } /* Simple Match */ else {
        this.#rep3 = this.#rep2;
        this.#rep2 = this.#rep1;
        this.#rep1 = this.#rep0;
        len = await this.#lendec.decode(posState, this.#RangeDec);
        this.#state = UpdateState_Match(this.#state);
        this.#rep0 = await this.DecodeDistance(len);
        if (this.#rep0 < 0) {
          return this.#rep0 === -1 ? DecodeChunkR.end : DecodeChunkR.err;
        }
        len += kMatchMinLen;
      }

      if (this.#rep0 >= this.#nowPos48 || this.#rep0 >= this.#dictSizeCheck) {
        return DecodeChunkR.err;
      }

      this.OutWindow.CopyBlock(this.#rep0, len);
      this.#nowPos48 += len;
      this.#prevByte = this.OutWindow.GetByte(0);
    }

    return DecodeChunkR.suc;
  }

  /** Cleanup decoder resources */
  cleanup(): void {
    this.OutWindow.cleanup();
    this.#RangeDec.cleanup();
  }
}
/*80--------------------------------------------------------------------------*/
