/** 80**************************************************************************
 * Ref. [[lzma1]/src/lzma.ts](https://github.com/xseman/lzma1/blob/master/src/lzma.ts)
 *    * Refactor heavily
 *    * Make streamable
 *
 * @module lib/7z/lzma/LzmaDecodeStream
 * @license MIT
 ******************************************************************************/

import { _TRACE, INOUT } from "@fe-src/preNs.ts";
import type { uint, uint8 } from "../../alias.ts";
import "../../jslang.ts";
import { assert, bind } from "../../util.ts";
import { trace, traceOut } from "../../util/trace.ts";
import { MAX_UINT48 } from "./alias.ts";
import { DecoderChunker } from "./CoderChunker.ts";
import { LzmaCodeStream } from "./LzmaCodeStream.ts";
import { LzmaDecoder } from "./LzmaDecoder.ts";
/*80--------------------------------------------------------------------------*/

/** @final */
export class LzmaDecodeStream extends LzmaCodeStream {
  readonly #decoder = new LzmaDecoder();
  readonly #chunker = new DecoderChunker(this.#decoder);

  /* readable */
  #rsEnque!: (chunk_x: Uint8Array) => void;
  #rsClose!: () => void;

  outSize: uint | -1 = 0;

  readonly readable;
  /* ~ */

  constructor() {
    super();

    this.tsBuf$ = new Array<uint8>(1);

    this.readable = new ReadableStream<Uint8Array>({
      start: this._rsStart,
      pull: this._rsPull,
      cancel: this._rsCancel,
    });
  }
  /*64||||||||||||||||||||||||||||||||||||||||||||||||||||||||||*/

  // @traceOut(_TRACE)
  async readByte(): Promise<uint8 | -1> {
    // /*#static*/ if (_TRACE) {
    //   console.log(`${trace.indent}>>>>>>> LzmaDecodeStream.readByte() >>>>>>>`);
    // }
    if (this.wsU8a$ && this.wsOfs$ < this.wsU8a$.length) {
      // console.log(`${trace.dent}wsOfs$: ${this.wsOfs$}`);
      return this.wsU8a$[this.wsOfs$++];
    }

    if (this.wsDone$) return -1;

    /*#static*/ if (INOUT) {
      assert(!this.tsCap$);
    }
    this.tsCap$ = Promise.withResolvers<uint8>();
    this.tsOfs$ = 0;
    this.tsLen$ = 1;
    this.tsLEN$ = 1;
    /* Let `writable` do the rest. */
    this.wsCap$?.resolve();
    this.wsCap$ = undefined;
    await this.tsCap$.promise;
    // console.log(`${trace.dent}tsBuf[0]: 0x${this.tsBuf$![0].toString(16)}`);
    return this.tsBuf$![0];
  }
  /*49|||||||||||||||||||||||||||||||||||||||||||*/

  @bind
  @traceOut(_TRACE)
  private _rsStart(rc_x: ReadableStreamDefaultController<Uint8Array>) {
    /*#static*/ if (_TRACE) {
      console.log(`${trace.indent}>>>>>>> LzmaDecodeStream._rsStart() >>>>>>>`);
    }
    this.#rsEnque = (_y) => rc_x.enqueue(_y);
    this.#rsClose = () => rc_x.close();
  }

  @bind
  @traceOut(_TRACE)
  private _rsPull(_rc_x: ReadableStreamDefaultController<Uint8Array>) {
    /*#static*/ if (_TRACE) {
      console.log(`${trace.indent}>>>>>>> LzmaDecodeStream._rsPull() >>>>>>>`);
    }
    ///
  }

  @bind
  @traceOut(_TRACE)
  private _rsCancel(r_x: unknown) {
    /*#static*/ if (_TRACE) {
      console.log(
        `${trace.indent}>>>>>>> LzmaDecodeStream._rsCancel() >>>>>>>`,
      );
      console.log(`${trace.dent}reason: ${r_x}`);
    }
    ///
  }

  /**
   * `in( 0 < len_x && len_x <= buf_x - ofs_x.length)`
   * @const @param buf_x
   * @const @param ofs_x
   * @const @param len_x
   */
  @traceOut(_TRACE)
  writeFrom(buf_x: uint8[], ofs_x: uint, len_x: uint) {
    /*#static*/ if (_TRACE) {
      console.log(
        `${trace.indent}>>>>>>> LzmaDecodeStream.writeFrom() >>>>>>>`,
      );
      console.log(`${trace.dent}`, { ofs_x, len_x });
    }
    this.#rsEnque(new Uint8Array(buf_x.slice(ofs_x, ofs_x + len_x)));
  }
  /*49|||||||||||||||||||||||||||||||||||||||||||*/

  async #initDecode(): Promise<void> {
    const prop_a: uint8[] = [];
    for (let i = 0; i < 5; ++i) {
      const r_: uint8 = await this.readByte();
      if (r_ === -1) throw new Error("truncated input");
      prop_a[i] = r_;
    }
    if (!this.#decoder.setDecoderProperties(prop_a)) {
      throw new Error("corrupted input");
    }

    let hex_length = "";
    for (let i = 0; i < 8; ++i) {
      let r_: uint8 | string = await this.readByte();
      if (r_ === -1) throw new Error("truncated input");
      r_ = r_.toString(16);
      if (r_.length === 1) r_ = "0" + r_;
      hex_length = `${r_}${hex_length}`;
    }
    /* Was the length set in the header (if it was compressed from a stream, the
    length is all f"s). */
    if (/^0+$|^f+$/i.test(hex_length)) {
      this.outSize = -1;
    } else {
      /* NOTE: If there is a problem with the decoder because of the length,
      you can always set the length to -1 (N1_longLit) which means unknown. */
      const tmp_length = parseInt(hex_length, 16);
      this.outSize = tmp_length > MAX_UINT48 ? -1 : tmp_length;
    }

    this.#decoder.inStream = this;
    this.#decoder.OutWindow.flush();
    this.#decoder.OutWindow.outStream = this;
    await this.#decoder.Init();
    this.#decoder.outSize = this.outSize;

    this.#chunker.alive = true;
  }
  /*64||||||||||||||||||||||||||||||||||||||||||||||||||||||||||*/

  async #process(): Promise<void> {
    await this.#initDecode();
    while (await this.#chunker.processChunk());
  }

  decompress(): this {
    this.#process().then(() => {
      // console.log(`%crun here: LzmaDecodeStream.#process().then()`, `color:orange`);
      this.#rsClose();
    });
    return this;
  }
}
/*80--------------------------------------------------------------------------*/
