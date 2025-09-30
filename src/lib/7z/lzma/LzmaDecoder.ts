/** 80**************************************************************************
 * Ref. [[lzma1]/src/decoder.ts](https://github.com/xseman/lzma1/blob/master/src/decoder.ts)
 *    * Refactor heavily
 *
 * @module lib/7z/lzma/LzmaDecoder
 * @license MIT
 ******************************************************************************/

import type { uint, uint16, uint32, uint8 } from "@fe-lib/alias.ts";
import "@fe-lib/jslang.ts";
import type { CProb, State } from "./alias.ts";
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
import { LitDecoder } from "./LitDecoder.ts";
import { LzOutWindow } from "./LzOutWindow.ts";
import { RangeDecoder } from "./RangeDecoder.ts";
import {
  CBitTreeDecoder,
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

  rep0: uint32 = 0;
  rep1: uint32 = 0;
  rep2: uint32 = 0;
  rep3: uint32 = 0;
  state = 0 as State;

  outSize = 0;
  nowPos48 = 0;
  prevByte: uint8 = 0;

  /* Decoder configuration */
  /** `(1 << pb) - 1` */
  posStateMask: uint8 = 0;
  dictSizeCheck: uint32 = 0;
  /* ~ */

  /* match distance */
  readonly PosSlotDecoder = Array.from(
    { length: kNumLenToPosStates },
    () => new CBitTreeDecoder(6),
  );
  readonly AlignDecoder = new CBitTreeDecoder(kNumAlignBits);
  readonly PosDecoders = Array.mock<CProb>(POS_CODERS_SIZE);

  InitDist() {
    for (let i = 0; i < kNumLenToPosStates; ++i) {
      this.PosSlotDecoder[i].Init();
    }
    this.AlignDecoder.Init();
    initProbs(this.PosDecoders);
  }
  /* ~ */

  /* Probability models for different symbols */
  readonly IsMatch = Array.mock<CProb>(MATCH_DECODERS_SIZE);
  readonly IsRep = Array.mock<CProb>(kNumStates);
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

    initProbs(this.IsMatch);
    initProbs(this.IsRep);
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
    let dictSize: uint32 = 0;
    for (let i = 0; i < 4; i++) {
      /* Treat bytes as unsigned (0-255) instead of signed (-128 to 127) */
      const unsignedByte = properties_x[1 + i] & 0xFF;
      dictSize += unsignedByte << (i * 8);
    }

    this.dictSizeCheck = Math.max(dictSize, 1);

    this.OutWindow.Create(Math.max(dictSize, LZMA_DIC_MIN));

    this.#litdec.Create({
      numPrevBits: lc,
      numPosBits: lp,
      posMask: (1 << lp) - 1,
    });

    this.#lendec.Create(1 << pb);
    this.#replendec.Create(1 << pb);

    return true;
  }

  /** @headconst @param bitTree_x */
  BitTreeDecode(bitTree_x: CBitTreeDecoder): uint16 {
    let m_ = 1;
    for (let i = bitTree_x.NumBits; i--;) {
      m_ = (m_ << 1) + this.RangeDec.DecodeBit(bitTree_x.Probs, m_);
    }
    return (m_ - (1 << bitTree_x.NumBits)) as uint16;
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
  ): uint16 {
    let m_ = 1;
    let symbol = 0;
    for (let i = 0; i < numBits_x; ++i) {
      const bit = this.RangeDec.DecodeBit(probs_x, startIndex_x + m_);
      m_ <<= 1;
      m_ += bit;
      symbol |= bit << i;
    }
    return symbol as uint16;
  }

  DecodeLiteral() {
    let symbol = 1;
    const litState = ((this.nowPos48 & this.#litdec.posMask) <<
      this.#litdec.numPrevBits) +
      ((this.prevByte & 0xFF) >>> (8 - this.#litdec.numPrevBits));
    const coder = this.#litdec.coders[litState];

    if (this.state >= 7) {
      let matchByte = this.OutWindow.GetByte(this.rep0);
      do {
        const matchBit = (matchByte >> 7) & 1;
        matchByte <<= 1;
        const bit = this.RangeDec.DecodeBit(
          coder.decoders,
          ((1 + matchBit) << 8) + symbol,
        );
        symbol = symbol << 1 | bit;
        if (matchBit != bit) break;
      } while (symbol < 0x100);
    }
    while (symbol < 0x100) {
      symbol = symbol << 1 |
        this.RangeDec.DecodeBit(coder.decoders, symbol);
    }
    this.prevByte = symbol & 0xff;
    this.OutWindow.PutByte(this.prevByte);
  }

  /**
   * @borrow @headconst @param decoder
   * @const @param posState
   */
  DecodeLen(decoder: LenDecoder, posState: State): uint16 {
    const len = this.RangeDec.DecodeBit(decoder.choice, 0) === 0
      ? this.BitTreeDecode(decoder.LowCoder[posState])
      : this.RangeDec.DecodeBit(decoder.choice, 1) === 0
      ? 8 + this.BitTreeDecode(decoder.MidCoder[posState])
      : 16 + this.BitTreeDecode(decoder.HighCoder);
    return len as uint16;
  }

  /** @const @param len_x */
  DecodeDistance(len_x: uint16): uint32 {
    const posSlot: uint8 = this.BitTreeDecode(
      this.PosSlotDecoder[getLenToPosState(len_x)],
    );
    if (posSlot < 4) return posSlot;

    const numDirectBits: uint8 = (posSlot >> 1) - 1;
    let dist: uint32 = (2 | (posSlot & 1)) << numDirectBits;
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
    const posState = (this.nowPos48 & this.posStateMask) as State;
    const state2 = (this.state << kNumPosBitsMax) + posState;

    if (this.RangeDec.DecodeBit(this.IsMatch, state2) === 0) {
      this.DecodeLiteral();
      this.state = UpdateState_Literal(this.state);
      this.nowPos48++;
    } else {
      let len: uint;

      if (this.RangeDec.DecodeBit(this.IsRep, this.state)) {
        len = 0;
        if (this.RangeDec.DecodeBit(this.IsRepG0, this.state) === 0) {
          if (this.RangeDec.DecodeBit(this.IsRep0Long, state2) === 0) {
            this.state = UpdateState_ShortRep(this.state);
            len = 1;
          }
        } else {
          let distance: uint32;
          if (this.RangeDec.DecodeBit(this.IsRepG1, this.state) === 0) {
            distance = this.rep1;
          } else {
            if (this.RangeDec.DecodeBit(this.IsRepG2, this.state) === 0) {
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
          len = this.DecodeLen(this.#replendec, posState) +
            kMatchMinLen;
          this.state = UpdateState_Rep(this.state);
        }
      } else {
        this.rep3 = this.rep2;
        this.rep2 = this.rep1;
        this.rep1 = this.rep0;
        len = this.DecodeLen(this.#lendec, posState);
        this.state = UpdateState_Match(this.state);
        this.rep0 = this.DecodeDistance(len as uint16);
        if (this.rep0 < 0) {
          if (this.rep0 == -1) {
            return DecodeChunkR.end;
          }
          return DecodeChunkR.err;
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
