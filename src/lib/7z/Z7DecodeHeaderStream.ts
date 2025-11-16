/** 80**************************************************************************
 * @module lib/7z/Z7DecodeHeaderStream
 * @license LGPL-2.1
 ******************************************************************************/

import { _TRACE } from "../../preNs.ts";
import type { uint } from "../alias.ts";
import { trace, traceOut } from "../util/trace.ts";
import { NID } from "./alias.ts";
import type { CDbEx } from "./CDbEx.ts";
import { IncorrectFormat } from "./util.ts";
import { Z7DecodeStream } from "./Z7DecodeStream.ts";
/*80--------------------------------------------------------------------------*/

export class Z7DecodeHeaderStream extends Z7DecodeStream {
  readonly #size;
  readonly #db;

  readonly chunk_a: Uint8Array[] = [];

  /**
   * @const @param size_x
   * @borrow @headconst @param db_x
   */
  constructor(size_x: uint, db_x: CDbEx) {
    super();
    this.#size = size_x;
    this.#db = db_x;

    this.#parse();
  }
  /*64||||||||||||||||||||||||||||||||||||||||||||||||||||||||||*/

  /**
   * @throw {@linkcode ExceedSize}
   * @throw {@linkcode IncorrectFormat}
   * @throw {@linkcode UnsupportedFeature}
   * @throw {@linkcode ExcessiveMemoryUsage}
   */
  @traceOut(_TRACE)
  async #processAsync(): Promise<void> {
    /*#static*/ if (_TRACE) {
      console.log(
        `${trace.indent}>>>>>>> ${this._type_}.#processAsync() >>>>>>>`,
      );
    }
    const bufr = this.bufr$;

    await this.prepareAsync$(this.#size, () => {
      if (!this.wsDone$) {
        // console.log(`${this._type_}.#processAsync()`, this.wsU8a$);
        this.chunk_a.push(this.wsU8a$!);
      }
    });
    if (bufr.readUint() !== NID.kHeader) throw new IncorrectFormat();
    bufr.readHeader(this.#size, this.#db);
  }

  #parse(): void {
    this.#processAsync().then(() => {
      this.error.resolve(null);
    }).catch(this.error.resolve)
      .finally(() => {
        this.cleanup();
      });
  }
}
/*80--------------------------------------------------------------------------*/
