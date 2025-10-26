/** 80**************************************************************************
 * Ref. [[lzma1]/src/chunker.ts](https://github.com/xseman/lzma1/blob/master/src/chunker.ts)
 *    * Remove `lzma` from `EncoderChunker`
 *
 * @module lib/7z/lzma/CoderChunker
 * @license MIT
 ******************************************************************************/

import type { uint } from "@fe-lib/alias.ts";
import { _TRACE, DEBUG } from "@fe-src/preNs.ts";
import { trace, traceOut } from "../../util/trace.ts";
import { DecodeChunkR } from "./alias.ts";
import { ChunkState } from "./ChunkState.ts";
import type { LzmaDecoder } from "./LzmaDecoder.ts";
import type { LzmaEncoder } from "./LzmaEncoder.ts";
import { BadState, CorruptedInput } from "./util.ts";
/*80--------------------------------------------------------------------------*/

abstract class CoderChunker {
  protected alive$ = false;
  set alive(_x: boolean) {
    this.alive$ = _x;
  }

  protected inBytesProcessed$: uint = 0;

  _nSync_: uint = 0;
  _nAsync_: uint = 0;
  /*64||||||||||||||||||||||||||||||||||||||||||||||||||||||||||*/

  get _info_() {
    return `${this.constructor.name}: _nSync_: ${this._nSync_}, _nAsync_: ${this._nAsync_}`;
  }
}

/** Encoder chunker for handling compression chunk processing */
export class EncoderChunker extends CoderChunker {
  readonly #encoder: LzmaEncoder;

  /** @headconst @param encoder_x */
  constructor(encoder_x: LzmaEncoder) {
    super();
    this.#encoder = encoder_x;
  }
  /*64||||||||||||||||||||||||||||||||||||||||||||||||||||||||||*/

  /**
   * Process one chunk of encoding
   * @throw {@linkcode BadState}
   */
  async processChunk(): Promise<boolean> {
    if (!this.alive$) throw new BadState();

    await this.#encoder.codeOneBlock();
    this.inBytesProcessed$ = this.#encoder.processedInSize;

    if (this.#encoder.finished) {
      this.#encoder.ReleaseStreams();
      this.alive$ = false;
    }

    /*#static*/ if (DEBUG) this._nAsync_++;
    return this.alive$;
  }
}

/** Decoder chunker for handling decompression chunk processing */
export class DecoderChunker extends CoderChunker {
  readonly #decoder: LzmaDecoder;

  outSize: uint | -1 = -1;

  readonly #chunkstate = new ChunkState();
  restoreState(): void {
    this.#decoder.restoreState(this.#chunkstate);
  }

  /** @headconst @param decoder_x */
  constructor(decoder_x: LzmaDecoder) {
    super();
    this.#decoder = decoder_x;

    // console.log(this.#chunkstate._arysByteSize_); // 760
  }
  /*64||||||||||||||||||||||||||||||||||||||||||||||||||||||||||*/

  /**
   * Process one chunk of decoding
   * @throw {@linkcode BadState}
   * @throw {@linkcode CorruptedInput}
   * @throw {@linkcode NoInput}
   * @throw {@linkcode ExceedSize}
   */
  // @traceOut(_TRACE)
  processChunkSync(): boolean {
    // /*#static*/ if (_TRACE) {
    //   console.log(
    //     `${trace.indent}>>>>>>> DecoderChunker.processChunkSync() >>>>>>>`,
    //   );
    // }
    if (!this.alive$) throw new BadState();

    this.#chunkstate.reset_ChunkState();
    const result = this.#decoder.codeOneChunkSync(this.#chunkstate);
    if (result === DecodeChunkR.err) throw new CorruptedInput();

    this.inBytesProcessed$ = this.#decoder.nowPos48;

    const isOutputComplete = this.outSize >= 0 &&
      this.#decoder.nowPos48 >= this.outSize;

    if (result === DecodeChunkR.end || isOutputComplete) {
      this.#decoder.OutWindow.flush();
      this.#decoder.cleanup();
      this.alive$ = false;
    }

    /*#static*/ if (DEBUG) this._nSync_++;
    return this.alive$;
  }

  /**
   * Process one chunk of decoding
   * @throw {@linkcode BadState}
   * @throw {@linkcode CorruptedInput}
   */
  // @traceOut(_TRACE)
  async processChunk(): Promise<boolean> {
    // /*#static*/ if (_TRACE) {
    //   console.log(
    //     `${trace.indent}>>>>>>> DecoderChunker.processChunk() >>>>>>>`,
    //   );
    // }
    if (!this.alive$) throw new BadState();

    const result = await this.#decoder.codeOneChunk();
    if (result === DecodeChunkR.err) throw new CorruptedInput();

    this.inBytesProcessed$ = this.#decoder.nowPos48;

    const isOutputComplete = this.outSize >= 0 &&
      this.#decoder.nowPos48 >= this.outSize;

    if (result === DecodeChunkR.end || isOutputComplete) {
      this.#decoder.OutWindow.flush();
      this.#decoder.cleanup();
      this.alive$ = false;
    }

    /*#static*/ if (DEBUG) this._nAsync_++;
    return this.alive$;
  }
  /*64||||||||||||||||||||||||||||||||||||||||||||||||||||||||||*/

  /** For testing only */
  override toString() {
    return `${this._info_}
${this.#chunkstate}
`;
  }
}
/*80--------------------------------------------------------------------------*/
