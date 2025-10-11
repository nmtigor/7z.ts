/** 80**************************************************************************
 * Ref. [[lzma1]/src/encoder.ts](https://github.com/xseman/lzma1/blob/master/src/encoder.ts)
 *    * Refactor heavily
 *
 * @module lib/7z/lzma/LzmaEncoder
 * @license MIT
 ******************************************************************************/

import type { int, uint, uint32, uint8 } from "@fe-lib/alias.ts";
import "@fe-lib/jslang.ts";
import type { CLen, CProb, CProbPrice, CState, DictSize } from "./alias.ts";
import {
  INFINITY_PRICE,
  kMatchMinLen,
  kNumAlignBits,
  kNumLenToPosStates,
  kNumPosBitsMax,
  kNumStates,
  MATCH_DECODERS_SIZE,
  POS_CODERS_SIZE,
} from "./alias.ts";
import { LenEncoder } from "./LenEncoder.ts";
import type { ILitSubCoder } from "./LitCoder.ts";
import { LitEncoder } from "./LitCoder.ts";
import type { Mode } from "./Lzma.ts";
import { MatchFinder } from "./MatchFinder.ts";
import { RangeEncoder } from "./RangeEncoder.ts";
import type { BaseStream } from "./streams.ts";
import {
  BitTree,
  CRC32_TABLE,
  G_FAST_POS,
  getBitPrice,
  getLenToPosState,
  getPosSlot,
  initProbs,
  PROB_PRICES,
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

type Optimum_ = {
  state?: CState;
  price?: CProbPrice;

  posPrev?: uint;
  backPrev?: uint32 | -1;

  prev1IsChar?: boolean;

  prev2?: boolean;
  posPrev2?: uint;
  backPrev2?: uint32;

  backs0?: DictSize;
  backs1?: DictSize;
  backs2?: DictSize;
  backs3?: DictSize;
};

/** LZMA Encoder class that handles compression operations */
export class LzmaEncoder {
  /* Core state properties */
  #state: CState = 0;
  #prevByte: uint8 = 0;
  #distTableSize: DictSize = 0;
  #longestMatchFound = false;
  #optimumEndIndex: uint = 0;
  #optimumCurIndex: uint = 0;
  #extraBufofs: int = 0;
  /* ~ */

  /* Dictionary and match finding */
  #dictSize: DictSize = 0;
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
  #needReleaseMFStream = false;
  inStream: BaseStream | null = null;
  #blockFinished = false;
  #nowPos48: uint = 0;
  /* ~ */

  /* Distance and repetition arrays */
  readonly #repDistances = Array.mock<DictSize>(4).fill(0);
  readonly #optimum: Optimum_[] = [];
  /* ~ */

  readonly RangeEnc = new RangeEncoder();

  /* Bit model arrays for different types of encoding decisions */
  readonly #isMatch = Array.mock<CProb>(MATCH_DECODERS_SIZE);
  readonly #isRep = Array.mock<CProb>(kNumStates);
  readonly #isRepG0 = Array.mock<CProb>(kNumStates);
  readonly #isRepG1 = Array.mock<CProb>(kNumStates);
  readonly #isRepG2 = Array.mock<CProb>(kNumStates);
  readonly #isRep0Long = Array.mock<CProb>(MATCH_DECODERS_SIZE);
  /* ~ */

  /* Position and alignment encoders */
  readonly #posSlotEncoder = Array.from(
    { length: kNumLenToPosStates },
    () => new BitTree(6),
  );
  readonly #posAlignEncoder = new BitTree(kNumAlignBits);
  readonly #posEncoders = Array.mock<CProb>(POS_CODERS_SIZE);

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

  /* Distance and price arrays */
  readonly #matchDistances: (CLen | DictSize)[] = [];
  /** `length < 256` */
  readonly #posSlotPrices: CProbPrice[] = [];
  /** `length < 512` */
  readonly #distancesPrices: CProbPrice[] = [];
  readonly #alignPrices = Array.mock<CProbPrice>(1 << kNumAlignBits);
  #matchPriceCount: number = 0;
  #alignPriceCount: number = 0;
  /* ~ */

  /* Optimization arrays */
  readonly #reps = Array.mock<DictSize>(4);
  readonly #repLens = Array.mock<CLen>(4);
  /* ~ */

  /* Processing counters */
  processedInSize = 0;
  //jjjj TOCLEANUP
  // #processedOutSize = 0;
  finished = false;
  readonly properties = Array.mock<uint8>(5);
  readonly #tempPrices = Array.mock<CProbPrice>(128);
  /* ~ */

  /* Match finding properties */
  #longestMatchLen: CLen = 0;
  #matchFinderType = true;
  /** Assigned by {@linkcode _GetMatches()} */
  #numDistPairs: uint = 0;
  #backRes: number = 0;
  /* ~ */

  Init(): void {
    for (let i = 0; i < 0x1000; i++) {
      this.#optimum[i] = {};
    }

    this.RangeEnc.Init();

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
    for (let byteIndex = 0; byteIndex < 4; byteIndex++) {
      this.properties[1 + byteIndex] = (this.#dictSize >> (8 * byteIndex)) &
        0xFF;
    }

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
  setDictSize(dictSize_x: DictSize): void {
    this.#dictSize = dictSize_x;

    let dicLogSize = 0;
    for (; dictSize_x > (1 << dicLogSize); ++dicLogSize);
    this.#distTableSize = dicLogSize * 2;
  }

  /**
   * @borrow @headconst @param encoder_x
   * @const @param symbol_x
   */
  encodeLiteral(encoder_x: ILitSubCoder, symbol_x: uint8): void {
    let context = 1;
    for (let i = 8; i--;) {
      const bit = ((symbol_x >> i) & 1) as 0 | 1;
      this.RangeEnc.encodeBit(encoder_x.decoders, context, bit);
      context = context << 1 | bit;
    }
  }

  /**
   * @borrow @headconst @param encoder_x
   * @const @param matchByte_x
   * @const @param symbol_x
   */
  encodeMatched(
    encoder_x: ILitSubCoder,
    matchByte_x: uint8,
    symbol_x: uint8,
  ): void {
    let matchBit, state, same = true, context = 1;

    for (let i = 8; i--;) {
      const bit = ((symbol_x >> i) & 1) as 0 | 1;
      state = context;

      if (same) {
        matchBit = (matchByte_x >> i) & 1;
        state += (1 + matchBit) << 8;
        same = matchBit === bit;
      }

      this.RangeEnc.encodeBit(encoder_x.decoders, state, bit);
      context = context << 1 | bit;
    }
  }

  /** @param symbol_x */
  reverseEncode(symbol_x: uint8): void {
    const probs = this.#posAlignEncoder.Probs;
    let m_ = 1;
    for (let i = this.#posAlignEncoder.NumBits; i--;) {
      const bit = (symbol_x & 1) as 0 | 1;
      this.RangeEnc.encodeBit(probs, m_, bit);
      m_ = m_ << 1 | bit;
      symbol_x >>= 1;
    }
  }

  /** Reverse encode range */
  reverseEncodeRange(
    startIndex: number,
    numBitLevels: number,
    symbol: number,
  ): void {
    let bit, m = 1;

    for (let i = 0; i < numBitLevels; ++i) {
      bit = (symbol & 1) as 0 | 1;
      this.RangeEnc.encodeBit(this.#posEncoders, startIndex + m, bit);
      m = m << 1 | bit;
      symbol >>= 1;
    }
  }

  /** @const @param posState_x */
  #writeEndMarker(posState_x: uint8): void {
    this.RangeEnc.encodeBit(
      this.#isMatch,
      (this.#state << kNumPosBitsMax) + posState_x,
      1,
    );

    this.RangeEnc.encodeBit(this.#isRep, this.#state, 0);

    this.#state = UpdateState_Match(this.#state);
    this.#lenenc.encode(0, posState_x, this.RangeEnc);

    const posSlot = 63;
    const lenToPosState = 0;
    this.RangeEnc.encodeBitTree(this.#posSlotEncoder[lenToPosState], posSlot);
    this.RangeEnc.encodeDirectBits(0x3ff_ffff, 26);
    this.reverseEncode(0xf);
  }

  /**
   * Fill alignment prices for position alignment encoder
   *
   * Modify
   *    - `#alignPrices[i]`, `#alignPriceCount`
   */
  #fillAlignPrices(): void {
    for (let i = 1 << kNumAlignBits; i--;) {
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

  private _GetMatches(): number {
    const mf_ = this.#matchFinder;
    const md_ = this.#matchDistances;

    const lenLimit = Math.min(mf_.streamPos - mf_.pos, mf_.matchMaxLen);
    if (lenLimit < mf_.kMinMatchCheck) {
      mf_.MovePos_0();
      return 0;
    }

    let offset = 0;
    const matchMinPos = mf_.pos > mf_.cyclicBufferSize
      ? mf_.pos - mf_.cyclicBufferSize
      : 0;

    const cur = mf_.bufpos_0;
    let maxLen: CLen = 1;
    let hash2Value = 0;
    let hash3Value = 0;

    let hashValue: uint32;
    if (mf_.HASH_ARRAY) {
      let temp = CRC32_TABLE[mf_.bufferBase[cur] & 0xFF] ^
        (mf_.bufferBase[cur + 1] & 0xFF);
      hash2Value = temp & 0x3FF;
      temp ^= (mf_.bufferBase[cur + 2] & 0xFF) << 8;
      hash3Value = temp & 0xFFFF;
      hashValue = (temp ^ (CRC32_TABLE[mf_.bufferBase[cur + 3] & 0xFF] << 5)) &
        mf_.hashMask;
    } else {
      hashValue = (mf_.bufferBase[cur] & 0xFF) ^
        ((mf_.bufferBase[cur + 1] & 0xFF) << 8);
    }

    let curMatch = mf_.hash[mf_.kFixHashSize + hashValue] || 0;
    if (mf_.HASH_ARRAY) {
      let curMatch2 = mf_.hash[hash2Value] || 0;
      const curMatch3 = mf_.hash[0x400 + hash3Value] || 0;
      mf_.hash[hash2Value] = mf_.pos;
      mf_.hash[0x400 + hash3Value] = mf_.pos;

      if (curMatch2 > matchMinPos) {
        if (
          mf_.bufferBase[mf_.bufferOffset + curMatch2] === mf_.bufferBase[cur]
        ) {
          md_[offset++] = maxLen = 2;
          md_[offset++] = mf_.pos - curMatch2 - 1;
        }
      }

      if (curMatch3 > matchMinPos) {
        if (
          mf_.bufferBase[mf_.bufferOffset + curMatch3] === mf_.bufferBase[cur]
        ) {
          if (curMatch3 === curMatch2) {
            offset -= 2;
          }
          md_[offset++] = maxLen = 3;
          md_[offset++] = mf_.pos - curMatch3 - 1;
          curMatch2 = curMatch3;
        }
      }

      if (offset !== 0 && curMatch2 === curMatch) {
        offset -= 2;
        maxLen = 1;
      }
    }

    mf_.hash[mf_.kFixHashSize + hashValue] = mf_.pos;
    let ptr1 = mf_.cyclicBufferPos << 1;
    let ptr0 = ptr1 + 1;
    let len1 = mf_.kNumHashDirectBytes;
    let len0 = len1;

    if (mf_.kNumHashDirectBytes !== 0) {
      if (curMatch > matchMinPos) {
        if (
          mf_.bufferBase[
            mf_.bufferOffset + curMatch + mf_.kNumHashDirectBytes
          ] !== mf_.bufferBase[cur + mf_.kNumHashDirectBytes]
        ) {
          md_[offset++] = maxLen = mf_.kNumHashDirectBytes;
          md_[offset++] = mf_.pos - curMatch - 1;
        }
      }
    }
    //jjjj TOCLEANUP
    // let count = mf_.cutValue;

    while (1) {
      //jjjj TOCLEANUP
      // if (curMatch <= matchMinPos || mf_.cutValue === 0) {
      if (curMatch <= matchMinPos) {
        //jjjj TOCLEANUP
        // count -= 1;
        mf_.son[ptr0] = mf_.son[ptr1] = 0;
        break;
      }
      const delta = mf_.pos - curMatch;

      const cyclicPos = (delta <= mf_.cyclicBufferPos
        ? mf_.cyclicBufferPos - delta
        : mf_.cyclicBufferPos - delta + mf_.cyclicBufferSize) << 1;

      const pby1 = mf_.bufferOffset + curMatch;
      let len: CLen = len0 < len1 ? len0 : len1;

      if (mf_.bufferBase[pby1 + len] === mf_.bufferBase[cur + len]) {
        while ((len += 1) !== lenLimit) {
          if (mf_.bufferBase[pby1 + len] !== mf_.bufferBase[cur + len]) {
            break;
          }
        }

        if (maxLen < len) {
          md_[offset++] = maxLen = len;
          md_[offset++] = delta - 1;
          if (len === lenLimit) {
            mf_.son[ptr1] = mf_.son[cyclicPos];
            mf_.son[ptr0] = mf_.son[cyclicPos + 1];
            break;
          }
        }
      }

      if (
        (mf_.bufferBase[pby1 + len] & 0xFF) <
          (mf_.bufferBase[cur + len] & 0xFF)
      ) {
        mf_.son[ptr1] = curMatch;
        ptr1 = cyclicPos + 1;
        curMatch = mf_.son[ptr1];
        len1 = len;
      } else {
        mf_.son[ptr0] = curMatch;
        ptr0 = cyclicPos;
        curMatch = mf_.son[ptr0];
        len0 = len;
      }
    }

    mf_.MovePos_0();
    return offset;
  }

  /** @param cur_x */
  #Backward(cur_x: uint): uint {
    this.#optimumEndIndex = cur_x;
    let posMem = this.#optimum[cur_x].posPrev;
    let backMem = this.#optimum[cur_x].backPrev;

    do {
      if (this.#optimum[cur_x].prev1IsChar) {
        this.#MakeAsChar(this.#optimum[posMem!]);
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

  #Flush(): void {
    this.#ReleaseMFStream();
    this.#writeEndMarker(this.#nowPos48 & this.#posStateMask);

    for (let i = 0; i < 5; ++i) {
      this.RangeEnc.shiftLow();
    }
  }

  /** @const pos_x */
  #GetOptimum(pos_x: uint): CLen {
    const mf_ = this.#matchFinder;
    const md_ = this.#matchDistances;

    let curAndLenCharPrice: CProbPrice,
      curAndLenPrice: CProbPrice,
      lenTest: CLen,
      lenTest2: CLen,
      nextMatchPrice: CProbPrice,
      nextRepMatchPrice: CProbPrice,
      offset,
      optimum: Optimum_,
      posStateNext: CState;

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
      lenMain = this.#ReadMatchDistances();
    }

    let numDistPairs = this.#numDistPairs;
    let numAvailBytes = mf_.getNumAvailableBytes() + 1;

    if (numAvailBytes < 2) {
      this.#backRes = -1;
      return 1;
    }

    if (numAvailBytes > 0x111) {
      numAvailBytes = 0x111;
    }

    let repMaxIndex = 0;
    for (let i = 0; i < 4; ++i) {
      this.#reps[i] = this.#repDistances[i];
      this.#repLens[i] = mf_.getMatchLen(-1, this.#reps[i], 273);

      if (this.#repLens[i] > this.#repLens[repMaxIndex]) {
        repMaxIndex = i;
      }
    }

    if (this.#repLens[repMaxIndex] >= this.#numFastBytes) {
      this.#backRes = repMaxIndex;
      const lenRes: CLen = this.#repLens[repMaxIndex];
      this.#MovePos(lenRes - 1);
      return lenRes;
    }

    if (lenMain >= this.#numFastBytes) {
      this.#backRes = md_[numDistPairs - 1] + 4;
      this.#MovePos(lenMain - 1);
      return lenMain;
    }

    let curByte = mf_.getIndexByte(-1);
    let matchByte = mf_.getIndexByte(-this.#repDistances[0] - 1 - 1);

    if (
      lenMain < 2 && curByte !== matchByte && this.#repLens[repMaxIndex] < 2
    ) {
      this.#backRes = -1;
      return 1;
    }

    this.#optimum[0].state = this.#state;
    let posState = pos_x & this.#posStateMask;
    this.#optimum[1].price =
      PROB_PRICES[(this.#isMatch[(this.#state << 4) + posState]) >>> 2] +
      this.#litenc.getSubCoder(pos_x, this.#prevByte)
        .getPrice(this.#state >= 7, matchByte, curByte);

    this.#MakeAsChar(this.#optimum[1]);
    let matchPrice: CProbPrice =
      PROB_PRICES[(2048 - this.#isMatch[(this.#state << 4) + posState]) >>> 2];

    let repMatchPrice: CProbPrice = matchPrice +
      PROB_PRICES[(2048 - this.#isRep[this.#state]) >>> 2];

    if (matchByte === curByte) {
      const shortRepPrice = repMatchPrice + this.#GetRepLen1Price(posState);
      if (shortRepPrice < this.#optimum[1].price!) {
        this.#optimum[1].price = shortRepPrice;
        this.#MakeAsShortRep(this.#optimum[1]);
      }
    }

    let lenEnd: CLen = lenMain >= this.#repLens[repMaxIndex]
      ? lenMain
      : this.#repLens[repMaxIndex];

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
    } while (len >= 2);

    for (let i = 0; i < 4; ++i) {
      let repLen = this.#repLens[i];
      if (repLen < 2) continue;

      const price_4: CProbPrice = repMatchPrice +
        this.#GetPureRepPrice(i as 0 | 1 | 2 | 3, this.#state, posState);

      do {
        curAndLenPrice = price_4 +
          this.#replenenc.getPrice(repLen - 2, posState);
        optimum = this.#optimum[repLen];
        if (curAndLenPrice < optimum.price!) {
          optimum.price = curAndLenPrice;
          optimum.posPrev = 0;
          optimum.backPrev = i;
          optimum.prev1IsChar = false;
        }
      } while ((repLen -= 1) >= 2);
    }

    let normalMatchPrice: CProbPrice = matchPrice +
      PROB_PRICES[(this.#isRep[this.#state]) >>> 2];

    len = this.#repLens[0] >= 2 ? this.#repLens[0] + 1 : 2;

    if (len <= lenMain) {
      let offs = 0;
      while (len > md_[offs]) offs += 2;

      for (;; len += 1) {
        const distance: DictSize = md_[offs + 1];
        curAndLenPrice = normalMatchPrice +
          this.#GetPosLenPrice(distance, len, posState);
        optimum = this.#optimum[len];

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
    let cur = 0;

    while (1) {
      ++cur;
      if (cur == lenEnd) return this.#Backward(cur);

      let newLen: CLen = this.#ReadMatchDistances();
      numDistPairs = this.#numDistPairs;

      if (newLen >= this.#numFastBytes) {
        this.#longestMatchLen = newLen;
        this.#longestMatchFound = true;
        return this.#Backward(cur);
      }

      pos_x += 1;
      let posPrev = this.#optimum[cur].posPrev!;

      let state: CState | undefined;
      if (this.#optimum[cur].prev1IsChar) {
        posPrev -= 1;
        if (this.#optimum[cur].prev2) {
          state = this.#optimum[this.#optimum[cur].posPrev2!].state!;
          state = this.#optimum[cur].backPrev2! < 4
            ? UpdateState_Rep(state)
            : UpdateState_Match(state);
        } else {
          state = this.#optimum[posPrev].state!;
        }
        state = UpdateState_Literal(state);
      } else {
        state = this.#optimum[posPrev].state!;
      }

      if (posPrev == cur - 1) {
        if (!this.#optimum[cur].backPrev) {
          state = UpdateState_ShortRep(state);
        } else {
          state = UpdateState_Literal(state);
        }
      } else {
        let pos;
        if (this.#optimum[cur].prev1IsChar && this.#optimum[cur].prev2) {
          posPrev = this.#optimum[cur].posPrev2!;
          pos = this.#optimum[cur].backPrev2;
          state = UpdateState_Rep(state);
        } else {
          pos = this.#optimum[cur].backPrev;
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
          } else if (pos == 1) {
            this.#reps[0] = opt.backs1!;
            this.#reps[1] = opt.backs0!;
            this.#reps[2] = opt.backs2!;
            this.#reps[3] = opt.backs3!;
          } else if (pos == 2) {
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

      this.#optimum[cur].state = state;
      this.#optimum[cur].backs0 = this.#reps[0];
      this.#optimum[cur].backs1 = this.#reps[1];
      this.#optimum[cur].backs2 = this.#reps[2];
      this.#optimum[cur].backs3 = this.#reps[3];
      const curPrice = this.#optimum[cur].price;

      curByte = mf_.getIndexByte(-1);
      matchByte = mf_.getIndexByte(-this.#reps[0] - 1 - 1);

      posState = pos_x & this.#posStateMask;
      const curAnd1Price: CProbPrice = curPrice! +
        PROB_PRICES[(this.#isMatch[(state << 4) + posState]) >>> 2] +
        this.#litenc.getSubCoder(pos_x, mf_.getIndexByte(-2))
          .getPrice(state >= 7, matchByte, curByte);

      const nextOptimum = this.#optimum[cur + 1];
      let nextIsChar = 0;

      if (curAnd1Price < nextOptimum.price!) {
        nextOptimum.price = curAnd1Price;
        nextOptimum.posPrev = cur;
        nextOptimum.backPrev = -1;
        nextOptimum.prev1IsChar = false;
        nextIsChar = 1;
      }

      matchPrice = curPrice! +
        PROB_PRICES[(2048 - this.#isMatch[(state << 4) + posState]) >>> 2];

      repMatchPrice = matchPrice +
        PROB_PRICES[(2048 - this.#isRep[state]) >>> 2];

      if (
        matchByte === curByte &&
        !(nextOptimum.posPrev! < cur && !nextOptimum.backPrev)
      ) {
        const shortRepPrice: CProbPrice = repMatchPrice +
          PROB_PRICES[(this.#isRepG0[state]) >>> 2] +
          PROB_PRICES[(this.#isRep0Long[(state << 4) + posState]) >>> 2];

        if (shortRepPrice <= nextOptimum.price!) {
          nextOptimum.price = shortRepPrice;
          nextOptimum.posPrev = cur;
          nextOptimum.backPrev = 0;
          nextOptimum.prev1IsChar = false;
          nextIsChar = 1;
        }
      }

      let numAvailBytesFull = mf_.getNumAvailableBytes() + 1;
      numAvailBytesFull = 0xFFF - cur < numAvailBytesFull
        ? 0xFFF - cur
        : numAvailBytesFull;

      numAvailBytes = numAvailBytesFull;

      if (numAvailBytes < 2) continue;

      if (numAvailBytes > this.#numFastBytes) {
        numAvailBytes = this.#numFastBytes;
      }

      if (!nextIsChar && matchByte !== curByte) {
        const t_: CLen = Math.min(numAvailBytesFull - 1, this.#numFastBytes);
        lenTest2 = mf_.getMatchLen(0, this.#reps[0], t_);

        if (lenTest2 >= 2) {
          const state2 = UpdateState_Literal(state);
          posStateNext = pos_x + 1 & this.#posStateMask;
          nextRepMatchPrice = curAnd1Price +
            PROB_PRICES[
              (2048 - this.#isMatch[(state2 << 4) + posStateNext]) >>> 2
            ] + PROB_PRICES[(2048 - this.#isRep[state2]) >>> 2];

          offset = cur + 1 + lenTest2;

          while (lenEnd < offset) {
            this.#optimum[lenEnd += 1].price = INFINITY_PRICE;
          }

          const price = this.#replenenc.getPrice(lenTest2 - 2, posStateNext);
          curAndLenPrice = nextRepMatchPrice + price +
            this.#GetPureRepPrice(0, state2, posStateNext);
          optimum = this.#optimum[offset];

          if (curAndLenPrice < optimum.price!) {
            optimum.price = curAndLenPrice;
            optimum.posPrev = cur + 1;
            optimum.backPrev = 0;
            optimum.prev1IsChar = true;
            optimum.prev2 = false;
          }
        }
      }
      let startLen = 2;

      for (let repIndex = 0; repIndex < 4; ++repIndex) {
        lenTest = mf_.getMatchLen(-1, this.#reps[repIndex], numAvailBytes);

        if (lenTest < 2) continue;

        const lenTestTemp = lenTest;

        do {
          while (lenEnd < cur + lenTest) {
            this.#optimum[lenEnd += 1].price = INFINITY_PRICE;
          }

          const price_0 = this.#replenenc.getPrice(lenTest - 2, posState);
          curAndLenPrice = repMatchPrice + price_0 +
            this.#GetPureRepPrice(repIndex as 0 | 1 | 2 | 3, state, posState);

          optimum = this.#optimum[cur + lenTest];

          if (curAndLenPrice < optimum.price!) {
            optimum.price = curAndLenPrice;
            optimum.posPrev = cur;
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
          lenTest2 = mf_.getMatchLen(lenTest, this.#reps[repIndex], t_);

          if (lenTest2 >= 2) {
            let state2 = UpdateState_Rep(state);
            posStateNext = pos_x + lenTest & this.#posStateMask;
            const price_1: CProbPrice = this.#replenenc
              .getPrice(lenTest - 2, posState);
            curAndLenCharPrice = repMatchPrice + price_1 +
              this.#GetPureRepPrice(
                repIndex as 0 | 1 | 2 | 3,
                state,
                posState,
              ) +
              PROB_PRICES[(this.#isMatch[(state2 << 4) + posStateNext]) >>> 2] +
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

            nextMatchPrice = curAndLenCharPrice + PROB_PRICES[
              (2048 - this.#isMatch[(state2 << 4) + posStateNext]) >>> 2
            ];

            nextRepMatchPrice = nextMatchPrice +
              PROB_PRICES[(2048 - this.#isRep[state2]) >>> 2];

            offset = lenTest + 1 + lenTest2;

            while (lenEnd < cur + offset) {
              this.#optimum[lenEnd += 1].price = INFINITY_PRICE;
            }

            const price_2: CProbPrice = this.#replenenc
              .getPrice(lenTest2 - 2, posStateNext);
            curAndLenPrice = nextRepMatchPrice + price_2 +
              this.#GetPureRepPrice(0, state2, posStateNext);
            optimum = this.#optimum[cur + offset];

            if (curAndLenPrice < optimum.price!) {
              optimum.price = curAndLenPrice;
              optimum.posPrev = cur + lenTest + 1;
              optimum.backPrev = 0;
              optimum.prev1IsChar = true;
              optimum.prev2 = true;
              optimum.posPrev2 = cur;
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
        normalMatchPrice = matchPrice + PROB_PRICES[(this.#isRep[state]) >>> 2];

        while (lenEnd < cur + newLen) {
          this.#optimum[lenEnd += 1].price = INFINITY_PRICE;
        }
        let offs = 0;

        while (startLen > md_[offs]) offs += 2;

        for (lenTest = startLen;; lenTest += 1) {
          const curBack: DictSize = md_[offs + 1];
          curAndLenPrice = normalMatchPrice +
            this.#GetPosLenPrice(curBack, lenTest, posState);
          optimum = this.#optimum[cur + lenTest];

          if (curAndLenPrice < optimum.price!) {
            optimum.price = curAndLenPrice;
            optimum.posPrev = cur;
            optimum.backPrev = curBack + 4;
            optimum.prev1IsChar = false;
          }

          if (lenTest === md_[offs]) {
            if (lenTest < numAvailBytesFull) {
              const t_: CLen = Math.min(
                numAvailBytesFull - 1 - lenTest,
                this.#numFastBytes,
              );
              lenTest2 = mf_.getMatchLen(lenTest, curBack, t_);

              if (lenTest2 >= 2) {
                let state2 = UpdateState_Match(state);
                posStateNext = pos_x + lenTest & this.#posStateMask;

                curAndLenCharPrice = curAndLenPrice + PROB_PRICES[
                  (this.#isMatch[(state2 << 4) + posStateNext]) >>> 2
                ] + this.#litenc.getSubCoder(
                  pos_x + lenTest,
                  mf_.getIndexByte(lenTest - 1 - 1),
                ).getPrice(
                  true,
                  mf_.getIndexByte(lenTest - (curBack + 1) - 1),
                  mf_.getIndexByte(lenTest - 1),
                );

                state2 = UpdateState_Literal(state2);
                posStateNext = pos_x + lenTest + 1 & this.#posStateMask;

                nextMatchPrice = curAndLenCharPrice + PROB_PRICES[
                  (2048 - this.#isMatch[(state2 << 4) + posStateNext]) >>> 2
                ];

                nextRepMatchPrice = nextMatchPrice +
                  PROB_PRICES[(2048 - this.#isRep[state2]) >>> 2];
                offset = lenTest + 1 + lenTest2;

                while (lenEnd < cur + offset) {
                  this.#optimum[lenEnd += 1].price = INFINITY_PRICE;
                }

                const price_3: CProbPrice = this.#replenenc
                  .getPrice(lenTest2 - 2, posStateNext);
                curAndLenPrice = nextRepMatchPrice + price_3 +
                  this.#GetPureRepPrice(0, state2, posStateNext);
                optimum = this.#optimum[cur + offset];

                if (curAndLenPrice < optimum.price!) {
                  optimum.price = curAndLenPrice;
                  optimum.posPrev = cur + lenTest + 1;
                  optimum.backPrev = 0;
                  optimum.prev1IsChar = true;
                  optimum.prev2 = true;
                  optimum.posPrev2 = cur;
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

  #GetPosLenPrice(pos: DictSize, len: number, posState: number): CProbPrice {
    let price: CProbPrice;
    const lenToPosState = getLenToPosState(len - kMatchMinLen);

    if (pos < 128) {
      price = this.#distancesPrices[lenToPosState * 128 + pos];
    } else {
      const position = (lenToPosState << 6) + this.GetPosSlot2(pos);
      price = this.#posSlotPrices[position] + this.#alignPrices[pos & 0xf];
    }

    return price + this.#lenenc.getPrice(len - 2, posState);
  }

  #GetPureRepPrice(
    repIndex: 0 | 1 | 2 | 3,
    state: number,
    posState: number,
  ): CProbPrice {
    let price: CProbPrice;

    if (repIndex === 0) {
      price = PROB_PRICES[(this.#isRepG0[state]) >>> 2];
      price +=
        PROB_PRICES[0x800 - this.#isRep0Long[(state << 4) + posState] >>> 2];
    } else {
      price = PROB_PRICES[(0x800 - this.#isRepG0[state]) >>> 2];
      if (repIndex == 1) {
        price += PROB_PRICES[(this.#isRepG1[state]) >>> 2];
      } else {
        price += PROB_PRICES[(0x800 - this.#isRepG1[state]) >>> 2];
        price += getBitPrice(this.#isRepG2[state], (repIndex - 2) as 0 | 1);
      }
    }

    return price;
  }

  #GetRepLen1Price(posState: number): CProbPrice {
    const repG0Price = PROB_PRICES[(this.#isRepG0[this.#state]) >>> 2];
    const rep0LongPrice =
      PROB_PRICES[this.#isRep0Long[(this.#state << 4) + posState] >>> 2];

    return repG0Price + rep0LongPrice;
  }

  /** @const @param num_x */
  #MovePos(num_x: CLen): void {
    if (num_x > 0) {
      this.#matchFinder.Skip(num_x);
      this.#extraBufofs += num_x;
    }
  }

  /**
   * Modify
   *    - `#numDistPairs`, `#extraBufofs`
   *    - {@linkcode _GetMatches()}
   */
  #ReadMatchDistances(): CLen {
    let lenRes: CLen = 0;

    this.#numDistPairs = this._GetMatches();
    if (this.#numDistPairs > 0) {
      lenRes = this.#matchDistances[this.#numDistPairs - 2];

      if (lenRes === this.#numFastBytes) {
        lenRes += this.#matchFinder.getMatchLen(
          lenRes - 1,
          this.#matchDistances[this.#numDistPairs - 1],
          273 - lenRes,
        );
      }
    }

    this.#extraBufofs += 1;

    return lenRes;
  }

  #ReleaseMFStream(): void {
    if (this.#needReleaseMFStream) {
      this.#matchFinder.stream = null;
      this.#needReleaseMFStream = false;
    }
  }

  GetPosSlot2(pos: number): number {
    if (pos < 0x2_0000) return G_FAST_POS[pos >> 6] + 12;
    if (pos < 0x800_0000) return G_FAST_POS[pos >> 16] + 32;

    return G_FAST_POS[pos >> 26] + 52;
  }

  #MakeAsChar(optimum: Optimum_): void {
    optimum.backPrev = -1;
    optimum.prev1IsChar = false;
  }

  #MakeAsShortRep(optimum: Optimum_): void {
    optimum.backPrev = 0;
    optimum.prev1IsChar = false;
  }

  codeOneBlock(): void {
    this.processedInSize = 0;
    //jjjj TOCLEANUP
    // this.#processedOutSize = 0;
    this.finished = true;
    const progressPosValuePrev = this.#nowPos48;

    if (this.inStream) {
      this.#matchFinder.stream = this.inStream;
      this.#matchFinder.Init();

      this.#needReleaseMFStream = true;
      this.inStream = null;
    }

    if (this.#blockFinished) return;
    this.#blockFinished = true;

    if (this.#nowPos48 === 0) {
      if (this.#matchFinder.getNumAvailableBytes() === 0) {
        this.#Flush();
        return;
      }

      this.#ReadMatchDistances();
      const posState: CState = this.#nowPos48 & this.#posStateMask;

      this.RangeEnc.encodeBit(
        this.#isMatch,
        (this.#state << kNumPosBitsMax) + posState,
        0,
      );

      this.#state = UpdateState_Literal(this.#state);
      const curByte = this.#matchFinder.getIndexByte(-this.#extraBufofs);

      this.encodeLiteral(
        this.#litenc.getSubCoder(this.#nowPos48, this.#prevByte),
        curByte,
      );

      this.#prevByte = curByte;
      this.#extraBufofs -= 1;
      this.#nowPos48++;
    }

    if (!this.#matchFinder.getNumAvailableBytes()) {
      this.#Flush();
      return;
    }

    while (1) {
      const len: CLen = this.#GetOptimum(this.#nowPos48);
      let pos = this.#backRes;
      const posState = this.#nowPos48 & this.#posStateMask;
      const complexState = (this.#state << 4) + posState;

      if (len == 1 && pos == -1) {
        this.RangeEnc.encodeBit(this.#isMatch, complexState, 0);

        const curByte = this.#matchFinder.getIndexByte(-this.#extraBufofs);

        const subCoder = this.#litenc.getSubCoder(
          this.#nowPos48,
          this.#prevByte,
        );

        if (this.#state < 7) {
          this.encodeLiteral(subCoder, curByte);
        } else {
          const matchByte = this.#matchFinder.getIndexByte(
            -this.#repDistances[0] - 1 - this.#extraBufofs,
          );

          this.encodeMatched(subCoder, matchByte, curByte);
        }
        this.#prevByte = curByte;
        this.#state = UpdateState_Literal(this.#state);
      } else {
        this.RangeEnc.encodeBit(this.#isMatch, complexState, 1);
        let distance;
        if (pos < 4) {
          this.RangeEnc.encodeBit(this.#isRep, this.#state, 1);

          if (!pos) {
            this.RangeEnc.encodeBit(this.#isRepG0, this.#state, 0);

            if (len == 1) {
              this.RangeEnc.encodeBit(this.#isRep0Long, complexState, 0);
            } else {
              this.RangeEnc.encodeBit(this.#isRep0Long, complexState, 1);
            }
          } else {
            this.RangeEnc.encodeBit(this.#isRepG0, this.#state, 1);

            if (pos == 1) {
              this.RangeEnc.encodeBit(this.#isRepG1, this.#state, 0);
            } else {
              this.RangeEnc.encodeBit(this.#isRepG1, this.#state, 1);
              this.RangeEnc.encodeBit(
                this.#isRepG2,
                this.#state,
                (pos - 2) as 0 | 1,
              );
            }
          }

          if (len == 1) {
            this.#state = UpdateState_ShortRep(this.#state);
          } else {
            this.#replenenc.encode(len - 2, posState, this.RangeEnc);
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
          this.RangeEnc.encodeBit(this.#isRep, this.#state, 0);

          this.#state = UpdateState_Match(this.#state);
          this.#lenenc.encode(len - 2, posState, this.RangeEnc);

          pos -= 4;
          const posSlot = getPosSlot(pos);
          const lenToPosState = getLenToPosState(len - kMatchMinLen);
          this.RangeEnc.encodeBitTree(
            this.#posSlotEncoder[lenToPosState],
            posSlot,
          );

          if (posSlot >= 4) {
            const footerBits = (posSlot >> 1) - 1;
            const baseVal = (2 | (posSlot & 1)) << footerBits;
            const posReduced = pos - baseVal;

            if (posSlot < 0x0E) {
              this.reverseEncodeRange(
                baseVal - posSlot - 1,
                footerBits,
                posReduced,
              );
            } else {
              this.RangeEnc.encodeDirectBits(posReduced >> 4, footerBits - 4);
              this.reverseEncode(posReduced & 0xF);
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

        this.#prevByte = this.#matchFinder
          .getIndexByte(len - 1 - this.#extraBufofs);
      }

      this.#extraBufofs -= len;
      this.#nowPos48 += len;

      if (!this.#extraBufofs) {
        if (this.#matchPriceCount >= 128) {
          this.#fillDistancesPrices();
        }

        if (this.#alignPriceCount >= 0x10) {
          this.#fillAlignPrices();
        }

        this.processedInSize = this.#nowPos48;
        //jjjj TOCLEANUP
        // this.#processedOutSize = 4 +
        //   this.RangeEnc.cacheSize + this.RangeEnc.pos;

        if (!this.#matchFinder.getNumAvailableBytes()) {
          this.#Flush();
          return;
        }

        if (this.#nowPos48 - progressPosValuePrev >= 0x1000) {
          this.#blockFinished = false;
          this.finished = false;
          return;
        }
      }
    }
  }

  ReleaseStreams(): void {
    this.#ReleaseMFStream();
    this.RangeEnc.stream = null;
  }
}
/*80--------------------------------------------------------------------------*/
