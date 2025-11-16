/** 80**************************************************************************
 * @module lib/7z/StreamBufr
 * @license MIT
 ******************************************************************************/

import { _TRACE, INOUT } from "../../preNs.ts";
import type { uint } from "../alias.ts";
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

  /** For testing only */
  toString() {
    return `[${this.strt},${this.stop})`;
  }
}

type Ran_ = {
  strt: uint;
  stop: uint;
};

/** no overlap, but may be discontinuous */
export class StreamBufr extends DoublyLList<OfsChunk_> {
  /** @const */
  get size(): uint {
    return this.last$?.payload.stop ?? 0;
  }

  /** current node */
  protected cnd$: DoublyLListNode<OfsChunk_> | undefined;
  /** `in( !this.empty)` */
  get cnd(): DoublyLListNode<OfsChunk_> {
    this.cnd$ ??= this.frst$!;
    return this.cnd$;
  }

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
      if (nd_) this.deleteRange$(undefined, nd_);
    }

    this.#strt = _x;
  }

  /** `Ran_`s strictly after `#strt` */
  readonly #disuse_sa = new SortedArray<Ran_>((a, b) => a.strt < b.strt);
  /*64||||||||||||||||||||||||||||||||||||||||||||||||||||||||||*/

  /**
   * @const @param u8a_x
   * @const @param strt_x absolute `>=size`
   */
  add(u8a_x: Uint8Array, strt_x = this.size): void {
    this.append$(new OfsChunk_(strt_x, u8a_x));
    // console.log(`%crun here: size: ${this.size}`, `color:yellow`);
  }

  /**
   * @const @param strt_x
   * @const @param stop_x
   */
  @traceOut(_TRACE)
  disuse(strt_x: uint, stop_x: uint): void {
    /*#static*/ if (_TRACE) {
      console.log(
        `${trace.indent}>>>>>>> StreamBufr.disuse( ${strt_x}, ${stop_x}) >>>>>>>`,
      );
    }
    if (stop_x <= this.#strt) return;

    if (this.#strt < strt_x) {
      this.#disuse_sa.add({ strt: strt_x, stop: stop_x });
      return;
    }

    let newStrt = stop_x;
    let maxStop = 0;
    let i_ = 0, j_ = -1;
    for (const iI = this.#disuse_sa.length; i_ < iI; i_++) {
      const disuse_i = this.#disuse_sa[i_];
      if (newStrt < disuse_i.strt) break;

      newStrt = Math.max(disuse_i.stop, newStrt);

      if (disuse_i.stop > maxStop) {
        maxStop = disuse_i.stop;
        j_ = i_;
      } else if (disuse_i.stop === maxStop && j_ >= 0) {
        const disuse_j = this.#disuse_sa[j_];
        /* keep shorter one */ if (
          disuse_i.stop - disuse_i.strt < disuse_j.stop - disuse_j.strt
        ) {
          maxStop = disuse_i.stop;
          j_ = i_;
        }
      }
    }
    if (maxStop < newStrt) {
      this.#disuse_sa.copyWithin(0, i_);
      this.#disuse_sa.length -= i_;
    } else if (j_ >= 0) {
      /*#static*/ if (INOUT) {
        assert(maxStop === newStrt && j_ < i_);
      }
      if (this.#disuse_sa.at(i_)?.strt === newStrt) {
        this.#disuse_sa.copyWithin(0, i_);
        this.#disuse_sa.length -= i_;
      } /* keep `#disuse_sa[j_]` */ else {
        this.#disuse_sa[i_ - 1] = this.#disuse_sa[j_];
        this.#disuse_sa.copyWithin(0, i_ - 1);
        this.#disuse_sa.length -= i_ - 1;
        newStrt = this.#disuse_sa[0].strt;
        /*#static*/ if (INOUT) {
          assert(this.#strt <= newStrt);
        }
      }
    }

    this._strt = newStrt;
  }

  /**
   * @const
   * @const @param len_x
   * @const @param strt_x
   * @return The amount not prepared
   */
  prepare(len_x: uint, strt_x: uint): uint {
    return Math.max(len_x - (this.size - strt_x), 0);
  }

  // /**
  //  * @const @param ofs_x
  //  * @throw {@linkcode ExceedSize}
  //  */
  // #peekByte(ofs_x: uint): uint8 {
  //   let ret: uint8;
  //   const cofs_0 = this.#cofs;
  //   this.cofs = ofs_x;

  //   const strt_ = this.caofs;
  //   const stop_ = strt_ + 1;
  //   const cnd = this.cnd;
  //   if (strt_ < cnd.payload.stop) {
  //     ret = cnd.payload.chunk[strt_ - cnd.payload.strt];
  //   } else if (cnd.next) {
  //     ret = cnd.next.payload.chunk[0];
  //   } else {
  //     throw new ExceedSize(`${stop_} > ${cnd.payload.stop}`);
  //   }

  //   this.cofs = cofs_0;
  //   return ret;
  // }

  /**
   * @const @param len_x
   * @const @param strt_x
   * @borrow @const @return
   * @throw {@linkcode ExceedSize}
   */
  peek(len_x: uint, strt_x: uint): Uint8Array[] {
    const ret: Uint8Array[] = [];

    const stop_ = strt_x + len_x;
    let cnd = this.cnd;
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
      throw new ExceedSize(`${stop_} > ${cnd.payload.stop}`);
    }

    return ret;
  }
}
/*80--------------------------------------------------------------------------*/
