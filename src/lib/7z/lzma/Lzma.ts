/** 80**************************************************************************
 * Ref. [[lzma1]/src/lzma.ts](https://github.com/xseman/lzma1/blob/master/src/lzma.ts)
 *    * Refactor heavily
 *
 * @module lib/7z/lzma/Lzma
 * @license MIT
 ******************************************************************************/

import type { uint, uint8 } from "@fe-lib/alias.ts";
import "@fe-lib/jslang.ts";
import { decodeABV, encodeStr } from "@fe-lib/util/string.ts";
import { MAX_UINT48 } from "./alias.ts";
import { DecoderChunker, EncoderChunker } from "./chunker.ts";
import { LzmaDecoder } from "./LzmaDecoder.ts";
import { LzmaEncoder } from "./LzmaEncoder.ts";
import type { BaseStream, BufferWithCount } from "./streams.ts";
import { arraycopy } from "./util.ts";
/*80--------------------------------------------------------------------------*/

export type Mode = {
  searchDepth: uint8;
  filterStrength: uint8;
  matchFinderType: boolean;
};

/**
 * LZMA compression mode levels (1-9)
 * Higher values provide better compression but are slower
 */
export type CompressionMode = keyof typeof MODES;

/** Compression modes */
export const MODES = {
  1: { searchDepth: 0x10, filterStrength: 0x40, matchFinderType: false },
  2: { searchDepth: 0x14, filterStrength: 0x40, matchFinderType: false },
  3: { searchDepth: 0x13, filterStrength: 0x40, matchFinderType: true },
  4: { searchDepth: 0x14, filterStrength: 0x40, matchFinderType: true },
  5: { searchDepth: 0x15, filterStrength: 0x80, matchFinderType: true },
  6: { searchDepth: 0x16, filterStrength: 0x80, matchFinderType: true },
  7: { searchDepth: 0x17, filterStrength: 0x80, matchFinderType: true },
  8: { searchDepth: 0x18, filterStrength: 0xFF, matchFinderType: true },
  9: { searchDepth: 0x19, filterStrength: 0xFF, matchFinderType: true },
} as const;
/*64----------------------------------------------------------*/

type EncodeContext_ = {
  chunker: EncoderChunker;
  output: BufferWithCount;
  len_0?: uint | -1;
};

type DecodeContext_ = {
  chunker: DecoderChunker;
  output: BufferWithCount;
};

export class Lzma {
  readonly #encoder = new LzmaEncoder();
  readonly #decoder = new LzmaDecoder();

  readonly #encctx: EncodeContext_;
  readonly #decctx: DecodeContext_;

  constructor() {
    this.#encctx = {
      chunker: new EncoderChunker(this.#encoder),
      output: {
        buf: Array.mock(0x20),
        count: 0,
        write: () => {},
      },
    };
    this.#decctx = {
      chunker: new DecoderChunker(this.#decoder),
      output: {
        buf: Array.mock(0x20),
        count: 0,
        write: () => {},
      },
    };
  }

  /** @headconst @param inputStream  */
  #readByte(inputStream: BaseStream): uint8 | -1 {
    if (inputStream.pos >= inputStream.count) return -1;

    const value = inputStream.buf[inputStream.pos];
    inputStream.pos++;
    return value & 0xFF;
  }

  #toUint8Array(
    output: EncodeContext_["output"] | DecodeContext_["output"],
  ): Uint8Array {
    return new Uint8Array(output.buf.slice(0, output.count));
  }

  #writeByte(buf_x: BufferWithCount, b_x: uint8): void {
    if (buf_x.count >= buf_x.buf.length) {
      const newSize = Math.max(buf_x.buf.length * 2, buf_x.count + 1);
      const newBuf = new Array(newSize);
      for (let i = 0; i < buf_x.count; i++) {
        newBuf[i] = buf_x.buf[i];
      }
      buf_x.buf = newBuf;
    }

    buf_x.buf[buf_x.count++] = b_x << 24 >> 24;
  }

  /**
   * @const @param input_x
   * @const @param len_x
   * @const @param mode_x
   */
  #initEncode(input_x: BaseStream, len_x: uint | -1, mode_x: Mode): void {
    if (len_x < -1) throw new Error(`invalid length ${len_x}`);

    this.#encctx.len_0 = len_x;

    this.#encoder.configure(mode_x);
    this.#encoder.setEncoderProperties();
    arraycopy(
      this.#encoder.properties,
      0,
      this.#encctx.output.buf,
      this.#encctx.output.count,
      5,
    );
    this.#encctx.output.count += 5;

    const Len = BigInt(len_x);
    for (let i = 0n; i < 48; i += 8n) {
      this.#writeByte(this.#encctx.output, Number((Len >> i) & 0xFFn));
    }
    for (let i = 2; i--;) this.#writeByte(this.#encctx.output, 0);

    this.#encoder.Init();
    //jjjj TOCLEANUP
    // this.#encoder.needReleaseMFStream = false;
    this.#encoder.inStream = input_x;
    //jjjj TOCLEANUP
    // this.#encoder.blockFinished = false;
    // this.#encoder.nowPos48 = 0;

    this.#encoder.Create_2();

    this.#encoder.RangeEnc.stream = this.#encctx.output;
    this.#encoder.Init_2();

    this.#encctx.chunker.alive = true;
  }

  /**
   * @const @param data_x
   * @const @param mode_x
   */
  #bytearrayEncode(data_x: Uint8Array, mode_x: Mode): void {
    const inputSize = data_x.length;
    const estimatedOutputSize = Math.max(32, Math.ceil(inputSize * 1.2));

    this.#encctx.output = {
      buf: Array.mock(estimatedOutputSize),
      count: 0,
      write: () => {},
    };

    const inputBuffer: BaseStream = {
      pos: 0,
      buf: data_x,
      count: inputSize,
    };

    this.#initEncode(inputBuffer, inputSize, mode_x);
  }

  /** @headconst @param input_x  */
  #initDecode(input_x: BaseStream): void {
    const prop_a: uint8[] = [];
    for (let i = 0; i < 5; ++i) {
      const r_: uint8 = this.#readByte(input_x);
      if (r_ === -1) throw new Error("truncated input");
      prop_a[i] = r_;
    }
    if (!this.#decoder.setDecoderProperties(prop_a)) {
      throw new Error("corrupted input");
    }

    let hex_length = "";
    for (let i = 0; i < 8; ++i) {
      let r_: uint8 | string = this.#readByte(input_x);
      if (r_ === -1) {
        throw new Error("truncated input");
      }
      r_ = r_.toString(16);
      if (r_.length === 1) r_ = "0" + r_;
      hex_length = `${r_}${hex_length}`;
    }
    /* Was the length set in the header (if it was compressed from a stream, the
    length is all f"s). */
    if (/^0+$|^f+$/i.test(hex_length)) {
      this.#encctx.len_0 = -1;
    } else {
      /* NOTE: If there is a problem with the decoder because of the length,
      you can always set the length to -1 (N1_longLit) which means unknown. */
      const tmp_length = parseInt(hex_length, 16);
      this.#encctx.len_0 = tmp_length > MAX_UINT48 ? -1 : tmp_length;
    }

    this.#decoder.RangeDec.stream = input_x;
    this.#decoder.OutWindow.flush();
    this.#decoder.OutWindow.stream = this.#decctx.output;
    this.#decoder.Init();
    this.#decoder.outSize = this.#encctx.len_0;

    this.#decctx.chunker.alive = true;
  }

  /** @headconst @param data_x  */
  #bytearrayDecode(data_x: Uint8Array): void {
    const inputSize = data_x.length;
    const minBufferSize = 0x20;
    const estimatedOutputSize = inputSize * 2; // Estimate 2x expansion for decompression
    const initialBufferSize = Math.max(minBufferSize, estimatedOutputSize);

    this.#decctx.output = {
      buf: Array.mock(initialBufferSize),
      count: 0,
      write: () => {},
    };

    const inputBuffer: BaseStream = {
      buf: data_x,
      pos: 0,
      count: inputSize,
    };

    this.#initDecode(inputBuffer);
  }

  /**
   * @headconst @param data_x
   * @const @param mode_x
   */
  compress(data_x: Uint8Array, mode_x: CompressionMode = 5): Uint8Array {
    const compressionMode = MODES[mode_x];
    this.#bytearrayEncode(data_x, compressionMode);

    while (this.#encctx.chunker.processChunk());

    return this.#toUint8Array(this.#encctx.output);
  }

  /**
   * @headconst @param data_x
   * @const @param mode_x
   */
  compressString(data_x: string, mode_x: CompressionMode = 5): Uint8Array {
    return this.compress(encodeStr(data_x), mode_x);
  }

  /** @headconst @param bytearray_x  */
  decompress(bytearray_x: Uint8Array): Uint8Array {
    this.#bytearrayDecode(bytearray_x);

    while (this.#decctx.chunker.processChunk());

    return this.#toUint8Array(this.#decctx.output);
  }

  /** @headconst @param bytearray_x  */
  decompressString(bytearray_x: Uint8Array): string {
    const decodedByteArray = this.decompress(bytearray_x);
    try {
      return decodeABV(decodedByteArray);
    } catch (_) {
      /* If decoding failed and returned binary data, convert to string anyway */
      return String.fromCharCode(...decodedByteArray);
    }
  }
}
/*80--------------------------------------------------------------------------*/

/**
 * Compresses data using LZMA algorithm
 *
 * @headconst @param data_x Data to compress
 * @const @param mode_x
 * @return Compressed data
 */
export function compress(
  data_x: Uint8Array,
  mode_x: CompressionMode = 5,
): Uint8Array {
  return new Lzma().compress(data_x, mode_x);
}

/**
 * Compresses data using LZMA algorithm
 *
 * @param data_x String to compress
 * @param mode_x
 * @return Compressed data
 */
export function compressString(
  data_x: string,
  mode_x: CompressionMode = 5,
): Uint8Array {
  return new Lzma().compressString(data_x, mode_x);
}

/**
 * Decompresses LZMA compressed data
 *
 * @param data_x Compressed data
 * @return Decompressed data
 */
export function decompress(data_x: Uint8Array): Uint8Array {
  return new Lzma().decompress(data_x);
}

/**
 * Decompresses LZMA compressed data
 *
 * @param data_x Compressed data
 * @return Decompressed data
 */
export function decompressString(data_x: Uint8Array): string {
  return new Lzma().decompressString(data_x);
}
/*80--------------------------------------------------------------------------*/
