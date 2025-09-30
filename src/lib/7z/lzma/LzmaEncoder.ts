/** 80**************************************************************************
 * Ref. [[lzma1]/src/encoder.ts](https://github.com/xseman/lzma1/blob/master/src/encoder.ts)
 *    * Refactor heavily
 *
 * @module lib/7z/lzma/LzmaEncoder
 * @license MIT
 ******************************************************************************/

import type { uint, uint32, uint8 } from "@fe-lib/alias.ts";
import "@fe-lib/jslang.ts";
import type { CProb, State } from "./alias.ts";
import {
  kMatchMinLen,
  kNumAlignBits,
  kNumLenToPosStates,
  kNumStates,
  MATCH_DECODERS_SIZE,
  POS_CODERS_SIZE,
} from "./alias.ts";
import { LenEncoder } from "./LenEncoder.ts";
import { LitEncoder } from "./LitEncoder.ts";
import { LzInWindow } from "./LzInWindow.ts";
import type { Mode } from "./Lzma.ts";
import { MatchFinder } from "./MatchFinder.ts";
import { RangeEncoder } from "./RangeEncoder.ts";
import type { BaseStream } from "./streams.ts";
import type { LiteralDecoderEncoder2 } from "./util.ts";
import {
  add64,
  CBitTreeDecoder,
  CRC32_TABLE,
  DICTIONARY_SIZE_THRESHOLD,
  fromInt64,
  G_FAST_POS,
  getBitPrice,
  getLenToPosState,
  INFINITY_PRICE,
  initProbs,
  PROB_PRICES,
  UpdateState_Literal,
  UpdateState_Match,
  UpdateState_Rep,
  UpdateState_ShortRep,
} from "./util.ts";
/*80--------------------------------------------------------------------------*/

const bitTreePriceCache = new Map<string, number>();

/** Get price for bit tree encoding with caching */
function getBitTreePrice(bitTree: CBitTreeDecoder, symbol: number): number {
  const cacheKey = `${bitTree.NumBits}-${symbol}`;

  if (bitTreePriceCache.has(cacheKey)) {
    return bitTreePriceCache.get(cacheKey)!;
  }

  let price = 0;
  let modelIndex = 1;

  for (let bitIndex = bitTree.NumBits; bitIndex > 0; bitIndex--) {
    const bit = (symbol >>> (bitIndex - 1)) & 1;
    price += getBitPrice(bitTree.Probs[modelIndex], bit);
    modelIndex = (modelIndex << 1) + bit;
  }

  if (bitTreePriceCache.size < 10_000) {
    bitTreePriceCache.set(cacheKey, price);
  }

  return price;
}

export interface Optimum {
  state?: State;
  price?: number;
  posPrev?: number;
  backPrev?: number;
  prev1IsChar?: number;
  prev2?: number;
  posPrev2?: number;
  backPrev2?: number;
  backs0?: number;
  backs1?: number;
  backs2?: number;
  backs3?: number;
}

/** LZMA Encoder class that handles compression operations */
export class LzmaEncoder {
  /** Initialized in `Create_2()` */
  #InWindow!: LzInWindow;

  /* Core state properties */
  #state = 0 as State;
  #prevByte: uint8 = 0;
  #distTableSize: uint32 = 0;
  #longestMatchWasFound = 0;
  #optimumEndIndex = 0;
  #optimumCurrentIndex = 0;
  #additionalOffset = 0;
  /* ~ */

  /* Dictionary and match finding */
  #dictSize: uint32 = 0;
  readonly #matchFinder = new MatchFinder();
  #numFastBytes: uint8 = 0;
  /* ~ */

  /* Literal encoding configuration *\
  /** number of literal context bits */
  #lc: uint8 = 0;
  /** number of literal position state bits */
  #lp: uint8 = 0;
  /** position state bits */
  #pb: uint8 = 0;
  readonly _posStateMask: uint8 = 3;
  /* ~ */

  /* Stream and processing state */
  needReleaseMFStream: number = 0;
  inStream: BaseStream | null = null;
  blockFinished = false;
  nowPos48: uint = 0;
  /* ~ */

  /* Distance and repetition arrays */
  readonly _repDistances = Array.from<number>({ length: 4 }).fill(0);
  readonly _optimum: Optimum[] = [];
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
  readonly _posSlotEncoder = Array.from(
    { length: kNumLenToPosStates },
    () => new CBitTreeDecoder(6),
  );
  readonly _posAlignEncoder = new CBitTreeDecoder(kNumAlignBits);
  readonly _posEncoders = Array.mock<CProb>(POS_CODERS_SIZE);

  InitDist() {
    for (let i = 0; i < kNumLenToPosStates; ++i) {
      this._posSlotEncoder[i].Init();
    }
    this._posAlignEncoder.Init();
    initProbs(this._posEncoders);
  }
  /* ~ */

  readonly #lenenc = new LenEncoder();
  readonly #replenenc = new LenEncoder();

  readonly #litenc = new LitEncoder();

  /* Distance and price arrays */
  readonly _matchDistances: number[] = [];
  readonly _posSlotPrices: number[] = [];
  readonly _distancesPrices: number[] = [];
  readonly _alignPrices = Array.mock<number>(16);
  _matchPriceCount: number = 0;
  _alignPriceCount: number = 0;
  /* ~ */

  /* Optimization arrays */
  readonly reps = Array.mock<number>(4);
  readonly repLens = Array.mock<number>(4);
  /* ~ */

  /* Processing counters */
  readonly processedInSize = [0];
  readonly processedOutSize: [number, number][] = [[0, 0]];
  readonly finished: number[] = [0];
  readonly properties = Array.mock<uint8>(5);
  readonly tempPrices = Array.mock<number>(0x80); // 128
  /* ~ */

  /* Match finding properties */
  #longestMatchLen: number = 0;
  #matchFinderType = true;
  #numDistancePairs: number = 0;
  backRes: number = 0;
  /* ~ */

  Init(): void {
    for (let i = 0; i < 0x1000; i++) {
      this._optimum[i] = {};
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
    this.#InWindow = new LzInWindow(this.#matchFinder);
  }

  Init_2() {
    this.#lenenc.Init_2(this.#numFastBytes + 1 - 2);
    this.#replenenc.Init_2(this.#numFastBytes + 1 - 2);
  }

  #Init_5(): void {
    this.#matchFinder.bufferOffset = 0;
    this.#matchFinder.pos = 0;
    this.#matchFinder.streamPos = 0;
    this.#matchFinder.streamEndWasReached = false;
    this.#InWindow.readBlock();

    this.#matchFinder.cyclicBufferPos = 0;
    this.#InWindow.reduceOffsets(-1);
  }
  /*64||||||||||||||||||||||||||||||||||||||||||||||||||||||||||*/

  setEncoderProperties() {
    this.properties[0] = ((this.#pb * 5 + this.#lp) * 9 + this.#lc) & 0xFF;

    /* Next 4 bytes store dictionary size in little-endian format */
    for (let byteIndex = 0; byteIndex < 4; byteIndex++) {
      this.properties[1 + byteIndex] = (this.#dictSize >> (8 * byteIndex)) &
        0xFF;
    }

    this.#litenc.Create({ numPrevBits: this.#lc, numPosBits: this.#lp });

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
  setDictSize(dictSize_x: uint32): void {
    this.#dictSize = dictSize_x;

    let dicLogSize = 0;
    for (; dictSize_x > (1 << dicLogSize); ++dicLogSize);
    this.#distTableSize = dicLogSize * 2;
  }

  encodeLiteral(encoder: LiteralDecoderEncoder2, symbol: number): void {
    let bit, context = 1;

    for (let i = 7; i >= 0; --i) {
      bit = (symbol >> i) & 1;
      this.RangeEnc.encodeBit(encoder.decoders, context, bit);
      context = context << 1 | bit;
    }
  }

  /** Encode matched literal */
  encodeMatched(
    encoder: LiteralDecoderEncoder2,
    matchByte: number,
    symbol: number,
  ): void {
    let bit, matchBit, state, same = true, context = 1;

    for (let i = 7; i >= 0; --i) {
      bit = (symbol >> i) & 1;
      state = context;

      if (same) {
        matchBit = (matchByte >> i) & 1;
        state += (1 + matchBit) << 8;
        same = matchBit === bit;
      }

      this.RangeEnc.encodeBit(encoder.decoders, state, bit);
      context = context << 1 | bit;
    }
  }

  /** Encode length using direct method calls */
  encodeLength(encoder: LenEncoder, symbol: number, posState: number): void {
    encoder.encode(symbol, posState, this.RangeEnc);
  }

  /** Reverse encode */
  reverseEncode(symbol: number): void {
    const posAlignEncoder = this._posAlignEncoder;
    if (!posAlignEncoder) return;

    let bit, m = 1;

    for (let i = 0; i < posAlignEncoder.NumBits; ++i) {
      bit = symbol & 1;
      this.RangeEnc.encodeBit(posAlignEncoder.Probs, m, bit);
      m = m << 1 | bit;
      symbol >>= 1;
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
      bit = symbol & 1;
      this.RangeEnc.encodeBit(this._posEncoders, startIndex + m, bit);
      m = m << 1 | bit;
      symbol >>= 1;
    }
  }

  /** Write end marker */
  writeEndMarker(positionState: number): void {
    this.RangeEnc.encodeBit(
      this.#isMatch,
      (this.#state << 4) + positionState,
      1,
    );

    this.RangeEnc.encodeBit(this.#isRep, this.#state, 0);

    this.#state = UpdateState_Match(this.#state);
    this.encodeLength(this.#lenenc, 0, positionState);

    const posSlot = 63;
    const lenToPosState = 0;

    this.RangeEnc.encodeBitTree(this._posSlotEncoder[lenToPosState], posSlot);

    this.RangeEnc.encodeDirectBits(0x3ff_ffff, 26);
    this.reverseEncode(15);
  }

  /** Fill alignment prices for position alignment encoder */
  fillAlignPrices(): void {
    for (let i = 0; i < 16; ++i) {
      this._alignPrices[i] = this.reverseGetPrice(this._posAlignEncoder!, i);
    }
    this._alignPriceCount = 0;
  }

  /** Fill distance prices for position encoders */
  fillDistancesPrices(): void {
    let baseVal, bitTreeEncoder: CBitTreeDecoder, footerBits, posSlot, st, st2;

    for (let i = 4; i < 0x80; ++i) {
      posSlot = this.getPosSlot(i);
      footerBits = (posSlot >> 1) - 1;
      baseVal = (2 | (posSlot & 1)) << footerBits;

      this.tempPrices[i] = this.reverseGetPriceArray(
        this._posEncoders,
        baseVal - posSlot - 1,
        footerBits,
        i - baseVal,
      );
    }

    for (let lenToPosState = 0; lenToPosState < 4; ++lenToPosState) {
      bitTreeEncoder = this._posSlotEncoder[lenToPosState];
      st = lenToPosState << 6;

      for (posSlot = 0; posSlot < this.#distTableSize; posSlot += 1) {
        this._posSlotPrices[st + posSlot] = this.rangeCoder_Encoder_GetPrice_1(
          bitTreeEncoder,
          posSlot,
        );
      }

      for (posSlot = 14; posSlot < this.#distTableSize; posSlot += 1) {
        this._posSlotPrices[st + posSlot] += (posSlot >> 1) - 1 - 4 << 6;
      }

      st2 = lenToPosState * 0x80;
      for (let i = 0; i < 4; ++i) {
        this._distancesPrices[st2 + i] = this._posSlotPrices[st + i];
      }

      for (let i = 4; i < 0x80; ++i) {
        this._distancesPrices[st2 + i] =
          this._posSlotPrices[st + this.getPosSlot(i)] + this.tempPrices[i];
      }
    }

    this._matchPriceCount = 0;
  }

  /** Get position slot for a distance value */
  getPosSlot(pos: number): number {
    if (pos < 0x800) return G_FAST_POS[pos];
    if (pos < 0x20_0000) return G_FAST_POS[pos >> 10] + 20;

    return G_FAST_POS[pos >> 20] + 40;
  }

  /** Get reverse price for bit tree encoder */
  reverseGetPrice(encoder: CBitTreeDecoder, symbol: number): number {
    let bit, m = 1, price = 0;

    for (let i = encoder.NumBits; i != 0; i -= 1) {
      bit = symbol & 1;
      symbol >>>= 1;
      price += this.getPrice(encoder.Probs[m], bit);
      m = m << 1 | bit;
    }

    return price;
  }

  /** Get reverse price for array of models */
  reverseGetPriceArray(
    Models: number[],
    startIndex: number,
    NumBitLevels: number,
    symbol: number,
  ): number {
    let bit, m = 1, price = 0;

    for (let i = NumBitLevels; i != 0; i -= 1) {
      bit = symbol & 1;
      symbol >>>= 1;
      price +=
        PROB_PRICES[((Models[startIndex + m] - bit ^ -bit) & 2047) >>> 2];
      m = m << 1 | bit;
    }

    return price;
  }

  /** Get price for probability model (optimized) */
  getPrice(CProb: number, symbol: number): number {
    return getBitPrice(CProb, symbol);
  }

  /** Get price for bit tree encoder (optimized) */
  rangeCoder_Encoder_GetPrice_1(
    encoder: CBitTreeDecoder,
    symbol: number,
  ): number {
    return getBitTreePrice(encoder, symbol);
  }
  /*64||||||||||||||||||||||||||||||||||||||||||||||||||||||||||*/

  #MovePos_1(): void {
    const matchFinder = this.#matchFinder;
    let pointerToPostion;

    matchFinder.pos += 1;

    if (matchFinder.pos > matchFinder.posLimit) {
      pointerToPostion = matchFinder.bufferOffset + matchFinder.pos;

      if (pointerToPostion > matchFinder.ptToLastSafePos) {
        this.#InWindow.moveBlock();
      }

      this.#InWindow.readBlock();
    }
  }

  #GetMatches(): number {
    let count,
      curMatch,
      curMatch2,
      curMatch3,
      cyclicPos,
      delta,
      hash2Value,
      hash3Value,
      hashValue,
      len,
      len0,
      len1,
      lenLimit,
      maxLen,
      offset,
      pby1,
      ptr0,
      ptr1,
      temp;

    const matchFinder = this.#matchFinder;
    const distances = this._matchDistances;

    if (matchFinder.pos + matchFinder.matchMaxLen <= matchFinder.streamPos) {
      lenLimit = matchFinder.matchMaxLen;
    } else {
      lenLimit = matchFinder.streamPos - matchFinder.pos;
      if (lenLimit < matchFinder.kMinMatchCheck) {
        this.#MovePos_0();
        return 0;
      }
    }

    offset = 0;
    const matchMinPos = matchFinder.pos > matchFinder.cyclicBufferSize
      ? matchFinder.pos - matchFinder.cyclicBufferSize
      : 0;

    const cur = matchFinder.bufferOffset + matchFinder.pos;
    maxLen = 1;
    hash2Value = 0;
    hash3Value = 0;

    if (matchFinder.HASH_ARRAY) {
      temp = CRC32_TABLE[matchFinder.bufferBase[cur] & 0xFF] ^
        (matchFinder.bufferBase[cur + 1] & 0xFF);
      hash2Value = temp & 0x3FF;
      temp ^= (matchFinder.bufferBase[cur + 2] & 0xFF) << 8;
      hash3Value = temp & 0xFFFF;
      hashValue =
        (temp ^ (CRC32_TABLE[matchFinder.bufferBase[cur + 3] & 0xFF] << 5)) &
        matchFinder.hashMask;
    } else {
      hashValue = (matchFinder.bufferBase[cur] & 0xFF) ^
        ((matchFinder.bufferBase[cur + 1] & 0xFF) << 8);
    }

    curMatch = matchFinder.hash[matchFinder.kFixHashSize + hashValue] || 0;
    if (matchFinder.HASH_ARRAY) {
      curMatch2 = matchFinder.hash[hash2Value] || 0;
      curMatch3 = matchFinder.hash[0x400 + hash3Value] || 0;
      matchFinder.hash[hash2Value] = matchFinder.pos;
      matchFinder.hash[0x400 + hash3Value] = matchFinder.pos;

      if (curMatch2 > matchMinPos) {
        if (
          matchFinder.bufferBase[matchFinder.bufferOffset + curMatch2] ==
            matchFinder.bufferBase[cur]
        ) {
          distances[offset++] = maxLen = 2;
          distances[offset++] = matchFinder.pos - curMatch2 - 1;
        }
      }

      if (curMatch3 > matchMinPos) {
        if (
          matchFinder.bufferBase[matchFinder.bufferOffset + curMatch3] ==
            matchFinder.bufferBase[cur]
        ) {
          if (curMatch3 == curMatch2) {
            offset -= 2;
          }
          distances[offset++] = maxLen = 3;
          distances[offset++] = matchFinder.pos - curMatch3 - 1;
          curMatch2 = curMatch3;
        }
      }

      if (offset != 0 && curMatch2 == curMatch) {
        offset -= 2;
        maxLen = 1;
      }
    }

    matchFinder.hash[matchFinder.kFixHashSize + hashValue] = matchFinder.pos;
    ptr0 = (matchFinder.cyclicBufferPos << 1) + 1;
    ptr1 = matchFinder.cyclicBufferPos << 1;
    len0 = len1 = matchFinder.kNumHashDirectBytes;

    if (matchFinder.kNumHashDirectBytes != 0) {
      if (curMatch > matchMinPos) {
        if (
          matchFinder.bufferBase[
            matchFinder.bufferOffset + curMatch +
            matchFinder.kNumHashDirectBytes
          ] != matchFinder.bufferBase[cur + matchFinder.kNumHashDirectBytes]
        ) {
          distances[offset++] = maxLen = matchFinder.kNumHashDirectBytes;
          distances[offset++] = matchFinder.pos - curMatch - 1;
        }
      }
    }
    count = matchFinder.cutValue;

    while (1) {
      if (curMatch <= matchMinPos || count == 0) {
        count -= 1;
        matchFinder.son[ptr0] = matchFinder.son[ptr1] = 0;
        break;
      }
      delta = matchFinder.pos - curMatch;

      cyclicPos = (delta <= matchFinder.cyclicBufferPos
        ? matchFinder.cyclicBufferPos - delta
        : matchFinder.cyclicBufferPos - delta +
          matchFinder.cyclicBufferSize) << 1;

      pby1 = matchFinder.bufferOffset + curMatch;
      len = len0 < len1 ? len0 : len1;

      if (
        matchFinder.bufferBase[pby1 + len] == matchFinder.bufferBase[cur + len]
      ) {
        while ((len += 1) != lenLimit) {
          if (
            matchFinder.bufferBase[pby1 + len] !=
              matchFinder.bufferBase[cur + len]
          ) {
            break;
          }
        }

        if (maxLen < len) {
          distances[offset++] = maxLen = len;
          distances[offset++] = delta - 1;
          if (len == lenLimit) {
            matchFinder.son[ptr1] = matchFinder.son[cyclicPos];
            matchFinder.son[ptr0] = matchFinder.son[cyclicPos + 1];
            break;
          }
        }
      }

      if (
        (matchFinder.bufferBase[pby1 + len] & 0xFF) <
          (matchFinder.bufferBase[cur + len] & 0xFF)
      ) {
        matchFinder.son[ptr1] = curMatch;
        ptr1 = cyclicPos + 1;
        curMatch = matchFinder.son[ptr1];
        len1 = len;
      } else {
        matchFinder.son[ptr0] = curMatch;
        ptr0 = cyclicPos;
        curMatch = matchFinder.son[ptr0];
        len0 = len;
      }
    }

    this.#MovePos_0();
    return offset;
  }

  #MovePos_0(): void {
    let subValue;
    const matchFinder = this.#matchFinder;

    if ((matchFinder.cyclicBufferPos += 1) >= matchFinder.cyclicBufferSize) {
      matchFinder.cyclicBufferPos = 0;
    }

    this.#MovePos_1();

    if (matchFinder.pos == DICTIONARY_SIZE_THRESHOLD) {
      subValue = matchFinder.pos - matchFinder.cyclicBufferSize;

      this.#NormalizeLinks(matchFinder.cyclicBufferSize * 2, subValue);
      this.#NormalizeLinks(matchFinder.hashSizeSum, subValue);

      this.#InWindow.reduceOffsets(subValue);
    }
  }

  /** This is only called after reading one whole gigabyte. */
  #NormalizeLinks(numItems: number, subValue: number): void {
    const items = this.#matchFinder.son;

    for (let i = 0, value; i < numItems; ++i) {
      value = items[i] || 0;
      if (value <= subValue) value = 0;
      else value -= subValue;
      items[i] = value;
    }
  }

  #Skip(num: number): void {
    const matchFinder = this.#matchFinder;

    let count,
      cur,
      curMatch,
      cyclicPos,
      delta,
      hash2Value,
      hash3Value,
      hashValue,
      len,
      len0,
      len1,
      lenLimit,
      matchMinPos,
      pby1,
      ptr0,
      ptr1,
      temp;

    do {
      if (matchFinder.pos + matchFinder.matchMaxLen <= matchFinder.streamPos) {
        lenLimit = matchFinder.matchMaxLen;
      } else {
        lenLimit = matchFinder.streamPos - matchFinder.pos;
        if (lenLimit < matchFinder.kMinMatchCheck) {
          this.#MovePos_0();
          continue;
        }
      }

      matchMinPos = matchFinder.pos > matchFinder.cyclicBufferSize
        ? matchFinder.pos - matchFinder.cyclicBufferSize
        : 0;

      cur = matchFinder.bufferOffset + matchFinder.pos;

      if (matchFinder.HASH_ARRAY) {
        temp = CRC32_TABLE[matchFinder.bufferBase[cur] & 0xFF] ^
          (matchFinder.bufferBase[cur + 1] & 0xFF);
        hash2Value = temp & 0x3FF;
        matchFinder.hash[hash2Value] = matchFinder.pos;
        temp ^= (matchFinder.bufferBase[cur + 2] & 0xFF) << 8;
        hash3Value = temp & 0xFFFF;
        matchFinder.hash[0x400 + hash3Value] = matchFinder.pos;
        hashValue =
          (temp ^ (CRC32_TABLE[matchFinder.bufferBase[cur + 3] & 0xFF] << 5)) &
          matchFinder.hashMask;
      } else {
        hashValue = (matchFinder.bufferBase[cur] & 0xFF) ^
          ((matchFinder.bufferBase[cur + 1] & 0xFF) << 8);
      }

      curMatch = matchFinder.hash[matchFinder.kFixHashSize + hashValue];
      matchFinder.hash[matchFinder.kFixHashSize + hashValue] = matchFinder.pos;
      ptr0 = (matchFinder.cyclicBufferPos << 1) + 1;
      ptr1 = matchFinder.cyclicBufferPos << 1;
      len0 = len1 = matchFinder.kNumHashDirectBytes;
      count = matchFinder.cutValue;

      while (1) {
        if (curMatch <= matchMinPos || count == 0) {
          count -= 1;
          matchFinder.son[ptr0] = matchFinder.son[ptr1] = 0;
          break;
        }
        delta = matchFinder.pos - curMatch;

        cyclicPos = (delta <= matchFinder.cyclicBufferPos
          ? matchFinder.cyclicBufferPos - delta
          : matchFinder.cyclicBufferPos - delta +
            matchFinder.cyclicBufferSize) << 1;

        pby1 = matchFinder.bufferOffset + curMatch;

        len = len0 < len1 ? len0 : len1;

        if (
          matchFinder.bufferBase[pby1 + len] ==
            matchFinder.bufferBase[cur + len]
        ) {
          while ((len += 1) != lenLimit) {
            if (
              matchFinder.bufferBase[pby1 + len] !=
                matchFinder.bufferBase[cur + len]
            ) {
              break;
            }
          }

          if (len == lenLimit) {
            matchFinder.son[ptr1] = matchFinder.son[cyclicPos];
            matchFinder.son[ptr0] = matchFinder.son[cyclicPos + 1];
            break;
          }
        }

        if (
          (matchFinder.bufferBase[pby1 + len] & 0xFF) <
            (matchFinder.bufferBase[cur + len] & 0xFF)
        ) {
          matchFinder.son[ptr1] = curMatch;
          ptr1 = cyclicPos + 1;
          curMatch = matchFinder.son[ptr1];
          len1 = len;
        } else {
          matchFinder.son[ptr0] = curMatch;
          ptr0 = cyclicPos;
          curMatch = matchFinder.son[ptr0];
          len0 = len;
        }
      }
      this.#MovePos_0();
    } while ((num -= 1) != 0);
  }

  #Backward(cur: number): number {
    let backCur, backMem, posMem, posPrev;

    this.#optimumEndIndex = cur;
    posMem = this._optimum[cur].posPrev;
    backMem = this._optimum[cur].backPrev;

    do {
      if (this._optimum[cur].prev1IsChar) {
        this.#MakeAsChar(this._optimum[posMem!]);
        this._optimum[posMem!].posPrev = posMem! - 1;

        if (this._optimum[cur].prev2) {
          this._optimum[posMem! - 1].prev1IsChar = 0;
          this._optimum[posMem! - 1].posPrev = this._optimum[cur].posPrev2!;
          this._optimum[posMem! - 1].backPrev = this._optimum[cur].backPrev2!;
        }
      }

      posPrev = posMem;
      backCur = backMem;
      backMem = this._optimum[posPrev!].backPrev;
      posMem = this._optimum[posPrev!].posPrev;
      this._optimum[posPrev!].backPrev = backCur!;
      this._optimum[posPrev!].posPrev = cur;
      cur = posPrev!;
    } while (cur > 0);

    this.backRes = this._optimum[0].backPrev!;
    this.#optimumCurrentIndex = this._optimum[0].posPrev!;

    return this.#optimumCurrentIndex;
  }

  #FillAlignPrices(): void {
    for (let i = 0; i < 16; ++i) {
      this._alignPrices[i] = this.#ReverseGetPrice(this._posAlignEncoder!, i);
    }

    this._alignPriceCount = 0;
  }

  #Flush(nowPos: uint): void {
    this.#ReleaseMFStream();
    this.writeEndMarker(nowPos & this._posStateMask);

    for (let i = 0; i < 5; ++i) {
      this.RangeEnc.shiftLow();
    }
  }

  #GetOptimum(position: number) {
    let cur,
      curAnd1Price,
      curAndLenCharPrice,
      curAndLenPrice,
      curBack,
      curPrice,
      currentByte,
      distance,
      len,
      lenEnd,
      lenMain,
      lenTest,
      lenTest2,
      lenTestTemp,
      matchByte,
      matchPrice,
      newLen,
      nextIsChar,
      nextMatchPrice,
      nextOptimum,
      nextRepMatchPrice,
      normalMatchPrice,
      numAvailableBytes,
      numAvailableBytesFull,
      numDistancePairs,
      offs,
      offset,
      opt,
      optimum,
      pos,
      posPrev,
      posState,
      posStateNext,
      price_4,
      repIndex,
      repLen,
      repMatchPrice,
      repMaxIndex,
      shortRepPrice,
      startLen,
      state: State | undefined,
      state2: State | undefined,
      t,
      price,
      price_0,
      price_1,
      price_2,
      price_3,
      lenRes;

    if (this.#optimumEndIndex != this.#optimumCurrentIndex) {
      lenRes = this._optimum[this.#optimumCurrentIndex].posPrev! -
        this.#optimumCurrentIndex;
      this.backRes = this._optimum[this.#optimumCurrentIndex]
        .backPrev!;
      this.#optimumCurrentIndex = this
        ._optimum[this.#optimumCurrentIndex].posPrev!;

      return lenRes;
    }

    this.#optimumCurrentIndex = this.#optimumEndIndex = 0;
    if (this.#longestMatchWasFound) {
      lenMain = this.#longestMatchLen;
      this.#longestMatchWasFound = 0;
    } else {
      lenMain = this.#ReadMatchDistances();
    }

    numDistancePairs = this.#numDistancePairs;
    numAvailableBytes = this.#InWindow.getNumAvailableBytes() + 1;

    if (numAvailableBytes < 2) {
      this.backRes = -1;
      return 1;
    }

    if (numAvailableBytes > 0x111) {
      numAvailableBytes = 0x111;
    }

    repMaxIndex = 0;
    for (let i = 0; i < 4; ++i) {
      this.reps[i] = this._repDistances[i];
      this.repLens[i] = this.#InWindow.getMatchLen(-1, this.reps[i], 0x111);

      if (this.repLens[i] > this.repLens[repMaxIndex]) {
        repMaxIndex = i;
      }
    }

    if (this.repLens[repMaxIndex] >= this.#numFastBytes) {
      this.backRes = repMaxIndex;
      lenRes = this.repLens[repMaxIndex];
      this.#MovePos(lenRes - 1);

      return lenRes;
    }

    if (lenMain >= this.#numFastBytes) {
      this.backRes = this._matchDistances[numDistancePairs - 1] + 4;

      this.#MovePos(lenMain - 1);
      return lenMain;
    }

    currentByte = this.#InWindow.getIndexByte(-1);
    matchByte = this.#InWindow.getIndexByte(-this._repDistances[0] - 1 - 1);

    if (
      lenMain < 2 && currentByte != matchByte && this.repLens[repMaxIndex] < 2
    ) {
      this.backRes = -1;
      return 1;
    }

    this._optimum[0].state = this.#state;
    posState = position & this._posStateMask;
    this._optimum[1].price =
      PROB_PRICES[(this.#isMatch[(this.#state << 4) + posState]) >>> 2] +
      this.#RangeCoder_Encoder_GetPrice_0(
        this.#LZMA_Encoder_GetSubCoder(position, this.#prevByte),
        this.#state >= 7,
        matchByte,
        currentByte,
      );

    this.#MakeAsChar(this._optimum[1]);
    matchPrice =
      PROB_PRICES[(2048 - this.#isMatch[(this.#state << 4) + posState]) >>> 2];

    repMatchPrice = matchPrice +
      PROB_PRICES[(2048 - this.#isRep[this.#state]) >>> 2];

    if (matchByte == currentByte) {
      shortRepPrice = repMatchPrice + this.#GetRepLen1Price(posState);
      if (shortRepPrice < this._optimum[1].price) {
        this._optimum[1].price = shortRepPrice;
        this.#MakeAsShortRep(this._optimum[1]);
      }
    }

    lenEnd = lenMain >= this.repLens[repMaxIndex]
      ? lenMain
      : this.repLens[repMaxIndex];

    if (lenEnd < 2) {
      this.backRes = this._optimum[1].backPrev!;
      return 1;
    }

    this._optimum[1].posPrev = 0;
    this._optimum[0].backs0 = this.reps[0];
    this._optimum[0].backs1 = this.reps[1];
    this._optimum[0].backs2 = this.reps[2];
    this._optimum[0].backs3 = this.reps[3];
    len = lenEnd;

    do {
      this._optimum[len].price = INFINITY_PRICE;
      len -= 1;
    } while (len >= 2);

    for (let i = 0; i < 4; ++i) {
      repLen = this.repLens[i];
      if (repLen < 2) continue;

      price_4 = repMatchPrice + this.#GetPureRepPrice(i, this.#state, posState);

      do {
        curAndLenPrice = price_4 +
          this.#replenenc.getPrice(repLen - 2, posState);
        optimum = this._optimum[repLen];
        if (curAndLenPrice < optimum.price!) {
          optimum.price = curAndLenPrice;
          optimum.posPrev = 0;
          optimum.backPrev = i;
          optimum.prev1IsChar = 0;
        }
      } while ((repLen -= 1) >= 2);
    }

    normalMatchPrice = matchPrice +
      PROB_PRICES[(this.#isRep[this.#state]) >>> 2];

    len = this.repLens[0] >= 2 ? this.repLens[0] + 1 : 2;

    if (len <= lenMain) {
      offs = 0;
      while (len > this._matchDistances[offs]) {
        offs += 2;
      }

      for (;; len += 1) {
        distance = this._matchDistances[offs + 1];
        curAndLenPrice = normalMatchPrice +
          this.#LZMA_Encoder_GetPosLenPrice(distance, len, posState);
        optimum = this._optimum[len];

        if (curAndLenPrice < optimum.price!) {
          optimum.price = curAndLenPrice;
          optimum.posPrev = 0;
          optimum.backPrev = distance + 4;
          optimum.prev1IsChar = 0;
        }

        if (len == this._matchDistances[offs]) {
          offs += 2;
          if (offs == numDistancePairs) break;
        }
      }
    }
    cur = 0;

    while (1) {
      ++cur;
      if (cur == lenEnd) return this.#Backward(cur);

      newLen = this.#ReadMatchDistances();
      numDistancePairs = this.#numDistancePairs;

      if (newLen >= this.#numFastBytes) {
        this.#longestMatchLen = newLen;
        this.#longestMatchWasFound = 1;
        return this.#Backward(cur);
      }

      position += 1;
      posPrev = this._optimum[cur].posPrev;

      if (this._optimum[cur].prev1IsChar) {
        posPrev! -= 1;
        if (this._optimum[cur].prev2) {
          state = this._optimum[this._optimum[cur].posPrev2!].state;
          if (this._optimum[cur].backPrev2! < 4) {
            state = ((state! < 7) ? 8 : 11) as State;
          } else {
            state = ((state! < 7) ? 7 : 10) as State;
          }
        } else {
          state = this._optimum[posPrev!].state;
        }
        state = UpdateState_Literal(state!);
      } else {
        state = this._optimum[posPrev!].state;
      }

      if (posPrev! == cur - 1) {
        if (!this._optimum[cur].backPrev) {
          state = UpdateState_ShortRep(state!);
        } else {
          state = UpdateState_Literal(state!);
        }
      } else {
        if (this._optimum[cur].prev1IsChar && this._optimum[cur].prev2) {
          posPrev = this._optimum[cur].posPrev2;
          pos = this._optimum[cur].backPrev2;
          state = UpdateState_Rep(state!);
        } else {
          pos = this._optimum[cur].backPrev;
          if (pos! < 4) {
            state = UpdateState_Rep(state!);
          } else {
            state = UpdateState_Match(state!);
          }
        }
        opt = this._optimum[posPrev!];

        if (pos! < 4) {
          if (!pos) {
            this.reps[0] = opt.backs0!;
            this.reps[1] = opt.backs1!;
            this.reps[2] = opt.backs2!;
            this.reps[3] = opt.backs3!;
          } else if (pos == 1) {
            this.reps[0] = opt.backs1!;
            this.reps[1] = opt.backs0!;
            this.reps[2] = opt.backs2!;
            this.reps[3] = opt.backs3!;
          } else if (pos == 2) {
            this.reps[0] = opt.backs2!;
            this.reps[1] = opt.backs0!;
            this.reps[2] = opt.backs1!;
            this.reps[3] = opt.backs3!;
          } else {
            this.reps[0] = opt.backs3!;
            this.reps[1] = opt.backs0!;
            this.reps[2] = opt.backs1!;
            this.reps[3] = opt.backs2!;
          }
        } else {
          this.reps[0] = pos! - 4;
          this.reps[1] = opt.backs0!;
          this.reps[2] = opt.backs1!;
          this.reps[3] = opt.backs2!;
        }
      }

      this._optimum[cur].state = state;
      this._optimum[cur].backs0 = this.reps[0];
      this._optimum[cur].backs1 = this.reps[1];
      this._optimum[cur].backs2 = this.reps[2];
      this._optimum[cur].backs3 = this.reps[3];
      curPrice = this._optimum[cur].price;

      currentByte = this.#InWindow.getIndexByte(-1);
      matchByte = this.#InWindow.getIndexByte(-this.reps[0] - 1 - 1);

      posState = position & this._posStateMask;
      curAnd1Price = curPrice! +
        PROB_PRICES[(this.#isMatch[(state! << 4) + posState]) >>> 2] +
        this.#RangeCoder_Encoder_GetPrice_0(
          this.#LZMA_Encoder_GetSubCoder(
            position,
            this.#InWindow.getIndexByte(-2),
          ),
          state! >= 7,
          matchByte,
          currentByte,
        );

      nextOptimum = this._optimum[cur + 1];
      nextIsChar = 0;

      if (curAnd1Price < nextOptimum.price!) {
        nextOptimum.price = curAnd1Price;
        nextOptimum.posPrev = cur;
        nextOptimum.backPrev = -1;
        nextOptimum.prev1IsChar = 0;
        nextIsChar = 1;
      }

      matchPrice = curPrice! + PROB_PRICES[
        (2048 - this.#isMatch[(state! << 4) + posState]) >>> 2
      ];

      repMatchPrice = matchPrice +
        PROB_PRICES[(2048 - this.#isRep[state!]) >>> 2];

      if (
        matchByte == currentByte &&
        !(nextOptimum.posPrev! < cur && !nextOptimum.backPrev)
      ) {
        shortRepPrice = repMatchPrice +
          (PROB_PRICES[(this.#isRepG0[state!]) >>> 0x02] +
            PROB_PRICES[
              (this.#isRep0Long[(state! << 4) + posState]) >>> 0x02
            ]);

        if (shortRepPrice <= nextOptimum.price!) {
          nextOptimum.price = shortRepPrice;
          nextOptimum.posPrev = cur;
          nextOptimum.backPrev = 0;
          nextOptimum.prev1IsChar = 0;
          nextIsChar = 1;
        }
      }

      numAvailableBytesFull = this.#InWindow.getNumAvailableBytes() + 1;
      numAvailableBytesFull = 0xFFF - cur < numAvailableBytesFull
        ? 0xFFF - cur
        : numAvailableBytesFull;

      numAvailableBytes = numAvailableBytesFull;

      if (numAvailableBytes < 2) continue;

      if (numAvailableBytes > this.#numFastBytes) {
        numAvailableBytes = this.#numFastBytes;
      }

      if (!nextIsChar && matchByte != currentByte) {
        t = Math.min(numAvailableBytesFull - 1, this.#numFastBytes);
        lenTest2 = this.#InWindow.getMatchLen(0, this.reps[0], t);

        if (lenTest2 >= 2) {
          state2 = UpdateState_Literal(state);
          posStateNext = position + 1 & this._posStateMask;
          nextRepMatchPrice = curAnd1Price +
            PROB_PRICES[
              (2048 - this.#isMatch[(state2 << 4) + posStateNext]) >>> 2
            ] +
            PROB_PRICES[(2048 - this.#isRep[state2]) >>> 2];

          offset = cur + 1 + lenTest2;

          while (lenEnd < offset) {
            this._optimum[lenEnd += 1].price = INFINITY_PRICE;
          }

          curAndLenPrice = nextRepMatchPrice +
            (price = this.#replenenc.getPrice(lenTest2 - 2, posStateNext),
              price + this.#GetPureRepPrice(0, state2, posStateNext));
          optimum = this._optimum[offset];

          if (curAndLenPrice < optimum.price!) {
            optimum.price = curAndLenPrice;
            optimum.posPrev = cur + 1;
            optimum.backPrev = 0;
            optimum.prev1IsChar = 1;
            optimum.prev2 = 0;
          }
        }
      }
      startLen = 0x02;

      for (repIndex = 0; repIndex < 4; ++repIndex) {
        lenTest = this.#InWindow.getMatchLen(
          -1,
          this.reps[repIndex],
          numAvailableBytes,
        );

        if (lenTest < 2) continue;

        lenTestTemp = lenTest;

        do {
          while (lenEnd < cur + lenTest) {
            this._optimum[lenEnd += 1].price = INFINITY_PRICE;
          }

          curAndLenPrice = repMatchPrice +
            (price_0 = this.#replenenc.getPrice(lenTest - 2, posState),
              price_0 + this.#GetPureRepPrice(repIndex, state, posState));

          optimum = this._optimum[cur + lenTest];

          if (curAndLenPrice < optimum.price!) {
            optimum.price = curAndLenPrice;
            optimum.posPrev = cur;
            optimum.backPrev = repIndex;
            optimum.prev1IsChar = 0;
          }
        } while ((lenTest -= 1) >= 2);

        lenTest = lenTestTemp;

        if (!repIndex) {
          startLen = lenTest + 1;
        }

        if (lenTest < numAvailableBytesFull) {
          t = Math.min(
            numAvailableBytesFull - 1 - lenTest,
            this.#numFastBytes,
          );
          lenTest2 = this.#InWindow.getMatchLen(
            lenTest,
            this.reps[repIndex],
            t,
          );

          if (lenTest2 >= 2) {
            state2 = UpdateState_Rep(state);
            posStateNext = position + lenTest & this._posStateMask;
            curAndLenCharPrice = repMatchPrice +
              (price_1 = this.#replenenc.getPrice(lenTest - 2, posState),
                price_1 + this.#GetPureRepPrice(repIndex, state, posState)) +
              PROB_PRICES[
                (this.#isMatch[(state2 << 4) + posStateNext]) >>> 2
              ] +
              this.#RangeCoder_Encoder_GetPrice_0(
                this.#LZMA_Encoder_GetSubCoder(
                  position + lenTest,
                  this.#InWindow.getIndexByte(lenTest - 1 - 1),
                ),
                true,
                this.#InWindow.getIndexByte(
                  lenTest - 1 - (this.reps[repIndex] + 1),
                ),
                this.#InWindow.getIndexByte(lenTest - 1),
              );

            state2 = UpdateState_Literal(state2);
            posStateNext = position + lenTest + 1 & this._posStateMask;

            nextMatchPrice = curAndLenCharPrice + PROB_PRICES[
              (2048 - this.#isMatch[(state2 << 4) + posStateNext]) >>> 2
            ];

            nextRepMatchPrice = nextMatchPrice + PROB_PRICES[
              (2048 - this.#isRep[state2]) >>> 2
            ];

            offset = lenTest + 1 + lenTest2;

            while (lenEnd < cur + offset) {
              this._optimum[lenEnd += 1].price = INFINITY_PRICE;
            }

            curAndLenPrice = nextRepMatchPrice +
              (price_2 = this.#replenenc.getPrice(lenTest2 - 2, posStateNext),
                price_2 + this.#GetPureRepPrice(0, state2, posStateNext));
            optimum = this._optimum[cur + offset];

            if (curAndLenPrice < optimum.price!) {
              optimum.price = curAndLenPrice;
              optimum.posPrev = cur + lenTest + 1;
              optimum.backPrev = 0;
              optimum.prev1IsChar = 1;
              optimum.prev2 = 1;
              optimum.posPrev2 = cur;
              optimum.backPrev2 = repIndex;
            }
          }
        }
      }

      if (newLen > numAvailableBytes) {
        newLen = numAvailableBytes;
        for (
          numDistancePairs = 0;
          newLen > this._matchDistances[numDistancePairs];
          numDistancePairs += 2
        ) {}
        this._matchDistances[numDistancePairs] = newLen;
        numDistancePairs += 2;
      }

      if (newLen >= startLen) {
        normalMatchPrice = matchPrice +
          PROB_PRICES[(this.#isRep[state]) >>> 2];

        while (lenEnd < cur + newLen) {
          this._optimum[lenEnd += 1].price = INFINITY_PRICE;
        }
        offs = 0;

        while (startLen > this._matchDistances[offs]) {
          offs += 2;
        }
        for (lenTest = startLen;; lenTest += 1) {
          curBack = this._matchDistances[offs + 1];
          curAndLenPrice = normalMatchPrice +
            this.#LZMA_Encoder_GetPosLenPrice(curBack, lenTest, posState);
          optimum = this._optimum[cur + lenTest];

          if (curAndLenPrice < optimum.price!) {
            optimum.price = curAndLenPrice;
            optimum.posPrev = cur;
            optimum.backPrev = curBack + 4;
            optimum.prev1IsChar = 0;
          }

          if (lenTest == this._matchDistances[offs]) {
            if (lenTest < numAvailableBytesFull) {
              t = Math.min(
                numAvailableBytesFull - 1 - lenTest,
                this.#numFastBytes,
              );
              lenTest2 = this.#InWindow.getMatchLen(lenTest, curBack, t);

              if (lenTest2 >= 2) {
                state2 = UpdateState_Match(state);
                posStateNext = position + lenTest & this._posStateMask;

                curAndLenCharPrice = curAndLenPrice +
                  PROB_PRICES[
                    (this.#isMatch[(state2 << 4) + posStateNext]) >>> 2
                  ] +
                  this.#RangeCoder_Encoder_GetPrice_0(
                    this.#LZMA_Encoder_GetSubCoder(
                      position + lenTest,
                      this.#InWindow.getIndexByte(lenTest - 1 - 1),
                    ),
                    true,
                    this.#InWindow.getIndexByte(lenTest - (curBack + 1) - 1),
                    this.#InWindow.getIndexByte(lenTest - 1),
                  );

                state2 = UpdateState_Literal(state2);
                posStateNext = position + lenTest + 1 & this._posStateMask;

                nextMatchPrice = curAndLenCharPrice + PROB_PRICES[
                  (2048 - this.#isMatch[(state2 << 4) + posStateNext]) >>> 2
                ];

                nextRepMatchPrice = nextMatchPrice +
                  PROB_PRICES[(2048 - this.#isRep[state2]) >>> 2];
                offset = lenTest + 1 + lenTest2;

                while (lenEnd < cur + offset) {
                  this._optimum[lenEnd += 1].price = INFINITY_PRICE;
                }

                curAndLenPrice = nextRepMatchPrice +
                  (price_3 = this.#replenenc
                    .getPrice(lenTest2 - 2, posStateNext),
                    price_3 + this.#GetPureRepPrice(0, state2, posStateNext));
                optimum = this._optimum[cur + offset];

                if (curAndLenPrice < optimum.price!) {
                  optimum.price = curAndLenPrice;
                  optimum.posPrev = cur + lenTest + 1;
                  optimum.backPrev = 0;
                  optimum.prev1IsChar = 1;
                  optimum.prev2 = 1;
                  optimum.posPrev2 = cur;
                  optimum.backPrev2 = curBack + 4;
                }
              }
            }
            offs += 2;

            if (offs == numDistancePairs) break;
          }
        }
      }
    }

    /* Fallback return - should not be reached in normal execution */
    return 1;
  }

  #LZMA_Encoder_GetPosLenPrice(
    pos: number,
    len: number,
    posState: number,
  ): number {
    let price: number;
    const lenToPosState = getLenToPosState(len - kMatchMinLen);

    if (pos < 128) {
      price = this._distancesPrices[lenToPosState * 128 + pos];
    } else {
      const position = (lenToPosState << 6) + this.GetPosSlot2(pos);
      price = this._posSlotPrices[position] + this._alignPrices[pos & 15];
    }

    return price + this.#lenenc.getPrice(len - 2, posState);
  }

  #GetPureRepPrice(repIndex: number, state: number, posState: number): number {
    let price;

    if (!repIndex) {
      price = PROB_PRICES[(this.#isRepG0[state]) >>> 2];
      price +=
        PROB_PRICES[0x800 - this.#isRep0Long[(state << 4) + posState] >>> 2];
    } else {
      price = PROB_PRICES[(0x800 - this.#isRepG0[state]) >>> 2];
      if (repIndex == 1) {
        price += PROB_PRICES[(this.#isRepG1[state]) >>> 2];
      } else {
        price += PROB_PRICES[(0x800 - this.#isRepG1[state]) >>> 2];
        price += getBitPrice(this.#isRepG2[state], repIndex - 2);
      }
    }

    return price;
  }

  #GetRepLen1Price(posState: number): number {
    const repG0Price = PROB_PRICES[(this.#isRepG0[this.#state]) >>> 2];
    const rep0LongPrice = PROB_PRICES[
      this.#isRep0Long[(this.#state << 4) + posState] >>> 2
    ];

    return repG0Price + rep0LongPrice;
  }

  #MovePos(num: number): void {
    if (num > 0) {
      this.#Skip(num);
      this.#additionalOffset += num;
    }
  }

  #ReadMatchDistances(): number {
    let lenRes = 0;
    this.#numDistancePairs = this.#GetMatches();

    if (this.#numDistancePairs > 0) {
      lenRes = this._matchDistances[this.#numDistancePairs - 2];

      if (lenRes == this.#numFastBytes) {
        lenRes += this.#InWindow.getMatchLen(
          lenRes - 1,
          this._matchDistances[this.#numDistancePairs - 1],
          0x111 - lenRes,
        );
      }
    }

    this.#additionalOffset += 1;

    return lenRes;
  }

  #ReleaseMFStream(): void {
    if (this.#matchFinder && this.needReleaseMFStream) {
      this.#matchFinder.stream = null;
      this.needReleaseMFStream = 0;
    }
  }

  GetPosSlot2(pos: number): number {
    if (pos < 0x2_0000) return G_FAST_POS[pos >> 6] + 12;
    if (pos < 0x800_0000) return G_FAST_POS[pos >> 16] + 32;

    return G_FAST_POS[pos >> 26] + 52;
  }

  #LZMA_Encoder_GetSubCoder(
    pos: uint,
    prevByte: uint8,
  ): LiteralDecoderEncoder2 {
    const subCoder = this.#litenc.getSubCoder(pos, prevByte);
    return { decoders: subCoder.decoders } as LiteralDecoderEncoder2;
  }

  #RangeCoder_Encoder_GetPrice_0(
    encoder: LiteralDecoderEncoder2,
    matchMode: boolean,
    matchByte: number,
    symbol: number,
  ): number {
    let bit, context = 1, i = 7, matchBit, price = 0;

    if (matchMode) {
      for (; i >= 0; --i) {
        matchBit = (matchByte >> i) & 1;
        bit = (symbol >> i) & 1;
        price += getBitPrice(
          encoder.decoders[((1 + matchBit) << 8) + context],
          bit,
        );
        context = context << 1 | bit;

        if (matchBit != bit) {
          --i;
          break;
        }
      }
    }

    for (; i >= 0; --i) {
      bit = symbol >> i & 1;
      price += getBitPrice(encoder.decoders[context], bit);
      context = context << 1 | bit;
    }

    return price;
  }

  #MakeAsChar(optimum: Optimum): void {
    optimum.backPrev = -1;
    optimum.prev1IsChar = 0;
  }

  #MakeAsShortRep(optimum: Optimum): void {
    optimum.backPrev = 0;
    optimum.prev1IsChar = 0;
  }

  #ReverseGetPrice(encoder: CBitTreeDecoder, symbol: number): number {
    let bit, m = 1, price = 0;

    for (let i = encoder.NumBits; i != 0; i -= 1) {
      bit = symbol & 1;
      symbol >>>= 1;
      price += getBitPrice(encoder.Probs[m], bit);
      m = m << 1 | bit;
    }

    return price;
  }

  #GetProcessedSizeAdd(): [number, number] {
    const processedCacheSize = add64(
      fromInt64(this.RangeEnc.cacheSize),
      this.RangeEnc.position,
    );

    return add64(processedCacheSize, [4, 0]);
  }

  codeOneBlock(): void {
    let baseVal,
      complexState,
      curByte,
      distance,
      footerBits,
      len,
      lenToPosState,
      matchByte,
      pos,
      posReduced,
      posSlot,
      posState,
      subCoder;

    this.processedInSize[0] = 0;
    this.processedOutSize[0] = [0, 0];
    this.finished[0] = 1;
    const progressPosValuePrev = this.nowPos48;

    if (this.inStream) {
      this.#matchFinder.stream = this.inStream;
      this.#Init_5();
      this.needReleaseMFStream = 1;
      this.inStream = null;
    }

    if (this.blockFinished) return;

    this.blockFinished = true;

    if (this.nowPos48 === 0) {
      if (!this.#InWindow.getNumAvailableBytes()) {
        this.#Flush(this.nowPos48);
        return;
      }

      this.#ReadMatchDistances();
      posState = this.nowPos48 & this._posStateMask;

      this.RangeEnc.encodeBit(this.#isMatch, (this.#state << 4) + posState, 0);

      this.#state = UpdateState_Literal(this.#state);
      curByte = this.#InWindow.getIndexByte(-this.#additionalOffset);

      this.encodeLiteral(
        this.#LZMA_Encoder_GetSubCoder(this.nowPos48, this.#prevByte),
        curByte,
      );

      this.#prevByte = curByte;
      this.#additionalOffset -= 1;
      this.nowPos48++;
    }

    if (!this.#InWindow.getNumAvailableBytes()) {
      this.#Flush(this.nowPos48);
      return;
    }

    while (1) {
      len = this.#GetOptimum(this.nowPos48);
      pos = this.backRes;
      posState = this.nowPos48 & this._posStateMask;
      complexState = (this.#state << 4) + posState;

      if (len == 1 && pos == -1) {
        this.RangeEnc.encodeBit(this.#isMatch, complexState, 0);

        curByte = this.#InWindow.getIndexByte(-this.#additionalOffset);

        subCoder = this.#LZMA_Encoder_GetSubCoder(
          this.nowPos48,
          this.#prevByte,
        );

        if (this.#state < 7) {
          this.encodeLiteral(subCoder, curByte);
        } else {
          matchByte = this.#InWindow.getIndexByte(
            -this._repDistances[0] -
              1 -
              this.#additionalOffset,
          );

          this.encodeMatched(subCoder, matchByte, curByte);
        }
        this.#prevByte = curByte;
        this.#state = UpdateState_Literal(this.#state);
      } else {
        this.RangeEnc.encodeBit(this.#isMatch, complexState, 1);
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
              this.RangeEnc.encodeBit(this.#isRepG2, this.#state, pos - 2);
            }
          }

          if (len == 1) {
            this.#state = UpdateState_ShortRep(this.#state);
          } else {
            this.encodeLength(this.#replenenc, len - 2, posState);
            this.#state = UpdateState_Rep(this.#state);
          }
          distance = this._repDistances[pos];
          if (pos != 0) {
            for (let i = pos; i >= 1; --i) {
              this._repDistances[i] = this._repDistances[i - 1];
            }
            this._repDistances[0] = distance;
          }
        } else {
          this.RangeEnc.encodeBit(this.#isRep, this.#state, 0);

          this.#state = UpdateState_Match(this.#state);
          this.encodeLength(this.#lenenc, len - 0x02, posState);

          pos -= 4;
          posSlot = this.getPosSlot(pos);
          lenToPosState = getLenToPosState(len - kMatchMinLen);
          this.RangeEnc.encodeBitTree(
            this._posSlotEncoder[lenToPosState],
            posSlot,
          );

          if (posSlot >= 4) {
            footerBits = (posSlot >> 1) - 1;
            baseVal = (0x02 | (posSlot & 1)) << footerBits;
            posReduced = pos - baseVal;

            if (posSlot < 0x0E) {
              this.reverseEncodeRange(
                baseVal - posSlot - 1,
                footerBits,
                posReduced,
              );
            } else {
              this.RangeEnc.encodeDirectBits(posReduced >> 4, footerBits - 4);
              this.reverseEncode(posReduced & 0x0F);
              this._alignPriceCount += 1;
            }
          }
          distance = pos;
          for (let i = 3; i >= 1; --i) {
            this._repDistances[i] = this._repDistances[i - 1];
          }

          this._repDistances[0] = distance;
          this._matchPriceCount += 1;
        }

        this.#prevByte = this.#InWindow
          .getIndexByte(len - 1 - this.#additionalOffset);
      }

      this.#additionalOffset -= len;
      this.nowPos48 += len;

      if (!this.#additionalOffset) {
        if (this._matchPriceCount >= 0x80) {
          this.fillDistancesPrices();
        }

        if (this._alignPriceCount >= 0x10) {
          this.#FillAlignPrices();
        }

        this.processedInSize[0] = this.nowPos48;
        this.processedOutSize[0] = this.#GetProcessedSizeAdd();

        if (!this.#InWindow.getNumAvailableBytes()) {
          this.#Flush(this.nowPos48);
          return;
        }

        if (this.nowPos48 - progressPosValuePrev >= 0x1000) {
          this.blockFinished = false;
          this.finished[0] = 0;
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
