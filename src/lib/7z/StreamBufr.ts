/** 80**************************************************************************
 * @module lib/7z/StreamBufr
 * @license MIT
 ******************************************************************************/

import { _TRACE, AUTOTEST, INOUT, PRF } from "../../preNs.ts";
import type { uint, uint8 } from "../alias.ts";
import { LOG_cssc } from "../alias.ts";
import "../jslang.ts";
import { assert } from "../util.ts";
import type { DoublyLListNode } from "../util/LList.ts";
import { DoublyLList } from "../util/LList.ts";
import { SortedArray } from "../util/SortedArray.ts";
import { trace, traceOut } from "../util/trace.ts";
import { ExceedSize } from "./util.ts";
/*80--------------------------------------------------------------------------*/

class OfsChunk_ {
  readonly strt: uint;
  readonly chunk: Uint8Array;
  readonly stop: uint;

  /**
   * @const @param strt_x
   * @const @param chunk_x
   */
  constructor(strt_x: uint, chunk_x: Uint8Array) {
    this.strt = strt_x;
    this.chunk = chunk_x;
    this.stop = strt_x + chunk_x.length;
  }
  /*64||||||||||||||||||||||||||||||||||||||||||||||||||||||||||*/

  /** `in( this.strt <= ofs_x && ofs_x < this.stop)` */
  readByte(ofs_x: uint): uint8 {
    return this.chunk[ofs_x - this.strt];
  }

  /** `in( this.strt <= ofs_x && ofs_x < this.stop)` */
  writeByte(ofs_x: uint, val_x: uint): void {
    this.chunk[ofs_x - this.strt] = val_x & 0xFF;
  }
  /*64||||||||||||||||||||||||||||||||||||||||||||||||||||||||||*/

  /** For testing only */
  toString() {
    return `[${this.strt},${this.stop})`;
  }
}

type Ran_ = {
  strt: uint;
  stop: uint;
};

/** No overlap, but may be discontinuous */
export class StreamBufr extends DoublyLList<OfsChunk_> {
  /** @const */
  get size(): uint {
    return this.last$?.payload.stop ?? 0;
  }

  /* cmd$ */
  /** current node */
  protected cnd$: DoublyLListNode<OfsChunk_> | undefined;
  /** `in( !this.empty)` */
  get cnd(): DoublyLListNode<OfsChunk_> {
    this.cnd$ ??= this.frst$!;
    return this.cnd$;
  }

  /** @const @param ofs_x */
  protected setCnd$(ofs_x: uint): DoublyLListNode<OfsChunk_> {
    let cnd = this.cnd;
    if (ofs_x < cnd.payload.strt) {
      for (; cnd.prev && ofs_x < cnd.prev.payload.strt; cnd = cnd.prev);
      this.cnd$ = cnd.prev ?? cnd;
    } else if (cnd.payload.stop < ofs_x) {
      for (; cnd.next && cnd.next.payload.stop < ofs_x; cnd = cnd.next);
      this.cnd$ = cnd.next ?? cnd;
    }
    return cnd;
  }
  /* ~ */

  /** Chunks before `#strt` can be deleted. */
  #strt: uint = 0;
  private set _strt(_x: uint) {
    // console.log(
    //   `%c${this._type_id_}._strt( ${_x}): frst$: ${this.frst$?.payload}`,
    //   `color:yellow`,
    // );
    let nd_ = this.frst$;
    for (; nd_ && nd_.payload.strt < _x; nd_ = nd_.next);
    if (nd_?.prev) {
      nd_ = nd_.prev;
      if (nd_.payload.stop > _x) nd_ = nd_.prev;
      if (nd_) {
        // /*#static*/ if (PRF || AUTOTEST) {
        //   let nd_1: DoublyLListNode<OfsChunk_> | undefined = nd_;
        //   let deld = 0;
        //   do {
        //     deld += nd_1.payload.chunk.length;
        //     nd_1 = nd_1.prev;
        //   } while (nd_1);
        //   this._mem_ -= deld;
        // }
        this.deleteRange$(undefined, nd_);
      }
    }

    this.#strt = _x;
  }

  _mem_ = 0;
  _maxMem_ = 0;

  /** `Ran_`s strictly after `#strt` */
  readonly #disuse_sa = new SortedArray<Ran_>((a, b) => a.strt < b.strt);
  /*64||||||||||||||||||||||||||||||||||||||||||||||||||||||||||*/

  /**
   * @const @param u8a_x
   * @const @param strt_x absolute `>=size`
   */
  @traceOut(_TRACE)
  add(u8a_x: Uint8Array, strt_x = this.size): void {
    /*#static*/ if (_TRACE) {
      console.log(
        `${trace.indent}>>>>>>> ${this._type_id_}.add( , ${strt_x}) >>>>>>>`,
      );
      console.log(`${trace.dent}u8a_x.length: ${u8a_x.length}`);
    }
    this.append$(new OfsChunk_(strt_x, u8a_x));
    // console.log(`%crun here: size: ${this.size}`, `color:yellow`);

    // /*#static*/ if (PRF || AUTOTEST) {
    //   this._mem_ += this.last$!.payload.chunk.length;
    //   if (this._mem_ > this._maxMem_) {
    //     this._maxMem_ = this._mem_;
    //     console.log(
    //       `%c${this._type_id_}: _maxMem_: ${this._maxMem_}`,
    //       `color:${LOG_cssc.performance}`,
    //     );
    //   }
    // }
  }

  /**
   * @const @param strt_x
   * @const @param stop_x
   */
  @traceOut(_TRACE)
  disuse(strt_x: uint, stop_x: uint): void {
    /*#static*/ if (_TRACE) {
      console.log(
        `${trace.indent}>>>>>>> ${this._type_id_}.disuse( strt_x: ${strt_x}, stop_x: ${stop_x}) >>>>>>>`,
      );
    }
    if (stop_x <= this.#strt) return;

    if (this.#strt < strt_x) {
      this.#disuse_sa.add({ strt: strt_x, stop: stop_x });
      return;
    }

    let newStrt = stop_x;
    let i_ = 0;
    for (const iI = this.#disuse_sa.length; i_ < iI; i_++) {
      const disuse_i = this.#disuse_sa[i_];
      if (newStrt < disuse_i.strt) break;

      newStrt = Math.max(disuse_i.stop, newStrt);
    }
    this.#disuse_sa.copyWithin(0, i_);
    this.#disuse_sa.length -= i_;

    this._strt = newStrt;
  }

  /**
   * @const
   * @const @param size_x
   * @const @param strt_x
   * @return The amount not prepared
   */
  prepare(size_x: uint, strt_x: uint): uint {
    return Math.max(size_x - (this.size - strt_x), 0);
  }

  /**
   * @const
   * @const @param size_x
   * @const @param strt_x
   * @borrow @const @return
   * @throw {@linkcode ExceedSize}
   */
  @traceOut(_TRACE)
  peek(size_x: uint, strt_x: uint): Uint8Array[] {
    /*#static*/ if (_TRACE) {
      console.log(
        `${trace.indent}>>>>>>> ${this._type_id_}.peek( size_x: ${size_x}, strt_x: ${strt_x}) >>>>>>>`,
      );
    }
    const ret: Uint8Array[] = [];
    const cnd_0 = this.cnd$;

    const stop_ = strt_x + size_x;
    let cnd = this.setCnd$(strt_x);
    if (strt_x < cnd.payload.stop) {
      ret.push(
        cnd.payload.chunk.subarray(
          strt_x - cnd.payload.strt,
          Math.min(stop_ - cnd.payload.strt, cnd.payload.chunk.length),
        ),
      );
    }
    while (cnd.next && stop_ > cnd.next.payload.strt) {
      cnd = cnd.next;
      ret.push(
        stop_ < cnd.payload.stop
          ? cnd.payload.chunk.subarray(0, stop_ - cnd.payload.strt)
          : cnd.payload.chunk,
      );
    }
    if (stop_ > cnd.payload.stop) {
      throw new ExceedSize(`stop_: ${stop_} > ${cnd.payload.stop}`);
    }

    this.cnd$ = cnd_0;
    return ret;
  }
}
/*80--------------------------------------------------------------------------*/
