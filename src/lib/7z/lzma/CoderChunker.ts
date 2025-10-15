/** 80**************************************************************************
 * Ref. [[lzma1]/src/chunker.ts](https://github.com/xseman/lzma1/blob/master/src/chunker.ts)
 *    * Remove `lzma` from `EncoderChunker`
 *
 * @module lib/7z/lzma/CoderChunker
 * @license MIT
 ******************************************************************************/

import type { uint } from "@fe-lib/alias.ts";
import { DecodeChunkR } from "./alias.ts";
import type { LzmaDecoder } from "./LzmaDecoder.ts";
import type { LzmaEncoder } from "./LzmaEncoder.ts";
/*80--------------------------------------------------------------------------*/

abstract class CoderChunker {
  protected alive$ = false;
  set alive(_x: boolean) {
    this.alive$ = _x;
  }

  protected inBytesProcessed$: uint = 0;
}

/** Encoder chunker for handling compression chunk processing */
export class EncoderChunker extends CoderChunker {
  encoder: LzmaEncoder;
  decoder: null = null;

  constructor(encoder: LzmaEncoder) {
    super();
    this.encoder = encoder;
  }
  /*64||||||||||||||||||||||||||||||||||||||||||||||||||||||||||*/

  /** Process one chunk of encoding */
  processChunk(): boolean {
    if (!this.alive$) throw new Error("bad state");
    //jjjj TOCLEANUP
    // if (!this.encoder) throw new Error("No decoding");

    this.encoder.codeOneBlock();
    this.inBytesProcessed$ = this.encoder.processedInSize;

    if (this.encoder.finished) {
      this.encoder.ReleaseStreams();
      this.alive$ = false;
    }

    return this.alive$;
  }
}

/** Decoder chunker for handling decompression chunk processing */
export class DecoderChunker extends CoderChunker {
  encoder: null = null;
  decoder: LzmaDecoder;

  constructor(decoder: LzmaDecoder) {
    super();
    this.decoder = decoder;
  }
  /*64||||||||||||||||||||||||||||||||||||||||||||||||||||||||||*/

  /** Process one chunk of decoding */
  processChunk(): boolean {
    if (!this.alive$) throw new Error("Bad state");
    //jjjj TOCLEANUP
    // if (this.encoder) throw new Error("No encoding");

    const result = this.decoder.codeOneChunk();
    if (result === DecodeChunkR.err) throw new Error("Corrupted input");

    this.inBytesProcessed$ = this.decoder.nowPos48;

    const isOutputComplete = this.decoder.outSize >= 0 &&
      this.decoder.nowPos48 >= this.decoder.outSize;

    if (result === DecodeChunkR.end || isOutputComplete) {
      this.decoder.OutWindow.flush();
      this.decoder.cleanup();
      this.alive$ = false;
    }

    return this.alive$;
  }
}
/*80--------------------------------------------------------------------------*/
