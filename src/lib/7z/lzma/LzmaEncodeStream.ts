/** 80**************************************************************************
 * Ref. [[lzma1]/src/lzma.ts](https://github.com/xseman/lzma1/blob/master/src/lzma.ts)
 *    * Refactor heavily
 *    * Make streamable
 *
 * @module lib/7z/lzma/LzmaEncodeStream
 * @license MIT
 ******************************************************************************/

import type { uint, uint32, uint8 } from "../../alias.ts";
import "@fe-lib/jslang.ts";
import { _TRACE, INOUT } from "../../../preNs.ts";
import { assert, bind } from "../../util.ts";
import { trace, traceOut } from "../../util/trace.ts";
import { RsU8aSize } from "../alias.ts";
import { InStream } from "../InStream.ts";
import type { CompressionMode, Mode } from "./alias.ts";
import { MODES } from "./alias.ts";
import { EncoderChunker } from "./CoderChunker.ts";
import { LzmaEncoder } from "./LzmaEncoder.ts";
import { writeUint8m } from "../util.ts";
/*80--------------------------------------------------------------------------*/

type LzmaEncodeStreamCtorP = {
  size?: uint;
  mode?: CompressionMode;
  stal?: boolean;
};

/** @final */
export class LzmaEncodeStream extends InStream {
  readonly #encoder = new LzmaEncoder();
  readonly #chunker = new EncoderChunker(this.#encoder);

  readonly #size: uint;
  readonly #mode: Mode;
  /** standalone */
  readonly #stal: boolean;

  /* readable */
  readonly #rsU8a = new Uint8Array(RsU8aSize);
  #rsOfs: uint = 0;

  #rsEnque: ((chunk_x: Uint8Array) => void) | undefined;
  #rsClose!: () => void;

  readonly readable;
  /* ~ */

  /** @headconst @param _x */
  constructor(_x?: LzmaEncodeStreamCtorP) {
    super();
    this.#size = _x?.size ?? 0;
    this.#mode = MODES[_x?.mode ?? 5];
    this.#stal = _x?.stal ?? true;

    this.readable = new ReadableStream<Uint8Array>(
      {
        start: this._rsStart,
        //jjjj TOCLEANUP
        // pull: this._rsPull,
        // cancel: this._rsCancel,
      },
      // new ByteLengthQueuingStrategy({ highWaterMark: 16 * 1024 }),
    );

    this.#compress();
  }

  // static async from(_x: string | URL, o_x?: LzmaEncodeStreamCtorP) {
  //   const les = new LzmaEncodeStream(o_x);
  //   const res = await fetch(_x);
  //   res.body!.pipeThrough(les);
  //   return les;
  // }
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
      console.log(
        `${trace.indent}>>>>>>> ${this._type_id_}.readTo( , ofs_x: ${ofs_x}, len_x: ${len_x}) >>>>>>>`,
      );
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
    // console.log(`${trace.dent}wsDone$: `, this.wsDone$);

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
    /* let `writable` do the rest */
    this.wsCap$?.resolve();
    this.wsCap$ = undefined;
    return await this.tsCap$.promise;
  }
  /*49|||||||||||||||||||||||||||||||||||||||||||*/

  @bind
  @traceOut(_TRACE)
  private _rsStart(rc_x: ReadableStreamDefaultController<Uint8Array>) {
    /*#static*/ if (_TRACE) {
      console.log(
        `${trace.indent}>>>>>>> ${this._type_id_}._rsStart() >>>>>>>`,
      );
    }
    this.#rsEnque = (_y) => rc_x.enqueue(_y);
    this.#rsClose = () => rc_x.close();
  }

  //jjjj TOCLEANUP
  // @bind
  // @traceOut(_TRACE)
  // private _rsPull(_rc_x: ReadableStreamDefaultController<Uint8Array>) {
  //   /*#static*/ if (_TRACE) {
  //     console.log(`${trace.indent}>>>>>>> ${this._type_id_}._rsPull() >>>>>>>`);
  //   }
  //   ///
  // }

  //jjjj TOCLEANUP
  // @bind
  // @traceOut(_TRACE)
  // private _rsCancel(r_x: unknown) {
  //   /*#static*/ if (_TRACE) {
  //     console.log(
  //       `${trace.indent}>>>>>>> ${this._type_id_}._rsCancel() >>>>>>>`,
  //     );
  //     console.log(`${trace.dent}reason: ${r_x}`);
  //   }
  //   ///
  // }

  /** @const @param val_x */
  writeByte(val_x: uint): void {
    if (this.#rsOfs >= RsU8aSize) {
      this.#rsEnque?.(this.#rsU8a.slice());
      this.#rsOfs = 0;
    }

    this.#rsU8a[this.#rsOfs++] = val_x & 0xff;
  }
  // /** @const @param val_x */
  // writeByte(val_x: uint32): void {
  //   this.#rsEnque?.(new Uint8Array([val_x & 0xff]));
  // }
  /*49|||||||||||||||||||||||||||||||||||||||||||*/

  #initEncode(): void {
    this.#encoder.configure(this.#mode);
    this.#encoder.setEncoderProperties();
    if (this.#stal) {
      for (const u8 of this.#encoder.properties) this.writeByte(u8);

      const sizebuf = Array.sparse<uint8>(8);
      writeUint8m(this.#size, 8, sizebuf);
      for (const u8 of sizebuf) this.writeByte(u8);
    }

    this.#encoder.Init();
    this.#encoder.inStream = this;

    this.#encoder.Create_2();

    this.#encoder.outStream = this;
    this.#encoder.Init_2();

    this.#chunker.alive = true;
  }
  /*49|||||||||||||||||||||||||||||||||||||||||||*/

  async #processAsync(): Promise<void> {
    while (await this.#chunker.processChunkAsync());
  }

  #compress(): this {
    this.#initEncode();
    this.#processAsync().then(() => {
      // console.log(`%crun here: ${this._type_id_}.#processAsync().then()`, `color:orange`);
      this.safeguard.resolve();
    }).catch(this.safeguard.reject)
      .finally(() => {
        // console.log(
        //   `%crun here: ${this._type_id_}.#processAsync().finally()`,
        //   `color:orange`,
        // );
        this.#rsEnque = undefined;
        this.#rsClose();
        this.cleanup();
      });
    return this;
  }

  @traceOut(_TRACE)
  override cleanup() {
    /*#static*/ if (_TRACE) {
      console.log(`${trace.indent}>>>>>>> ${this._type_id_}.cleanup() >>>>>>>`);
    }
    super.cleanup();
    if (this.#rsOfs > 0) {
      this.#rsEnque?.(this.#rsU8a.subarray(0, this.#rsOfs));
    }
  }
}
/*80--------------------------------------------------------------------------*/
