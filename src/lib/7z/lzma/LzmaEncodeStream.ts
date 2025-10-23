/** 80**************************************************************************
 * Ref. [[lzma1]/src/lzma.ts](https://github.com/xseman/lzma1/blob/master/src/lzma.ts)
 *    * Refactor heavily
 *    * Make streamable
 *
 * @module lib/7z/lzma/LzmaEncodeStream
 * @license MIT
 ******************************************************************************/

import type { uint, uint32, uint8 } from "@fe-lib/alias.ts";
import "@fe-lib/jslang.ts";
import { _TRACE, INOUT } from "@fe-src/preNs.ts";
import { assert, bind } from "../../util.ts";
import { trace, traceOut } from "../../util/trace.ts";
import type { CompressionMode, Mode } from "./alias.ts";
import { MODES } from "./alias.ts";
import { EncoderChunker } from "./CoderChunker.ts";
import { LzmaEncoder } from "./LzmaEncoder.ts";
import { LzmaCodeStream } from "./LzmaCodeStream.ts";
/*80--------------------------------------------------------------------------*/

/** @final */
export class LzmaEncodeStream extends LzmaCodeStream {
  readonly #encoder = new LzmaEncoder();
  readonly #chunker = new EncoderChunker(this.#encoder);

  /* readable */
  #rsEnque!: (chunk_x: uint8) => void;
  #rsClose!: () => void;

  readonly readable;
  /* ~ */

  constructor() {
    super();

    this.readable = new ReadableStream<uint8>(
      {
        start: this._rsStart,
        pull: this._rsPull,
        cancel: this._rsCancel,
      },
      // new ByteLengthQueuingStrategy({ highWaterMark: 16 * 1024 }),
    );
  }
  /*64||||||||||||||||||||||||||||||||||||||||||||||||||||||||||*/

  /**
   * `in( 0 < len_x && len_x <= buf_x - ofs_x.length)`
   * @headconst @param buf_x
   * @param ofs_x
   * @param len_x
   */
  @traceOut(_TRACE)
  async readTo(buf_x: uint8[], ofs_x: uint, len_x: uint): Promise<uint> {
    /*#static*/ if (_TRACE) {
      console.log(`${trace.indent}>>>>>>> LzmaEncodeStream.readTo() >>>>>>>`);
      console.log(`${trace.dent}`, { ofs_x, len_x });
    }
    if (this.wsU8a$ && this.wsOfs$ < this.wsU8a$.length) {
      const len_1 = Math.min(len_x, this.wsU8a$.length - this.wsOfs$);
      const LEN = this.wsOfs$ + len_1;
      for (let i = this.wsOfs$; i < LEN; ++i, ++ofs_x) {
        buf_x[ofs_x] = this.wsU8a$[i];
      }
      this.wsOfs$ = LEN;

      len_x -= len_1;
      if (len_x === 0) {
        this.tsRed$ = 0; //!
        return len_1;
      }

      this.tsRed$ = len_1;
    }
    // console.log(`${trace.dent}`, { ofs_x, len_x });

    if (this.wsDone$) return 0;

    /*#static*/ if (INOUT) {
      assert(!this.wsU8a$ || this.wsOfs$ === this.wsU8a$.length);
      assert(!this.tsCap$);
    }
    this.tsCap$ = Promise.withResolvers<uint>();
    this.tsBuf$ = buf_x;
    this.tsOfs$ = ofs_x;
    this.tsLen$ = len_x;
    this.tsLEN$ = len_x;
    /* Let `writable` do the rest. */
    this.wsCap$?.resolve();
    this.wsCap$ = undefined;
    return await this.tsCap$.promise;
  }
  /*49|||||||||||||||||||||||||||||||||||||||||||*/

  @bind
  @traceOut(_TRACE)
  private _rsStart(rc_x: ReadableStreamDefaultController<uint8>) {
    /*#static*/ if (_TRACE) {
      console.log(`${trace.indent}>>>>>>> LzmaEncodeStream._rsStart() >>>>>>>`);
    }
    this.#rsEnque = (_y) => rc_x.enqueue(_y);
    this.#rsClose = () => rc_x.close();
  }

  @bind
  @traceOut(_TRACE)
  private _rsPull(_rc_x: ReadableStreamDefaultController<uint8>) {
    /*#static*/ if (_TRACE) {
      console.log(`${trace.indent}>>>>>>> LzmaEncodeStream._rsPull() >>>>>>>`);
    }
    ///
  }

  @bind
  @traceOut(_TRACE)
  private _rsCancel(r_x: unknown) {
    /*#static*/ if (_TRACE) {
      console.log(
        `${trace.indent}>>>>>>> LzmaEncodeStream._rsCancel() >>>>>>>`,
      );
      console.log(`${trace.dent}reason: ${r_x}`);
    }
    ///
  }

  /** @const @param val_x */
  writeByte(val_x: uint32): void {
    this.#rsEnque(val_x & 0xff);
  }
  /*49|||||||||||||||||||||||||||||||||||||||||||*/

  /**
   * @const @param size_x
   * @const @param mode_x
   */
  #initEncode(size_x: uint, mode_x: Mode): void {
    this.#encoder.configure(mode_x);
    this.#encoder.setEncoderProperties();
    for (let i = 0; i < 5; ++i) {
      this.writeByte(this.#encoder.properties[i]);
    }

    const Len = BigInt(size_x);
    for (let i = 0n; i < 48; i += 8n) {
      this.writeByte(Number((Len >> i) & 0xFFn));
    }
    for (let i = 2; i--;) this.writeByte(0);

    this.#encoder.Init();
    this.#encoder.inStream = this;

    this.#encoder.Create_2();

    this.#encoder.outStream = this;
    this.#encoder.Init_2();

    this.#chunker.alive = true;
  }
  /*49|||||||||||||||||||||||||||||||||||||||||||*/

  async #process(): Promise<void> {
    while (await this.#chunker.processChunk());
  }

  /**
   * @const @param size_x
   * @const @param mode_x
   */
  compress(size_x: uint, mode_x: CompressionMode = 5): this {
    this.#initEncode(size_x, MODES[mode_x]);
    this.#process().then(() => {
      // console.log(`%crun here: LzmaEncodeStream.#process().then()`, `color:orange`);
      this.#rsClose();
    });
    return this;
  }
}
/*80--------------------------------------------------------------------------*/
