/** 80**************************************************************************
 * Ref. [[lzma1]/src/decoder.ts](https://github.com/xseman/lzma1/blob/master/src/decoder.ts)
 *    * Refactor heavily
 *
 * @module lib/7z/lzma/LzmaDecoder
 * @license MIT
 ******************************************************************************/

import type { uint, uint8 } from "@fe-lib/alias.ts";
import "@fe-lib/jslang.ts";
import type { CLen, CProb, CState, DictSize } from "./alias.ts";
import {
  DecodeChunkR,
  kEndPosModelIndex,
  kMatchMinLen,
  kNumAlignBits,
  kNumLenToPosStates,
  kNumPosBitsMax,
  kNumStates,
  LZMA_DIC_MIN,
  MATCH_DECODERS_SIZE,
  POS_CODERS_SIZE,
} from "./alias.ts";
import { LenDecoder } from "./LenDecoder.ts";
import { LitDecoder } from "./LitCoder.ts";
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
  readonly RangeDec = new RangeDecoder();
  readonly OutWindow = new LzOutWindow();

  rep0: DictSize = 0;
  rep1: DictSize = 0;
  rep2: DictSize = 0;
  rep3: DictSize = 0;
  #state: CState = 0;

  outSize = 0;
  nowPos48 = 0;
  prevByte: uint8 = 0;

  /* Decoder configuration */
  /** `(1 << pb) - 1` */
  posStateMask: uint8 = 0;
  dictSizeCheck: DictSize = 0;
  /* ~ */

  /* match distance */
  readonly #posSlotDecoder = Array.from(
    { length: kNumLenToPosStates },
    () => new BitTree(6),
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

  Init(): void {
    this.RangeDec.Init();
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

    this.posStateMask = (1 << pb) - 1;

    /* Calculate dictionary size from `properties_x[1-4]` */
    let dictSize: DictSize = 0;
    for (let i = 0; i < 4; i++) {
      /* Treat bytes as unsigned (0-255) instead of signed (-128 to 127) */
      const unsignedByte = properties_x[1 + i] & 0xFF;
      dictSize += unsignedByte << (i * 8);
    }

    this.dictSizeCheck = Math.max(dictSize, 1);

    this.OutWindow.Create(Math.max(dictSize, LZMA_DIC_MIN));

    this.#litdec.Create({ lc, lp });

    this.#lendec.Create(1 << pb);
    this.#replendec.Create(1 << pb);

    return true;
  }

  /** @headconst @param bitTree_x */
  BitTreeDecode(bitTree_x: BitTree): uint8 {
    let m_ = 1;
    for (let i = bitTree_x.NumBits; i--;) {
      m_ = (m_ << 1) + this.RangeDec.DecodeBit(bitTree_x.Probs, m_);
    }
    return m_ - (1 << bitTree_x.NumBits);
  }

  /**
   * @headconst @param probs_x
   * @const @param numBits_x
   * @const @param startIndex_x
   */
  BitTreeReverseDecode(
    probs_x: CProb[],
    numBits_x: uint8,
    startIndex_x: uint = 0,
  ): uint8 {
    let m_ = 1;
    let symbol = 0;
    for (let i = 0; i < numBits_x; ++i) {
      const bit = this.RangeDec.DecodeBit(probs_x, startIndex_x + m_);
      m_ = m_ << 1 | bit;
      symbol |= bit << i;
    }
    return symbol;
  }

  DecodeLiteral(): void {
    let symbol = 1;
    const coder = this.#litdec.getSubCoder(this.nowPos48, this.prevByte);

    if (this.#state >= 7) {
      let matchByte = this.OutWindow.GetByte(this.rep0);
      do {
        const matchBit = (matchByte >> 7) & 1;
        matchByte <<= 1;
        const bit = this.RangeDec.DecodeBit(
          coder.decoders,
          ((1 + matchBit) << 8) + symbol,
        );
        symbol = symbol << 1 | bit;
        if (matchBit !== bit) break;
      } while (symbol < 0x100);
    }
    while (symbol < 0x100) {
      symbol = symbol << 1 | this.RangeDec.DecodeBit(coder.decoders, symbol);
    }
    this.prevByte = symbol & 0xff;
    this.OutWindow.PutByte(this.prevByte);
  }

  /**
   * @borrow @headconst @param decoder_x
   * @const @param posState_x
   */
  DecodeLen(decoder_x: LenDecoder, posState_x: CState): CLen {
    const len: CLen = this.RangeDec.DecodeBit(decoder_x.choice, 0) === 0
      ? this.BitTreeDecode(decoder_x.LowCoder[posState_x])
      : this.RangeDec.DecodeBit(decoder_x.choice, 1) === 0
      ? 8 + this.BitTreeDecode(decoder_x.MidCoder[posState_x])
      : 16 + this.BitTreeDecode(decoder_x.HighCoder);
    return len;
  }

  /** @const @param len_x */
  DecodeDistance(len_x: CLen): DictSize {
    const posSlot: uint8 = this.BitTreeDecode(
      this.#posSlotDecoder[getLenToPosState(len_x)],
    );
    if (posSlot < 4) return posSlot;

    const numDirectBits: uint8 = (posSlot >> 1) - 1;
    let dist: DictSize = (2 | (posSlot & 1)) << numDirectBits;
    if (posSlot < kEndPosModelIndex) {
      dist += this.BitTreeReverseDecode(
        this.PosDecoders,
        numDirectBits,
        // dist - posSlot - 1,
        dist - posSlot,
      );
    } else {
      dist += this.RangeDec.DecodeDirectBits(numDirectBits - kNumAlignBits) <<
        kNumAlignBits;
      dist += this.BitTreeReverseDecode(
        this.AlignDecoder.Probs,
        this.AlignDecoder.NumBits,
      );
    }
    return dist;
  }

  codeOneChunk(): DecodeChunkR {
    const posState: CState = this.nowPos48 & this.posStateMask;

    /* LITERAL symbol */ if (
      this.RangeDec.DecodeBit(
        this.#isMatch,
        (this.#state << kNumPosBitsMax) + posState,
      ) === 0
    ) {
      this.DecodeLiteral();
      this.#state = UpdateState_Literal(this.#state);
      this.nowPos48++;
    } else {
      let len: CLen;

      /* Rep Match */ if (
        this.RangeDec.DecodeBit(this.#isRep, this.#state) === 1
      ) {
        len = 0;
        if (this.RangeDec.DecodeBit(this.IsRepG0, this.#state) === 0) {
          if (
            this.RangeDec.DecodeBit(
              this.IsRep0Long,
              (this.#state << kNumPosBitsMax) + posState,
            ) === 0
          ) {
            this.#state = UpdateState_ShortRep(this.#state);
            len = 1;
          }
        } else {
          let distance: DictSize;
          if (this.RangeDec.DecodeBit(this.IsRepG1, this.#state) === 0) {
            distance = this.rep1;
          } else {
            if (this.RangeDec.DecodeBit(this.IsRepG2, this.#state) === 0) {
              distance = this.rep2;
            } else {
              distance = this.rep3;
              this.rep3 = this.rep2;
            }
            this.rep2 = this.rep1;
          }
          this.rep1 = this.rep0;
          this.rep0 = distance;
        }

        if (len === 0) {
          len = this.DecodeLen(this.#replendec, posState) + kMatchMinLen;
          this.#state = UpdateState_Rep(this.#state);
        }
      } /* Simple Match */ else {
        this.rep3 = this.rep2;
        this.rep2 = this.rep1;
        this.rep1 = this.rep0;
        len = this.DecodeLen(this.#lendec, posState);
        this.#state = UpdateState_Match(this.#state);
        this.rep0 = this.DecodeDistance(len);
        if (this.rep0 < 0) {
          return this.rep0 === -1 ? DecodeChunkR.end : DecodeChunkR.err;
        }
        len += kMatchMinLen;
      }

      if (this.rep0 >= this.nowPos48 || this.rep0 >= this.dictSizeCheck) {
        return DecodeChunkR.err;
      }

      this.OutWindow.CopyBlock(this.rep0, len);
      this.nowPos48 += len;
      this.prevByte = this.OutWindow.GetByte(0);
    }

    return DecodeChunkR.suc;
  }

  /** Cleanup decoder resources */
  cleanup(): void {
    this.OutWindow.stream = null;
    this.RangeDec.stream = null;
  }
}
/*80--------------------------------------------------------------------------*/
