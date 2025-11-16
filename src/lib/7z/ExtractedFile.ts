/** 80**************************************************************************
 * @module lib/7z/ExtractedFile
 * @license LGPL-2.1
 ******************************************************************************/

import { _TRACE, INOUT } from "../../preNs.ts";
import type { id_t } from "../alias.ts";
import { assert, bind } from "../util.ts";
import { trace, traceOut } from "../util/trace.ts";
import type { CFileItem } from "./CDbEx.ts";
/*80--------------------------------------------------------------------------*/

/** @final */
export class ExtractedFile {
  static #ID = 0 as id_t;
  readonly id = ++ExtractedFile.#ID as id_t;
  get _type_id_() {
    return `${this.constructor.name}_${this.id}`;
  }
  /*64||||||||||||||||||||||||||||||||||||||||||||||||||||||||||*/

  readonly path;

  readonly #meta;
  get hasStream() {
    return this.#meta.HasStream;
  }
  get crc32() {
    return this.#meta.Crc;
  }
  get isDir() {
    return this.#meta.IsDir;
  }

  /* readable */
  // #rsEnque: ((chunk_x: Uint8Array) => void) | undefined;
  // #rsClose!: () => void;

  readonly #gen;

  readonly readable;
  /* ~ */

  /**
   * @const @param path_x
   * @const @param meta_x
   * @headconst @param gen_x
   */
  constructor(
    path_x: string,
    meta_x: CFileItem,
    gen_x?: AsyncGenerator<Uint8Array>,
  ) {
    this.path = path_x;
    this.#meta = meta_x;
    this.#gen = gen_x;

    if (this.hasStream) {
      /*#static*/ if (INOUT) {
        assert(this.#gen);
      }
      this.readable = new ReadableStream<Uint8Array>({
        start: this._rsStart,
        pull: this._rsPull,
        cancel: this._rsCancel,
      });
    }
  }
  /*64||||||||||||||||||||||||||||||||||||||||||||||||||||||||||*/

  @bind
  @traceOut(_TRACE)
  private _rsStart(_rc_x: ReadableStreamDefaultController<Uint8Array>) {
    /*#static*/ if (_TRACE) {
      console.log(
        `${trace.indent}>>>>>>> ${this._type_id_}._rsStart() >>>>>>>`,
      );
    }
    // this.#rsEnque = (_y) => rc_x.enqueue(_y);
    // this.#rsClose = () => rc_x.close();
  }

  @bind
  @traceOut(_TRACE)
  private async _rsPull(rc_x: ReadableStreamDefaultController<Uint8Array>) {
    /*#static*/ if (_TRACE) {
      console.log(`${trace.indent}>>>>>>> ${this._type_id_}._rsPull() >>>>>>>`);
    }
    const { done, value } = await this.#gen!.next();
    if (done) {
      rc_x.close();
      return;
    }

    rc_x.enqueue(value);
  }

  @bind
  @traceOut(_TRACE)
  private _rsCancel(r_x: unknown) {
    /*#static*/ if (_TRACE) {
      console.log(
        `${trace.indent}>>>>>>> ${this._type_id_}._rsCancel() >>>>>>>`,
      );
      console.log(`${trace.dent}reason: ${r_x}`);
    }
    ///
  }
}
/*80--------------------------------------------------------------------------*/
