/** 80**************************************************************************
 * @module lib/7z/InStream
 * @license MIT
 ******************************************************************************/

import type { id_t, uint, uint8 } from "../alias.ts";
import "@fe-lib/jslang.ts";
import { _TRACE, INOUT } from "../../preNs.ts";
import { assert, bind } from "../util.ts";
import { trace, traceOut } from "../util/trace.ts";
/*80--------------------------------------------------------------------------*/

/**
 * ```
 *  ws | ts |
 * >>>>|>>>>|>>>>
 * ```
 */
export abstract class InStream {
  static #ID = 0 as id_t;
  readonly id = ++InStream.#ID as id_t;
  /** @final */
  get _type_id_() {
    return `${this.constructor.name}_${this.id}`;
  }
  /*64||||||||||||||||||||||||||||||||||||||||||||||||||||||||||*/

  /* writable */
  protected wsU8a$: Uint8Array | undefined;
  protected wsOfs$: uint = 0;
  /** Non-`undefined` means write is pending. */
  protected wsCap$: PromiseWithResolvers<void> | undefined;
  protected wsDone$ = false;
  // get wsDone() {
  //   return this.wsDone$;
  // }

  protected tsBuf$: uint8[] | undefined;
  protected tsRed$: uint = 0;
  protected tsOfs$: uint = 0;
  protected tsLen$: uint = 0;
  protected tsLEN$: uint = 0;
  /** Non-`undefined` means some requirer is waiting. */
  protected tsCap$: PromiseWithResolvers<uint> | undefined;

  readonly writable;
  // readonly writer;
  /* ~ */

  protected get chunk$(): Promise<uint> {
    // /*#static*/ if (INOUT) {
    //   assert(!this.tsCap$);
    // }
    this.tsCap$ = Promise.withResolvers<uint8>();
    /* resume pending write */
    this.wsCap$?.resolve();
    this.wsCap$ = undefined;
    return this.tsCap$.promise;
  }
  /* ~ */

  readonly safeguard = Promise.withResolvers<void>();

  constructor() {
    this.writable = new WritableStream<Uint8Array>(
      {
        start: this._wsStart,
        write: this._wsWrite,
        close: this._wsClose,
        abort: this._wsAbort,
      },
      // new ByteLengthQueuingStrategy({ highWaterMark: 64 * 1024 }),
    );
    // this.writer = this.writable.getWriter();
  }
  /*64||||||||||||||||||||||||||||||||||||||||||||||||||||||||||*/

  @bind
  @traceOut(_TRACE)
  private _wsStart(_wc_x: WritableStreamDefaultController) {
    /*#static*/ if (_TRACE) {
      console.log(
        `${trace.indent}>>>>>>> ${this._type_id_}._wsStart() >>>>>>>`,
      );
    }
    ///
  }

  /**
   * `in( !this.wsCap$)`\
   * `in( this.tsLen$ === 0 || this.tsBuf$)`
   * @const @param chunk_x
   */
  @bind
  @traceOut(_TRACE)
  private _wsWrite(chunk_x: Uint8Array) {
    /*#static*/ if (_TRACE) {
      console.log(
        `${trace.indent}>>>>>>> ${this._type_id_}._wsWrite() >>>>>>>`,
      );
      console.log(`${trace.dent}chunk_x.length: ${chunk_x.length}`);
    }
    if (this.wsDone$) return;

    const len_1 = Math.min(this.tsLen$, chunk_x.length);
    /* actural sink */ if (this.tsLen$ > 0) {
      const LEN = this.tsOfs$ + len_1;
      for (let i = 0, j = this.tsOfs$; j < LEN; ++i, ++j) {
        this.tsBuf$![j] = chunk_x[i];
      }
      this.tsOfs$ = LEN;
      this.tsLen$ -= len_1;
    }
    /* save the rest */ if (len_1 < chunk_x.length) {
      this.wsU8a$ = len_1 === 0 ? chunk_x : chunk_x.subarray(len_1);
      this.wsOfs$ = 0;
    }
    // console.log(`${trace.dent}`, {
    //   tsOfs: this.tsOfs$,
    //   tsLen: this.tsLen$,
    //   tsLEN: this.tsLEN$,
    // }, `wsU8a$.length: ${this.wsU8a$?.length}`);

    if (this.tsLen$ === 0) {
      // this.tsBuf$ = undefined;
      this.tsCap$?.resolve(this.tsRed$ + this.tsLEN$);
      this.tsCap$ = undefined;
      this.tsRed$ = 0; //!

      /*#static*/ if (INOUT) {
        assert(!this.wsCap$);
      }
      this.wsCap$ = Promise.withResolvers();
    }

    return this.wsCap$?.promise;
  }

  @bind
  @traceOut(_TRACE)
  private _wsClose() {
    /*#static*/ if (_TRACE) {
      console.log(
        `${trace.indent}>>>>>>> ${this._type_id_}._wsClose() >>>>>>>`,
      );
    }
    /*#static*/ if (INOUT) {
      assert(this.wsCap$ === undefined);
    }
    // console.log(`${trace.dent}`, {
    //   tsOfs: this.tsOfs$,
    //   tsLen: this.tsLen$,
    //   tsLEN: this.tsLEN$,
    // });
    /* Inputs are all written. If some requirer is still waiting, reply to it. */
    this.tsCap$?.resolve(this.tsRed$ + this.tsLEN$ - this.tsLen$);
    this.tsCap$ = undefined;

    // this.tsBuf$ = undefined;
    // this.wsU8a$ = undefined;
    this.wsDone$ = true;
  }

  @bind
  @traceOut(_TRACE)
  private _wsAbort(r_x: unknown) {
    /*#static*/ if (_TRACE) {
      console.log(
        `${trace.indent}>>>>>>> ${this._type_id_}._wsAbort() >>>>>>>`,
      );
      console.log(`${trace.dent}reason: ${r_x}`);
    }
    ///
  }

  @traceOut(_TRACE)
  cleanup() {
    /*#static*/ if (_TRACE) {
      console.log(`${trace.indent}>>>>>>> ${this._type_id_}.cleanup() >>>>>>>`);
    }
    /* Coding is done but write may still be pending. Let write run, and set
    `wsDone$` to `true` to ignore rest writes if any. */
    this.wsCap$?.resolve();
    this.wsCap$ = undefined;
    this.wsDone$ = true;
  }
}
/*80--------------------------------------------------------------------------*/
