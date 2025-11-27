/** 80**************************************************************************
 * Ref. [[lzma1]/src/encoder.ts](https://github.com/xseman/lzma1/blob/master/src/encoder.ts)
 *    * Refactor heavily
 *
 * @module lib/7z/lzma/LzmaEncoder
 * @license MIT
 ******************************************************************************/

import type { int, uint, uint32, uint8 } from "../../alias.ts";
import "@fe-lib/jslang.ts";
import { writeUint8m } from "../util.ts";
import type { CDist, CLen, CProb, CProbPrice, CState, Mode } from "./alias.ts";
import {
  INFINITY_PRICE,
  kAlignTableSize,
  kMatchMaxLen,
  kMatchMinLen,
  kNumAlignBits,
  kNumLenToPosStates,
  kNumOpts,
  kNumPosBitsMax,
  kNumPosSlotBits,
  kNumStates,
  LZMA_DIC_MIN,
  MATCH_DECODERS_SIZE,
  POS_CODERS_SIZE,
} from "./alias.ts";
import { LenEncoder } from "./LenCoder.ts";
import { LitEncoder } from "./LitCoder.ts";
import type { LzmaEncodeStream } from "./LzmaEncodeStream.ts";
import { MatchFinder } from "./MatchFinder.ts";
import { RangeEncoder } from "./RangeEncoder.ts";
import {
  BitTree,
  G_FAST_POS,
  getBitPrice,
  getLenToPosState,
  getPosSlot,
  initProbs,
  reverseGetPrice,
  UpdateState_Literal,
  UpdateState_Match,
  UpdateState_Rep,
  UpdateState_ShortRep,
} from "./util.ts";
/*80--------------------------------------------------------------------------*/

const bitTreePriceCache = new Map<string, CProbPrice>();

/**
 * Get price for bit tree encoding with caching
 * @const @param bitTree_x
 * @const @param symbol_x
 */
function getBitTreePrice(bitTree_x: BitTree, symbol_x: uint8): CProbPrice {
  const cacheKey = `${bitTree_x.NumBits}-${symbol_x}`;
  if (bitTreePriceCache.has(cacheKey)) {
    return bitTreePriceCache.get(cacheKey)!;
  }

  let price: CProbPrice = 0;
  let modelIndex = 1;

  for (let bitIndex = bitTree_x.NumBits; bitIndex > 0; bitIndex--) {
    const bit = ((symbol_x >>> (bitIndex - 1)) & 1) as 0 | 1;
    price += getBitPrice(bitTree_x.Probs[modelIndex], bit);
    modelIndex = (modelIndex << 1) + bit;
  }

  if (bitTreePriceCache.size < 10_000) {
    bitTreePriceCache.set(cacheKey, price);
  }

  return price;
}

type RepIndex_ = 0 | 1 | 2 | 3;

class Optimum_ {
  state?: CState;
  price?: CProbPrice;

  posPrev?: CLen;
  backPrev?: CDist | RepIndex_ | -1;
  prev1IsChar?: boolean;

  MakeAsChar(): void {
    this.backPrev = -1;
    this.prev1IsChar = false;
  }

  MakeAsShortRep(): void {
    this.backPrev = 0;
    this.prev1IsChar = false;
  }

  prev2?: boolean;
  posPrev2?: CLen;
  backPrev2?: CDist | RepIndex_;

  backs0?: CDist;
  backs1?: CDist;
  backs2?: CDist;
  backs3?: CDist;
}

/** LZMA Encoder class that handles compression operations */
export class LzmaEncoder {
  /* Core state properties */
  #state: CState = 0;
  #prevByte: uint8 = 0;
  /**
   * @example // 3229
   *    42 = 21 * 2
   * @example // 3230
   *    32 = 16 * 2
   */
  #distTableSize: uint8 = 0;
  #longestMatchFound = false;
  #optimumEndIndex: uint = 0;
  #optimumCurIndex: uint = 0;
  /** correct `#pos` to the first not encoded position  */
  #extraPos48: int = 0;
  /* ~ */

  /* Dictionary and match finding */
  /**
   * @example // 3229
   *    0x20_0000
   * @example // 3230
   *    0x1_0000
   */
  #dictSize: CDist = 0;
  readonly #matchFinder = new MatchFinder();
  #numFastBytes: uint8 = 0;
  /* ~ */

  /* Literal encoding configuration */
  /** number of literal context bits */
  #lc: uint8 = 0;
  /** number of literal position state bits */
  #lp: uint8 = 0;
  /** position state bits */
  #pb: uint8 = 0;
  readonly #posStateMask = 3;
  /* ~ */

  /* Stream and processing state */
  #inStream: LzmaEncodeStream | null = null;
  set inStream(_x: LzmaEncodeStream) {
    this.#inStream = _x;
  }
  #blockFinished = false;
  #nowPos48: uint = 0;
  /* ~ */

  /* Distance and repetition arrays */
  readonly #repDistances = Array.sparse<CDist>(4).fill(0);
  readonly #optimum: Optimum_[] = [];
  /* ~ */

  readonly #RangeEnc = new RangeEncoder();
  set outStream(_x: LzmaEncodeStream) {
    this.#RangeEnc.outStream = _x;
  }

  /* Bit model arrays for different types of encoding decisions */
  readonly #isMatch = Array.sparse<CProb>(MATCH_DECODERS_SIZE);
  readonly #isRep = Array.sparse<CProb>(kNumStates);
  readonly #isRepG0 = Array.sparse<CProb>(kNumStates);
  readonly #isRepG1 = Array.sparse<CProb>(kNumStates);
  readonly #isRepG2 = Array.sparse<CProb>(kNumStates);
  readonly #isRep0Long = Array.sparse<CProb>(MATCH_DECODERS_SIZE);
  /* ~ */

  /* Position and alignment encoders */
  readonly #posSlotEncoder = Array.from(
    { length: kNumLenToPosStates },
    () => new BitTree(kNumPosSlotBits),
  );
  readonly #posAlignEncoder = new BitTree(kNumAlignBits);
  readonly #posEncoders = Array.sparse<CProb>(POS_CODERS_SIZE);

  InitDist() {
    for (let i = 0; i < kNumLenToPosStates; ++i) {
      this.#posSlotEncoder[i].Init();
    }
    this.#posAlignEncoder.Init();
    initProbs(this.#posEncoders);
  }
  /* ~ */

  readonly #lenenc = new LenEncoder();
  readonly #replenenc = new LenEncoder();

  readonly #litenc = new LitEncoder();

  /** `length < 256` */
  readonly #posSlotPrices: CProbPrice[] = [];
  /** `length < 512` */
  readonly #distancesPrices: CProbPrice[] = [];
  readonly #alignPrices = Array.sparse<CProbPrice>(kAlignTableSize);
  #matchPriceCount: uint8 = 0;
  #alignPriceCount: uint8 = 0;
  /* ~ */

  /* Optimization arrays */
  readonly #reps = Array.sparse<CDist>(4);
  readonly #repLens = Array.sparse<CLen>(4);
  /* ~ */

  /* Processing counters */
  #processedInSize: uint = 0;
  get processedInSize() {
    return this.#processedInSize;
  }

  finished = false;
  readonly properties = Array.sparse<uint8>(5);
  readonly #tempPrices = Array.sparse<CProbPrice>(128);
  /* ~ */

  /* Match finding properties */
  #longestMatchLen: CLen = 0;
  #matchFinderType = true;
  /** Assigned by {@linkcode #matchFinder.GetMatches()} */
  #numDistPairs: uint = 0;
  #backRes: uint32 | -1 = 0;
  /* ~ */

  Init(): void {
    // for (let i = 0; i < 0x1000; i++) {
    for (let i = kNumOpts; i--;) {
      this.#optimum[i] = new Optimum_();
    }

    //jjjj TOCLEANUP
    // this.#RangeEnc.Init();

    this.#litenc.Init();
    this.InitDist();

    initProbs(this.#isMatch);
    initProbs(this.#isRep);
    initProbs(this.#isRepG0);
    initProbs(this.#isRepG1);
    initProbs(this.#isRepG2);
    initProbs(this.#isRep0Long);

    this.#lenenc.Init();
    this.#replenenc.Init();
  }

  Create_2(): void {
    this.#matchFinder.Create(
      this.#matchFinderType ? 4 : 2,
      this.#dictSize,
      this.#numFastBytes,
    );
  }

  Init_2() {
    this.#fillDistancesPrices();
    this.#fillAlignPrices();

    this.#lenenc.Init_2(this.#numFastBytes + 1 - 2);
    this.#replenenc.Init_2(this.#numFastBytes + 1 - 2);
  }
  /*64||||||||||||||||||||||||||||||||||||||||||||||||||||||||||*/

  setEncoderProperties() {
    this.properties[0] = ((this.#pb * 5 + this.#lp) * 9 + this.#lc) & 0xFF;

    /* Next 4 bytes store dictionary size in little-endian format */
    writeUint8m(this.#dictSize, 4, this.properties, 1);

    this.#litenc.Create({ lc: this.#lc, lp: this.#lp });

    this.#lenenc.Create(1 << this.#pb);
    this.#replenenc.Create(1 << this.#pb);
  }

  /** Configure encoder settings */
  configure(mode: Mode): void {
    this.setDictSize(1 << mode.searchDepth);
    this.#numFastBytes = mode.filterStrength;
    this.#matchFinderType = mode.matchFinderType;

    this.#lc = 3;
    this.#lp = 0;
    this.#pb = 2;
  }

  /** @const @param dictSize_x */
  setDictSize(dictSize_x: CDist): void {
    this.#dictSize = dictSize_x;

    let dicLogSize = 0;
    for (; dictSize_x > (1 << dicLogSize); ++dicLogSize);
    this.#distTableSize = dicLogSize * 2;
  }

  /** @const @param posState_x */
  #writeEndMarker(posState_x: uint8): void {
    const re_ = this.#RangeEnc;

    re_.encodeBit(
      this.#isMatch,
      (this.#state << kNumPosBitsMax) + posState_x,
      1,
    );

    re_.encodeBit(this.#isRep, this.#state, 0);

    this.#state = UpdateState_Match(this.#state);
    this.#lenenc.encode(0, posState_x, re_);

    const posSlot = 63;
    const lenToPosState = 0;
    re_.encodeBitTree(this.#posSlotEncoder[lenToPosState], posSlot);
    re_.encodeDirectBits(0x3ff_ffff, 26);
    re_.encodeReverseBits(
      this.#posAlignEncoder.Probs,
      this.#posAlignEncoder.NumBits,
      0xF,
    );
  }

  /**
   * Fill alignment prices for position alignment encoder
   *
   * Modify
   *    - `#alignPrices[i]`, `#alignPriceCount`
   */
  #fillAlignPrices(): void {
    for (let i = kAlignTableSize; i--;) {
      this.#alignPrices[i] = reverseGetPrice(
        this.#posAlignEncoder.Probs,
        this.#posAlignEncoder.NumBits,
        i,
      );
    }
    this.#alignPriceCount = 0;
  }

  /**
   * Fill distance prices for position encoders
   *
   * Modify
   *    - `#tempPrices[i]`, `#posSlotPrices[i]`, `#distancesPrices[i]`,
   *      `#matchPriceCount`
   */
  #fillDistancesPrices(): void {
    for (let i = 4; i < 128; ++i) {
      const posSlot = getPosSlot(i);
      const footerBits = (posSlot >> 1) - 1;
      const baseVal = (2 | (posSlot & 1)) << footerBits;

      this.#tempPrices[i] = reverseGetPrice(
        this.#posEncoders,
        footerBits,
        i - baseVal,
        // baseVal - posSlot - 1,
        baseVal - posSlot,
      );
    }

    for (
      let lenToPosState = 0;
      lenToPosState < kNumLenToPosStates;
      ++lenToPosState
    ) {
      const bitTreeEncoder = this.#posSlotEncoder[lenToPosState];
      const st = lenToPosState << 6;

      for (let posSlot = 0; posSlot < this.#distTableSize; posSlot += 1) {
        this.#posSlotPrices[st + posSlot] = getBitTreePrice(
          bitTreeEncoder,
          posSlot,
        );
      }
      for (let posSlot = 14; posSlot < this.#distTableSize; posSlot += 1) {
        this.#posSlotPrices[st + posSlot] += ((posSlot >> 1) - 1) - 4 << 6;
      }

      const st2 = lenToPosState << 7;
      for (let i = 0; i < 4; ++i) {
        this.#distancesPrices[st2 + i] = this.#posSlotPrices[st + i];
      }
      for (let i = 4; i < 128; ++i) {
        this.#distancesPrices[st2 + i] =
          this.#posSlotPrices[st + getPosSlot(i)] + this.#tempPrices[i];
      }
    }

    this.#matchPriceCount = 0;
  }
  /*64||||||||||||||||||||||||||||||||||||||||||||||||||||||||||*/

  /**
   * Modify
   *    - `#reps[i]`, `#repLens[i]`
   */
  #updateReps(): RepIndex_ {
    let repMaxIndex = 0;
    for (let i = 0; i < 4; ++i) {
      this.#reps[i] = this.#repDistances[i];
      this.#repLens[i] = this.#matchFinder
        .getMatchLen(-1, this.#reps[i], kMatchMaxLen);

      if (this.#repLens[i] > this.#repLens[repMaxIndex]) {
        repMaxIndex = i;
      }
    }
    return repMaxIndex as RepIndex_;
  }

  /** @param cur_x */
  #Backward(cur_x: uint): uint {
    this.#optimumEndIndex = cur_x;
    let posMem = this.#optimum[cur_x].posPrev;
    let backMem = this.#optimum[cur_x].backPrev;

    do {
      if (this.#optimum[cur_x].prev1IsChar) {
        this.#optimum[posMem!].MakeAsChar();
        this.#optimum[posMem!].posPrev = posMem! - 1;

        if (this.#optimum[cur_x].prev2) {
          this.#optimum[posMem! - 1].prev1IsChar = false;
          this.#optimum[posMem! - 1].posPrev = this.#optimum[cur_x].posPrev2!;
          this.#optimum[posMem! - 1].backPrev = this.#optimum[cur_x].backPrev2!;
        }
      }

      const posPrev = posMem!;
      const backCur = backMem!;
      posMem = this.#optimum[posPrev].posPrev;
      backMem = this.#optimum[posPrev].backPrev;
      this.#optimum[posPrev].posPrev = cur_x;
      this.#optimum[posPrev].backPrev = backCur;
      cur_x = posPrev;
    } while (cur_x > 0);

    this.#backRes = this.#optimum[0].backPrev!;
    this.#optimumCurIndex = this.#optimum[0].posPrev!;

    return this.#optimumCurIndex;
  }

  /** @const @param pos_x */
  async #GetOptimum(pos_x: uint): Promise<CLen> {
    const mf_ = this.#matchFinder;
    const md_ = mf_.matchDistances;

    if (this.#optimumEndIndex !== this.#optimumCurIndex) {
      const lenRes = this.#optimum[this.#optimumCurIndex].posPrev! -
        this.#optimumCurIndex;
      this.#backRes = this.#optimum[this.#optimumCurIndex].backPrev!;
      this.#optimumCurIndex = this.#optimum[this.#optimumCurIndex].posPrev!;
      return lenRes;
    }
    this.#optimumCurIndex = this.#optimumEndIndex = 0;

    let lenMain: CLen;
    if (this.#longestMatchFound) {
      lenMain = this.#longestMatchLen;
      this.#longestMatchFound = false;
    } else {
      lenMain = await this.#ReadMatchDistances();
    }

    const numDistPairs = this.#numDistPairs;
    const numAvailBytes = mf_.numAvailBytes + 1;

    if (numAvailBytes < 2) {
      this.#backRes = -1;
      return 1;
    }

    //jjjj TOCLEANUP
    // if (numAvailBytes > kMatchMaxLen) {
    //   numAvailBytes = kMatchMaxLen;
    // }

    const repMaxIndex = this.#updateReps();
    if (this.#repLens[repMaxIndex] >= this.#numFastBytes) {
      this.#backRes = repMaxIndex;
      const lenRes: CLen = this.#repLens[repMaxIndex];
      await this.#MovePos(lenRes - 1);
      return lenRes;
    }

    if (lenMain >= this.#numFastBytes) {
      this.#backRes = md_[numDistPairs - 1] + 4;
      await this.#MovePos(lenMain - 1);
      return lenMain;
    }

    const curByte = mf_.getIndexByte(-1);
    const matchByte = mf_.getIndexByte(-1 - (this.#repDistances[0] + 1));

    if (
      lenMain < 2 && curByte !== matchByte && this.#repLens[repMaxIndex] < 2
    ) {
      this.#backRes = -1;
      return 1;
    }

    this.#optimum[0].state = this.#state;
    const posState: CState = pos_x & this.#posStateMask;
    const state2 = (this.#state << kNumPosBitsMax) + posState;
    this.#optimum[1].price = getBitPrice(this.#isMatch[state2], 0) +
      this.#litenc.getSubCoder(pos_x, this.#prevByte)
        .getPrice(this.#state >= 7, matchByte, curByte);
    this.#optimum[1].MakeAsChar();

    const matchPrice: CProbPrice = getBitPrice(this.#isMatch[state2], 1);
    const repMatchPrice: CProbPrice = matchPrice +
      getBitPrice(this.#isRep[this.#state], 1);

    if (matchByte === curByte) {
      const shortRepPrice = repMatchPrice + this.#GetRepLen1Price(posState);
      if (shortRepPrice < this.#optimum[1].price!) {
        this.#optimum[1].price = shortRepPrice;
        this.#optimum[1].MakeAsShortRep();
      }
    }

    let lenEnd: CLen = Math.max(lenMain, this.#repLens[repMaxIndex]);
    if (lenEnd < kMatchMinLen) {
      this.#backRes = this.#optimum[1].backPrev!;
      return 1;
    }

    this.#optimum[1].posPrev = 0;
    this.#optimum[0].backs0 = this.#reps[0];
    this.#optimum[0].backs1 = this.#reps[1];
    this.#optimum[0].backs2 = this.#reps[2];
    this.#optimum[0].backs3 = this.#reps[3];
    let len: CLen = lenEnd;

    do {
      this.#optimum[len].price = INFINITY_PRICE;
      len -= 1;
    } while (len >= kMatchMinLen);

    for (let i = 0; i < 4; ++i) {
      let repLen = this.#repLens[i];
      if (repLen < kMatchMinLen) continue;

      const price_4: CProbPrice = repMatchPrice +
        this.#GetPureRepPrice(i as RepIndex_, this.#state, posState);

      do {
        const curAndLenPrice = price_4 +
          this.#replenenc.getPrice(repLen - kMatchMinLen, posState);
        const optimum = this.#optimum[repLen];
        if (curAndLenPrice < optimum.price!) {
          optimum.price = curAndLenPrice;
          optimum.posPrev = 0;
          optimum.backPrev = i;
          optimum.prev1IsChar = false;
        }
      } while ((repLen -= 1) >= kMatchMinLen);
    }

    let normalMatchPrice: CProbPrice = matchPrice +
      getBitPrice(this.#isRep[this.#state], 0);

    len = Math.max(this.#repLens[0] + 1, kMatchMinLen);
    if (len <= lenMain) {
      let offs = 0;
      while (len > md_[offs]) offs += 2;

      for (;; len += 1) {
        const distance: CDist = md_[offs + 1];
        const curAndLenPrice = normalMatchPrice +
          this.#GetPosLenPrice(distance, len, posState);

        const optimum = this.#optimum[len];
        if (curAndLenPrice < optimum.price!) {
          optimum.price = curAndLenPrice;
          optimum.posPrev = 0;
          optimum.backPrev = distance + 4;
          optimum.prev1IsChar = false;
        }

        if (len === md_[offs]) {
          offs += 2;
          if (offs === numDistPairs) break;
        }
      }
    }

    for (let curLen = 1;; ++curLen) {
      if (curLen === lenEnd) return this.#Backward(curLen);

      let newLen: CLen = await this.#ReadMatchDistances();
      let numDistPairs = this.#numDistPairs;

      if (newLen >= this.#numFastBytes) {
        this.#longestMatchLen = newLen;
        this.#longestMatchFound = true;
        return this.#Backward(curLen);
      }

      pos_x += 1;
      let posPrev = this.#optimum[curLen].posPrev!;

      let state: CState;
      if (this.#optimum[curLen].prev1IsChar) {
        posPrev -= 1;
        if (this.#optimum[curLen].prev2) {
          state = this.#optimum[this.#optimum[curLen].posPrev2!].state!;
          state = this.#optimum[curLen].backPrev2! < 4
            ? UpdateState_Rep(state)
            : UpdateState_Match(state);
        } else {
          state = this.#optimum[posPrev].state!;
        }
        state = UpdateState_Literal(state);
      } else {
        state = this.#optimum[posPrev].state!;
      }

      if (posPrev === curLen - 1) {
        if (!this.#optimum[curLen].backPrev) {
          state = UpdateState_ShortRep(state);
        } else {
          state = UpdateState_Literal(state);
        }
      } else {
        let pos;
        if (this.#optimum[curLen].prev1IsChar && this.#optimum[curLen].prev2) {
          posPrev = this.#optimum[curLen].posPrev2!;
          pos = this.#optimum[curLen].backPrev2;
          state = UpdateState_Rep(state);
        } else {
          pos = this.#optimum[curLen].backPrev;
          if (pos! < 4) {
            state = UpdateState_Rep(state);
          } else {
            state = UpdateState_Match(state);
          }
        }

        const opt = this.#optimum[posPrev];
        if (pos! < 4) {
          if (!pos) {
            this.#reps[0] = opt.backs0!;
            this.#reps[1] = opt.backs1!;
            this.#reps[2] = opt.backs2!;
            this.#reps[3] = opt.backs3!;
          } else if (pos === 1) {
            this.#reps[0] = opt.backs1!;
            this.#reps[1] = opt.backs0!;
            this.#reps[2] = opt.backs2!;
            this.#reps[3] = opt.backs3!;
          } else if (pos === 2) {
            this.#reps[0] = opt.backs2!;
            this.#reps[1] = opt.backs0!;
            this.#reps[2] = opt.backs1!;
            this.#reps[3] = opt.backs3!;
          } else {
            this.#reps[0] = opt.backs3!;
            this.#reps[1] = opt.backs0!;
            this.#reps[2] = opt.backs1!;
            this.#reps[3] = opt.backs2!;
          }
        } else {
          this.#reps[0] = pos! - 4;
          this.#reps[1] = opt.backs0!;
          this.#reps[2] = opt.backs1!;
          this.#reps[3] = opt.backs2!;
        }
      }

      this.#optimum[curLen].state = state;
      this.#optimum[curLen].backs0 = this.#reps[0];
      this.#optimum[curLen].backs1 = this.#reps[1];
      this.#optimum[curLen].backs2 = this.#reps[2];
      this.#optimum[curLen].backs3 = this.#reps[3];
      const curPrice = this.#optimum[curLen].price!;

      const curByte = mf_.getIndexByte(-1);
      const matchByte = mf_.getIndexByte(-1 - (this.#reps[0] + 1));

      const posState = pos_x & this.#posStateMask;
      const state2 = (state << kNumPosBitsMax) + posState;
      const curAnd1Price: CProbPrice = curPrice +
        getBitPrice(this.#isMatch[state2], 0) +
        this.#litenc.getSubCoder(pos_x, mf_.getIndexByte(-2))
          .getPrice(state >= 7, matchByte, curByte);

      const nextOptimum = this.#optimum[curLen + 1];
      let nextIsChar = false;

      if (curAnd1Price < nextOptimum.price!) {
        nextOptimum.price = curAnd1Price;
        nextOptimum.posPrev = curLen;
        nextOptimum.MakeAsChar();
        nextIsChar = true;
      }

      const matchPrice = curPrice + getBitPrice(this.#isMatch[state2], 1);
      const repMatchPrice = matchPrice + getBitPrice(this.#isRep[state], 1);

      if (
        matchByte === curByte &&
        !(nextOptimum.posPrev! < curLen && !nextOptimum.backPrev)
      ) {
        const shortRepPrice: CProbPrice = repMatchPrice +
          getBitPrice(this.#isRepG0[state], 0) +
          getBitPrice(this.#isRep0Long[state2], 0);

        if (shortRepPrice <= nextOptimum.price!) {
          nextOptimum.price = shortRepPrice;
          nextOptimum.posPrev = curLen;
          nextOptimum.MakeAsShortRep();
          nextIsChar = true;
        }
      }

      const numAvailBytesFull = Math.min(
        kNumOpts - curLen - 1,
        mf_.numAvailBytes + 1,
      );

      let numAvailBytes = numAvailBytesFull;
      if (numAvailBytes < 2) continue;
      if (numAvailBytes > this.#numFastBytes) {
        numAvailBytes = this.#numFastBytes;
      }

      if (!nextIsChar && matchByte !== curByte) {
        const t_: CLen = Math.min(numAvailBytesFull - 1, this.#numFastBytes);
        const lenTest2 = mf_.getMatchLen(0, this.#reps[0], t_);
        if (lenTest2 >= 2) {
          const state2 = UpdateState_Literal(state);
          const posStateNext = pos_x + 1 & this.#posStateMask;
          const state22 = (state2 << kNumPosBitsMax) + posStateNext;
          const nextRepMatchPrice = curAnd1Price +
            getBitPrice(this.#isMatch[state22], 1) +
            getBitPrice(this.#isRep[state2], 1);

          const offset = curLen + 1 + lenTest2;
          while (lenEnd < offset) {
            this.#optimum[lenEnd += 1].price = INFINITY_PRICE;
          }

          const price = this.#replenenc.getPrice(lenTest2 - 2, posStateNext);
          const curAndLenPrice = nextRepMatchPrice + price +
            this.#GetPureRepPrice(0, state2, posStateNext);
          const optimum = this.#optimum[offset];
          if (curAndLenPrice < optimum.price!) {
            optimum.price = curAndLenPrice;
            optimum.posPrev = curLen + 1;
            optimum.backPrev = 0;
            optimum.prev1IsChar = true;
            optimum.prev2 = false;
          }
        }
      }

      let startLen = 2;
      for (let repIndex = 0; repIndex < 4; ++repIndex) {
        let lenTest = mf_.getMatchLen(-1, this.#reps[repIndex], numAvailBytes);
        if (lenTest < kMatchMinLen) continue;

        const lenTestTemp = lenTest;

        do {
          while (lenEnd < curLen + lenTest) {
            this.#optimum[lenEnd += 1].price = INFINITY_PRICE;
          }

          const price_0 = this.#replenenc.getPrice(lenTest - 2, posState);
          const curAndLenPrice = repMatchPrice + price_0 +
            this.#GetPureRepPrice(repIndex as RepIndex_, state, posState);
          const optimum = this.#optimum[curLen + lenTest];
          if (curAndLenPrice < optimum.price!) {
            optimum.price = curAndLenPrice;
            optimum.posPrev = curLen;
            optimum.backPrev = repIndex;
            optimum.prev1IsChar = false;
          }
        } while ((lenTest -= 1) >= 2);

        lenTest = lenTestTemp;

        if (!repIndex) {
          startLen = lenTest + 1;
        }

        if (lenTest < numAvailBytesFull) {
          const t_: CLen = Math.min(
            numAvailBytesFull - 1 - lenTest,
            this.#numFastBytes,
          );
          const lenTest2 = mf_.getMatchLen(lenTest, this.#reps[repIndex], t_);
          if (lenTest2 >= 2) {
            let state2 = UpdateState_Rep(state);
            let posStateNext = pos_x + lenTest & this.#posStateMask;
            let state22 = (state2 << kNumPosBitsMax) + posStateNext;

            const price_1: CProbPrice = this.#replenenc
              .getPrice(lenTest - 2, posState);
            const curAndLenCharPrice = repMatchPrice + price_1 +
              this.#GetPureRepPrice(
                repIndex as RepIndex_,
                state,
                posState,
              ) + getBitPrice(this.#isMatch[state22], 0) +
              this.#litenc.getSubCoder(
                pos_x + lenTest,
                mf_.getIndexByte(lenTest - 1 - 1),
              ).getPrice(
                true,
                mf_.getIndexByte(lenTest - 1 - (this.#reps[repIndex] + 1)),
                mf_.getIndexByte(lenTest - 1),
              );

            state2 = UpdateState_Literal(state2);
            posStateNext = pos_x + lenTest + 1 & this.#posStateMask;
            state22 = (state2 << kNumPosBitsMax) + posStateNext;

            const nextMatchPrice = curAndLenCharPrice +
              getBitPrice(this.#isMatch[state22], 1);
            const nextRepMatchPrice = nextMatchPrice +
              getBitPrice(this.#isRep[state2], 1);

            const offset = lenTest + 1 + lenTest2;
            while (lenEnd < curLen + offset) {
              this.#optimum[lenEnd += 1].price = INFINITY_PRICE;
            }

            const price_2: CProbPrice = this.#replenenc
              .getPrice(lenTest2 - 2, posStateNext);
            const curAndLenPrice = nextRepMatchPrice + price_2 +
              this.#GetPureRepPrice(0, state2, posStateNext);
            const optimum = this.#optimum[curLen + offset];
            if (curAndLenPrice < optimum.price!) {
              optimum.price = curAndLenPrice;
              optimum.posPrev = curLen + lenTest + 1;
              optimum.backPrev = 0;
              optimum.prev1IsChar = true;
              optimum.prev2 = true;
              optimum.posPrev2 = curLen;
              optimum.backPrev2 = repIndex;
            }
          }
        }
      }

      if (newLen > numAvailBytes) {
        newLen = numAvailBytes;
        for (numDistPairs = 0; newLen > md_[numDistPairs]; numDistPairs += 2);
        md_[numDistPairs] = newLen;
        numDistPairs += 2;
      }

      if (newLen >= startLen) {
        normalMatchPrice = matchPrice + getBitPrice(this.#isRep[state], 0);

        while (lenEnd < curLen + newLen) {
          this.#optimum[lenEnd += 1].price = INFINITY_PRICE;
        }

        let offs = 0;
        while (startLen > md_[offs]) offs += 2;

        for (let lenTest = startLen;; lenTest += 1) {
          const curBack: CDist = md_[offs + 1];
          let curAndLenPrice = normalMatchPrice +
            this.#GetPosLenPrice(curBack, lenTest, posState);
          const optimum = this.#optimum[curLen + lenTest];
          if (curAndLenPrice < optimum.price!) {
            optimum.price = curAndLenPrice;
            optimum.posPrev = curLen;
            optimum.backPrev = curBack + 4;
            optimum.prev1IsChar = false;
          }

          if (lenTest === md_[offs]) {
            if (lenTest < numAvailBytesFull) {
              const t_: CLen = Math.min(
                numAvailBytesFull - 1 - lenTest,
                this.#numFastBytes,
              );
              const lenTest2 = mf_.getMatchLen(lenTest, curBack, t_);
              if (lenTest2 >= 2) {
                let state2 = UpdateState_Match(state);
                let posStateNext = pos_x + lenTest & this.#posStateMask;
                let state22 = (state2 << kNumPosBitsMax) + posStateNext;

                const curAndLenCharPrice = curAndLenPrice +
                  getBitPrice(this.#isMatch[state22], 0) +
                  this.#litenc.getSubCoder(
                    pos_x + lenTest,
                    mf_.getIndexByte(lenTest - 1 - 1),
                  ).getPrice(
                    true,
                    mf_.getIndexByte(lenTest - (curBack + 1) - 1),
                    mf_.getIndexByte(lenTest - 1),
                  );

                state2 = UpdateState_Literal(state2);
                posStateNext = pos_x + lenTest + 1 & this.#posStateMask;
                state22 = (state2 << kNumPosBitsMax) + posStateNext;

                const nextMatchPrice = curAndLenCharPrice +
                  getBitPrice(this.#isMatch[state22], 1);
                const nextRepMatchPrice = nextMatchPrice +
                  getBitPrice(this.#isRep[state2], 1);

                const offset = lenTest + 1 + lenTest2;
                while (lenEnd < curLen + offset) {
                  this.#optimum[lenEnd += 1].price = INFINITY_PRICE;
                }

                const price_3: CProbPrice = this.#replenenc
                  .getPrice(lenTest2 - 2, posStateNext);
                curAndLenPrice = nextRepMatchPrice + price_3 +
                  this.#GetPureRepPrice(0, state2, posStateNext);
                const optimum = this.#optimum[curLen + offset];
                if (curAndLenPrice < optimum.price!) {
                  optimum.price = curAndLenPrice;
                  optimum.posPrev = curLen + lenTest + 1;
                  optimum.backPrev = 0;
                  optimum.prev1IsChar = true;
                  optimum.prev2 = true;
                  optimum.posPrev2 = curLen;
                  optimum.backPrev2 = curBack + 4;
                }
              }
            }

            offs += 2;
            if (offs === numDistPairs) break;
          }
        }
      }
    }

    /* Fallback return - should not be reached in normal execution */
    return 1;
  }

  /** @const @param pos_x */
  #GetPosSlot2(pos_x: CDist): uint8 {
    if (pos_x < 0x2_0000) return G_FAST_POS[pos_x >> 6] + 12;
    if (pos_x < 0x800_0000) return G_FAST_POS[pos_x >> 16] + 32;

    return G_FAST_POS[pos_x >> 26] + 52;
  }

  /**
   * @const @param pos_x
   * @const @param len_x
   * @const @param posState_x
   */
  #GetPosLenPrice(pos_x: CDist, len_x: CLen, posState_x: CState): CProbPrice {
    let price: CProbPrice;
    const lenToPosState = getLenToPosState(len_x - kMatchMinLen);

    if (pos_x < 0x80) {
      price = this.#distancesPrices[lenToPosState * 0x80 + pos_x];
    } else {
      const position = (lenToPosState << 6) + this.#GetPosSlot2(pos_x);
      price = this.#posSlotPrices[position] + this.#alignPrices[pos_x & 0xF];
    }

    return price + this.#lenenc.getPrice(len_x - kMatchMinLen, posState_x);
  }

  /**
   * @const @param repIndex_x
   * @const @param state_x
   * @const @param posState_x
   */
  #GetPureRepPrice(
    repIndex_x: RepIndex_,
    state_x: CState,
    posState_x: CState,
  ): CProbPrice {
    let price: CProbPrice;

    if (repIndex_x === 0) {
      price = getBitPrice(this.#isRepG0[state_x], 0);
      price += getBitPrice(this.#isRep0Long[(state_x << 4) + posState_x], 1);
    } else {
      price = getBitPrice(this.#isRepG0[state_x], 1);
      if (repIndex_x === 1) {
        price += getBitPrice(this.#isRepG1[state_x], 0);
      } else {
        price += getBitPrice(this.#isRepG1[state_x], 1);
        price += getBitPrice(this.#isRepG2[state_x], (repIndex_x - 2) as 0 | 1);
      }
    }

    return price;
  }

  /** @const @param posState_x */
  #GetRepLen1Price(posState_x: CState): CProbPrice {
    const repG0Price = getBitPrice(this.#isRepG0[this.#state], 0);
    const rep0LongPrice = getBitPrice(
      this.#isRep0Long[(this.#state << kNumPosBitsMax) + posState_x],
      0,
    );

    return repG0Price + rep0LongPrice;
  }

  /** @const @param num_x */
  async #MovePos(num_x: CLen): Promise<void> {
    if (num_x > 0) {
      await this.#matchFinder.Skip(num_x);
      this.#extraPos48 += num_x;
    }
  }

  /**
   * Modify
   *    - `#numDistPairs`, `#extraPos48`
   */
  async #ReadMatchDistances(): Promise<CLen> {
    let lenRes: CLen = 0;

    this.#numDistPairs = await this.#matchFinder.GetMatches();
    if (this.#numDistPairs > 0) {
      lenRes = this.#matchFinder.matchDistances[this.#numDistPairs - 2];

      if (lenRes === this.#numFastBytes) {
        lenRes += this.#matchFinder.getMatchLen(
          lenRes - 1,
          this.#matchFinder.matchDistances[this.#numDistPairs - 1],
          kMatchMaxLen - lenRes,
        );
      }
    }

    this.#extraPos48 += 1;

    return lenRes;
  }

  #encodeLiteral(): void {
    const curByte = this.#matchFinder.getIndexByte(-this.#extraPos48);

    const probs =
      this.#litenc.getSubCoder(this.#nowPos48, this.#prevByte).decoders;
    if (this.#state < 7) {
      this.#RangeEnc.encodeBits(probs, 8, curByte);
    } else {
      const matchByte = this.#matchFinder.getIndexByte(
        -this.#extraPos48 - (this.#repDistances[0] + 1),
      );

      let same = true, m_ = 1;
      for (let i = 8; i--;) {
        const bit = ((curByte >> i) & 1) as 0 | 1;
        let state = m_;

        if (same) {
          const matchBit = (matchByte >> i) & 1;
          state += (1 + matchBit) << 8;
          same = matchBit === bit;
        }

        this.#RangeEnc.encodeBit(probs, state, bit);
        m_ = m_ << 1 | bit;
      }
    }
    this.#state = UpdateState_Literal(this.#state);

    this.#prevByte = curByte;
  }

  #Flush(): void {
    this.#writeEndMarker(this.#nowPos48 & this.#posStateMask);

    for (let i = 0; i < 5; ++i) {
      this.#RangeEnc.shiftLow();
    }
  }

  async codeOneBlock(): Promise<void> {
    const mf_ = this.#matchFinder;
    const re_ = this.#RangeEnc;

    this.#processedInSize = 0;
    this.finished = true;
    const progressPosValuePrev = this.#nowPos48;

    if (this.#inStream) {
      mf_.inStream = this.#inStream;
      await mf_.Init();

      this.#inStream = null;
    }

    if (this.#blockFinished) return;
    this.#blockFinished = true;

    if (this.#nowPos48 === 0) {
      if (mf_.numAvailBytes === 0) {
        this.#Flush();
        return;
      }

      await this.#ReadMatchDistances();

      const posState: CState = this.#nowPos48 & this.#posStateMask;
      re_.encodeBit(
        this.#isMatch,
        (this.#state << kNumPosBitsMax) + posState,
        0,
      );
      this.#encodeLiteral();

      this.#extraPos48 -= 1;
      this.#nowPos48++;
    }

    if (mf_.numAvailBytes === 0) {
      this.#Flush();
      return;
    }

    while (1) {
      const len: CLen = await this.#GetOptimum(this.#nowPos48);
      let pos = this.#backRes;
      const posState = this.#nowPos48 & this.#posStateMask;
      const complexState = (this.#state << kNumPosBitsMax) + posState;

      if (len === 1 && pos === -1) {
        re_.encodeBit(this.#isMatch, complexState, 0);
        this.#encodeLiteral();
      } else {
        re_.encodeBit(this.#isMatch, complexState, 1);
        let distance;
        if (pos < 4) {
          re_.encodeBit(this.#isRep, this.#state, 1);

          if (!pos) {
            re_.encodeBit(this.#isRepG0, this.#state, 0);

            if (len === 1) {
              re_.encodeBit(this.#isRep0Long, complexState, 0);
            } else {
              re_.encodeBit(this.#isRep0Long, complexState, 1);
            }
          } else {
            re_.encodeBit(this.#isRepG0, this.#state, 1);

            if (pos === 1) {
              re_.encodeBit(this.#isRepG1, this.#state, 0);
            } else {
              re_.encodeBit(this.#isRepG1, this.#state, 1);
              re_.encodeBit(this.#isRepG2, this.#state, (pos - 2) as 0 | 1);
            }
          }

          if (len === 1) {
            this.#state = UpdateState_ShortRep(this.#state);
          } else {
            this.#replenenc.encode(len - 2, posState, re_);
            this.#state = UpdateState_Rep(this.#state);
          }
          distance = this.#repDistances[pos];
          if (pos !== 0) {
            for (let i = pos; i >= 1; --i) {
              this.#repDistances[i] = this.#repDistances[i - 1];
            }
            this.#repDistances[0] = distance;
          }
        } else {
          re_.encodeBit(this.#isRep, this.#state, 0);

          this.#state = UpdateState_Match(this.#state);
          this.#lenenc.encode(len - 2, posState, re_);

          pos -= 4;
          const posSlot = getPosSlot(pos);
          const lenToPosState = getLenToPosState(len - kMatchMinLen);
          re_.encodeBitTree(this.#posSlotEncoder[lenToPosState], posSlot);

          if (posSlot >= 4) {
            const footerBits = (posSlot >> 1) - 1;
            const baseVal = (2 | (posSlot & 1)) << footerBits;
            const posReduced = pos - baseVal;

            if (posSlot < 14) {
              re_.encodeReverseBits(
                this.#posEncoders,
                footerBits,
                posReduced,
                baseVal - posSlot - 1,
              );
            } else {
              re_.encodeDirectBits(posReduced >> 4, footerBits - 4);
              re_.encodeReverseBits(
                this.#posAlignEncoder.Probs,
                this.#posAlignEncoder.NumBits,
                posReduced & 0xF,
              );
              this.#alignPriceCount += 1;
            }
          }
          distance = pos;
          for (let i = 3; i >= 1; --i) {
            this.#repDistances[i] = this.#repDistances[i - 1];
          }

          this.#repDistances[0] = distance;
          this.#matchPriceCount += 1;
        }

        this.#prevByte = mf_.getIndexByte(len - 1 - this.#extraPos48);
      }

      this.#extraPos48 -= len;
      this.#nowPos48 += len;

      if (this.#extraPos48 === 0) {
        if (this.#matchPriceCount >= 128) {
          this.#fillDistancesPrices();
        }

        if (this.#alignPriceCount >= 16) {
          this.#fillAlignPrices();
        }

        this.#processedInSize = this.#nowPos48;

        if (mf_.numAvailBytes === 0) {
          this.#Flush();
          return;
        }

        if (this.#nowPos48 - progressPosValuePrev >= LZMA_DIC_MIN) {
          this.#blockFinished = false;
          this.finished = false;
          return;
        }
      }
    }
  }

  ReleaseStreams(): void {
    this.#matchFinder.cleanup();
    this.#RangeEnc.cleanup();
  }
}
/*80--------------------------------------------------------------------------*/
