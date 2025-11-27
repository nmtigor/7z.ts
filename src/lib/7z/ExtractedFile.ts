/** 80**************************************************************************
 * @module lib/7z/ExtractedFile
 * @license LGPL-2.1
 ******************************************************************************/

import { _TRACE, INOUT } from "../../preNs.ts";
import type { id_t, ts_t, uint, uint32 } from "../alias.ts";
import { assert, bind } from "../util.ts";
import { trace, traceOut } from "../util/trace.ts";
import type { CDatabase } from "./CDbEx.ts";
import { utsFrom } from "./util.ts";
/*80--------------------------------------------------------------------------*/

/** @final */
export class ExtractedFile {
  static #ID = 0 as id_t;
  readonly id = ++ExtractedFile.#ID as id_t;
  get _type_id_() {
    return `${this.constructor.name}_${this.id}`;
  }
  /*64||||||||||||||||||||||||||||||||||||||||||||||||||||||||||*/

  readonly arcPath: string;
  readonly size: uint;
  readonly crc32: uint32 | undefined;
  readonly isDir: boolean;
  readonly ctime: ts_t | undefined;
  readonly atime: ts_t | undefined;
  readonly mtime: ts_t | undefined;
  readonly startPos: bigint | undefined;
  readonly attrib: uint32 | undefined;
  readonly isAnti: boolean | undefined;

  /* readable */
  // #rsEnque: ((chunk_x: Uint8Array) => void) | undefined;
  #rsClose: (() => void) | undefined;

  readonly #gen;

  readonly readable;
  /* ~ */

  readonly safeguard = Promise.withResolvers<void>();

  /**
   * @const @param db_x
   * @const @param fi_x
   * @headconst @param gen_x
   */
  constructor(
    db_x: CDatabase,
    fi_x: uint,
    gen_x?: AsyncGenerator<Uint8Array>,
  ) {
    this.arcPath = db_x.Names[fi_x];
    this.size = db_x.Files[fi_x].Size;
    this.crc32 = db_x.Files[fi_x].Crc;
    this.isDir = db_x.Files[fi_x].IsDir;
    let wts = db_x.CTime?.at(fi_x);
    this.ctime = wts === undefined ? undefined : utsFrom(wts);
    wts = db_x.ATime?.at(fi_x);
    this.atime = wts === undefined ? undefined : utsFrom(wts);
    wts = db_x.MTime?.at(fi_x);
    this.mtime = wts === undefined ? undefined : utsFrom(wts);
    this.startPos = db_x.StartPos?.at(fi_x);
    this.attrib = db_x.Attrib?.at(fi_x);
    this.isAnti = db_x.IsAnti?.at(fi_x);

    this.#gen = gen_x;
    if (this.size) {
      /*#static*/ if (INOUT) {
        assert(this.#gen);
      }
      this.readable = new ReadableStream<Uint8Array>({
        start: this._rsStart,
        pull: this._rsPull,
        //jjjj TOCLEANUP
        // cancel: this._rsCancel,
      });
    } else {
      this.safeguard.resolve();
    }
  }

  #destroyed = false;
  @traceOut(_TRACE)
  destructor() {
    /*#static*/ if (_TRACE) {
      console.log(
        `${trace.indent}>>>>>>> ${this._type_id_}.destructor() >>>>>>>`,
      );
    }
    if (this.#destroyed) return;

    // console.log(`%c${trace.dent}!!this.#rsClose: ${!!this.#rsClose}`, `color:blue`);
    this.#rsClose?.();

    this.#destroyed = true;
  }

  [Symbol.dispose]() {
    this.destructor();
  }
  /*64||||||||||||||||||||||||||||||||||||||||||||||||||||||||||*/

  @bind
  @traceOut(_TRACE)
  private _rsStart(rc_x: ReadableStreamDefaultController<Uint8Array>) {
    /*#static*/ if (_TRACE) {
      console.log(
        `${trace.indent}>>>>>>> ${this._type_id_}._rsStart() >>>>>>>`,
      );
    }
    // this.#rsEnque = (_y) => rc_x.enqueue(_y);
    this.#rsClose = () => rc_x.close();
  }

  @bind
  @traceOut(_TRACE)
  private async _rsPull(rc_x: ReadableStreamDefaultController<Uint8Array>) {
    /*#static*/ if (_TRACE) {
      console.log(`${trace.indent}>>>>>>> ${this._type_id_}._rsPull() >>>>>>>`);
    }
    try {
      const { value, done } = await this.#gen!.next();
      if (done) {
        this.safeguard.resolve();
        rc_x.close();
        this.#rsClose = undefined;
        return;
      }

      rc_x.enqueue(value);
    } catch (err) {
      this.safeguard.reject(err);
      rc_x.close();
      this.#rsClose = undefined;
    }
  }

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
}
/*80--------------------------------------------------------------------------*/
