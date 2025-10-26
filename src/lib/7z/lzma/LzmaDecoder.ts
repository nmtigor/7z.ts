/** 80**************************************************************************
 * Ref. [[lzma1]/src/decoder.ts](https://github.com/xseman/lzma1/blob/master/src/decoder.ts)
 *    * Refactor heavily
 *
 * @module lib/7z/lzma/LzmaDecoder
 * @license MIT
 ******************************************************************************/

import type { uint, uint8 } from "@fe-lib/alias.ts";
import "@fe-lib/jslang.ts";
import { _TRACE } from "@fe-src/preNs.ts";
import { trace, traceOut } from "../../util/trace.ts";
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
import type { ChunkState, ProbState3D } from "./ChunkState.ts";
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

  #nowPos48: uint = 0;
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
  readonly #AlignDecoder = new BitTree(kNumAlignBits);
  readonly #PosDecoders = Array.mock<CProb>(POS_CODERS_SIZE);

  InitDist() {
    for (let i = 0; i < kNumLenToPosStates; ++i) {
      this.#posSlotDecoder[i].Init();
    }
    this.#AlignDecoder.Init();
    initProbs(this.#PosDecoders);
  }
  /* ~ */

  /* Probability models for different symbols */
  readonly #isMatch = Array.mock<CProb>(MATCH_DECODERS_SIZE);
  readonly #isRep = Array.mock<CProb>(kNumStates);
  readonly #IsRepG0 = Array.mock<CProb>(kNumStates);
  readonly #IsRepG1 = Array.mock<CProb>(kNumStates);
  readonly #IsRepG2 = Array.mock<CProb>(kNumStates);
  readonly #IsRep0Long = Array.mock<CProb>(MATCH_DECODERS_SIZE);
  /* ~ */

  readonly #lendec = new LenDecoder();
  readonly #replendec = new LenDecoder();

  readonly #litdec = new LitDecoder();

  /**
   * @const
   * @out @param cs_x
   */
  #saveState(cs_x: ChunkState) {
    this.#RangeDec.saveState(cs_x);

    cs_x.rep0 = this.#rep0;
    cs_x.rep1 = this.#rep1;
    cs_x.rep2 = this.#rep2;
    cs_x.rep3 = this.#rep3;
    cs_x.state = this.#state;

    cs_x.nowPos48 = this.#nowPos48;
    cs_x.prevByte = this.#prevByte;
  }

  /** @const @param cs_x */
  @traceOut(_TRACE)
  restoreState(cs_x: ChunkState): void {
    /*#static*/ if (_TRACE) {
      console.log(`${trace.indent}>>>>>>> LzmaDecoder.restoreState() >>>>>>>`);
      // console.log(`${trace.dent}${cs_x}`);
    }
    this.#RangeDec.restoreState(cs_x);

    this.#rep0 = cs_x.rep0;
    this.#rep1 = cs_x.rep1;
    this.#rep2 = cs_x.rep2;
    this.#rep3 = cs_x.rep3;
    this.#state = cs_x.state;

    this.#nowPos48 = cs_x.nowPos48;
    this.#prevByte = cs_x.prevByte;

    cs_x.posSlotDecoder.restoreToBitTrees(this.#posSlotDecoder);
    cs_x.AlignDecoder.restoreTo(this.#AlignDecoder.Probs);
    cs_x.PosDecoders.restoreTo(this.#PosDecoders);

    cs_x.isMatch.restoreTo(this.#isMatch);
    cs_x.isRep.restoreTo(this.#isRep);
    cs_x.IsRepG0.restoreTo(this.#IsRepG0);
    cs_x.IsRepG1.restoreTo(this.#IsRepG1);
    cs_x.IsRepG2.restoreTo(this.#IsRepG2);
    cs_x.IsRep0Long.restoreTo(this.#IsRep0Long);

    this.#lendec.restoreState(cs_x.lendec);
    this.#replendec.restoreState(cs_x.replendec);

    this.#litdec.restoreState(cs_x.litCoders);
  }

  async Init(): Promise<void> {
    await this.#RangeDec.Init();
    this.OutWindow.Init();

    this.#litdec.Init();
    this.InitDist();

    initProbs(this.#isMatch);
    initProbs(this.#isRep);
    initProbs(this.#IsRepG0);
    initProbs(this.#IsRepG1);
    initProbs(this.#IsRepG2);
    initProbs(this.#IsRep0Long);

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

  /**
   * @headconst @param s3_x
   * @throw {@linkcode NoInput}
   * @throw {@linkcode ExceedSize}
   */
  #decodeLiteralSync(s3_x?: ProbState3D): void {
    let symbol = 1;

    const coder = this.#litdec.getSubCoder(
      this.#nowPos48,
      this.#prevByte,
      s3_x,
    );
    if (this.#state >= 7) {
      let matchByte = this.OutWindow.GetByte(this.#rep0);
      do {
        const matchBit = (matchByte >> 7) & 1;
        matchByte <<= 1;
        const bit = this.#RangeDec.decodeBitSync(
          coder.decoders,
          ((1 + matchBit) << 8) + symbol,
          s3_x,
        );
        symbol = symbol << 1 | bit;
        if (matchBit !== bit) break;
      } while (symbol < 0x100);
    }
    while (symbol < 0x100) {
      symbol = symbol << 1 |
        this.#RangeDec.decodeBitSync(coder.decoders, symbol, s3_x);
    }
    this.#state = UpdateState_Literal(this.#state);

    this.#prevByte = symbol & 0xff;
    this.OutWindow.PutByte(this.#prevByte);
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

  /**
   * @const @param len_x
   * @headconst @param cs_x
   * @throw {@linkcode NoInput}
   */
  DecodeDistanceSync(len_x: CLen, cs_x?: ChunkState): CDist {
    const posSlot = this.#RangeDec.decodeBitTreeSync(
      this.#posSlotDecoder[getLenToPosState(len_x, cs_x?.posSlotDecoder)],
      cs_x?.posSlotDecoder,
    );
    if (posSlot < 4) return posSlot;

    const numDirectBits: uint8 = (posSlot >> 1) - 1;
    let dist: CDist = (2 | (posSlot & 1)) << numDirectBits;
    if (posSlot < kEndPosModelIndex) {
      dist += this.#RangeDec.decodeReverseBitsSync(
        this.#PosDecoders,
        numDirectBits,
        cs_x?.PosDecoders,
        // dist - posSlot - 1,
        dist - posSlot,
      );
    } else {
      dist +=
        this.#RangeDec.decodeDirectBitsSync(numDirectBits - kNumAlignBits) <<
        kNumAlignBits;
      dist += this.#RangeDec.decodeReverseBitsSync(
        this.#AlignDecoder.Probs,
        this.#AlignDecoder.NumBits,
        cs_x?.AlignDecoder,
      );
    }
    return dist;
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
        this.#PosDecoders,
        numDirectBits,
        // dist - posSlot - 1,
        dist - posSlot,
      );
    } else {
      dist +=
        await this.#RangeDec.decodeDirectBits(numDirectBits - kNumAlignBits) <<
        kNumAlignBits;
      dist += await this.#RangeDec.decodeReverseBits(
        this.#AlignDecoder.Probs,
        this.#AlignDecoder.NumBits,
      );
    }
    return dist;
  }

  /**
   * @headconst @param cs_x
   * @throw {@linkcode NoInput}
   */
  codeOneChunkSync(cs_x?: ChunkState): DecodeChunkR {
    if (cs_x) this.#saveState(cs_x);

    const posState: CState = this.#nowPos48 & this.#posStateMask;

    /* LITERAL symbol */ if (
      this.#RangeDec.decodeBitSync(
        this.#isMatch,
        (this.#state << kNumPosBitsMax) + posState,
        cs_x?.isMatch,
      ) === 0
    ) {
      this.#decodeLiteralSync(cs_x?.litCoders);
      this.#nowPos48++;
    } else {
      let len: CLen;

      /* Rep Match */ if (
        this.#RangeDec
          .decodeBitSync(this.#isRep, this.#state, cs_x?.isRep) === 1
      ) {
        len = 0;
        if (
          this.#RangeDec.decodeBitSync(
            this.#IsRepG0,
            this.#state,
            cs_x?.IsRepG0,
          ) === 0
        ) {
          if (
            this.#RangeDec.decodeBitSync(
              this.#IsRep0Long,
              (this.#state << kNumPosBitsMax) + posState,
              cs_x?.IsRep0Long,
            ) === 0
          ) {
            this.#state = UpdateState_ShortRep(this.#state);
            len = 1;
          }
        } else {
          let distance: CDist;
          if (
            this.#RangeDec.decodeBitSync(
              this.#IsRepG1,
              this.#state,
              cs_x?.IsRepG1,
            ) === 0
          ) {
            distance = this.#rep1;
          } else {
            if (
              this.#RangeDec.decodeBitSync(
                this.#IsRepG2,
                this.#state,
                cs_x?.IsRepG2,
              ) === 0
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
          len = kMatchMinLen + this.#replendec
            .decodeSync(posState, this.#RangeDec, cs_x?.replendec);
          this.#state = UpdateState_Rep(this.#state);
        }
      } /* Simple Match */ else {
        this.#rep3 = this.#rep2;
        this.#rep2 = this.#rep1;
        this.#rep1 = this.#rep0;
        len = this.#lendec.decodeSync(posState, this.#RangeDec, cs_x?.lendec);
        this.#state = UpdateState_Match(this.#state);
        this.#rep0 = this.DecodeDistanceSync(len, cs_x);
        if (this.#rep0 < 0) {
          return this.#rep0 === -1 ? DecodeChunkR.end : DecodeChunkR.err;
        }
        len += kMatchMinLen;
      }

      if (this.#rep0 >= this.#nowPos48 || this.#rep0 >= this.#dictSizeCheck) {
        // console.log(
        //   `%crun here: #rep0: ${this.#rep0}, #nowPos48: ${this.#nowPos48}`,
        //   `color:red`,
        // );
        return DecodeChunkR.err;
      }

      this.OutWindow.CopyBlock(this.#rep0, len);
      this.#nowPos48 += len;
      this.#prevByte = this.OutWindow.GetByte(0);
    }

    return DecodeChunkR.suc;
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
        if (await this.#RangeDec.decodeBit(this.#IsRepG0, this.#state) === 0) {
          if (
            await this.#RangeDec.decodeBit(
              this.#IsRep0Long,
              (this.#state << kNumPosBitsMax) + posState,
            ) === 0
          ) {
            this.#state = UpdateState_ShortRep(this.#state);
            len = 1;
          }
        } else {
          let distance: CDist;
          if (
            await this.#RangeDec.decodeBit(this.#IsRepG1, this.#state) === 0
          ) {
            distance = this.#rep1;
          } else {
            if (
              await this.#RangeDec.decodeBit(this.#IsRepG2, this.#state) === 0
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
          len = kMatchMinLen +
            await this.#replendec.decode(posState, this.#RangeDec);
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
