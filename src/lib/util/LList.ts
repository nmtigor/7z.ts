/** 80**************************************************************************
 * Linked List
 *
 * @module lib/util/LList
 * @license MIT
 ******************************************************************************/

import { INOUT } from "../../preNs.ts";
import type { id_t } from "../alias.ts";
import { assert } from "../util.ts";
/*80--------------------------------------------------------------------------*/

interface LListNode<T> {
  llist?: LList<T> | undefined;
  payload: T;
}

abstract class LList<T> {
  static #ID = 0 as id_t;
  readonly id = ++LList.#ID as id_t;
  /** @final */
  get _type_id_() {
    return `${this.constructor.name}_${this.id}`;
  }
  /*64||||||||||||||||||||||||||||||||||||||||||||||||||||||||||*/

  protected abstract frst$: LListNode<T> | undefined;
  protected abstract last$: LListNode<T> | undefined;

  /** @final */
  get empty() {
    return !this.frst$ || !this.last$;
  }
  /*64||||||||||||||||||||||||||||||||||||||||||||||||||||||||||*/
}
/*64----------------------------------------------------------*/

interface SinglyLListNode<T> extends LListNode<T> {
  next?: SinglyLListNode<T> | undefined;
}

export class SinglyLList<T> extends LList<T> {
  /** @implement */
  protected frst$: SinglyLListNode<T> | undefined;
  /** @implement */
  protected last$: SinglyLListNode<T> | undefined;
  /*64||||||||||||||||||||||||||||||||||||||||||||||||||||||||||*/
}
/*64----------------------------------------------------------*/

export interface DoublyLListNode<T> extends LListNode<T> {
  prev?: DoublyLListNode<T> | undefined;
  next?: DoublyLListNode<T> | undefined;
}

export class DoublyLList<T> extends LList<T> {
  /** @implement */
  protected frst$: DoublyLListNode<T> | undefined;
  /** @implement */
  protected last$: DoublyLListNode<T> | undefined;
  /*64||||||||||||||||||||||||||||||||||||||||||||||||||||||||||*/

  /**
   * `in( this.frst$ && this.last$)`
   * @headconst @param frst_x
   * @headconst @param last_x
   */
  protected deleteRange$(
    frst_x: DoublyLListNode<T> | undefined = this.frst$,
    last_x: DoublyLListNode<T> | undefined = this.last$,
  ): void {
    // console.log(
    //   `%c${this._type_id_}.deleteRange$(): [${frst_x},${last_x}]`,
    //   `color:orange`,
    // );
    if (!frst_x || !last_x) return;

    /*#static*/ if (INOUT) {
      assert(frst_x.llist === this && last_x.llist === this);
      assert(frst_x.prev || frst_x === this.frst$);
      assert(last_x.next || last_x === this.last$);
    }
    if (!frst_x.prev) this.frst$ = last_x.next;
    if (!last_x.next) this.last$ = frst_x.prev;
    if (frst_x.prev) frst_x.prev.next = last_x.next;
    if (last_x.next) last_x.next.prev = frst_x.prev;

    //jjjj TOCLEANUP
    // let nd_ = frst_x;
    // const VALVE = 10_000;
    // let valve = VALVE;
    // do {
    //   nd_.llist = undefined;
    //   if (nd_ === last_x) break;

    //   nd_ = nd_.next!;
    // } while (--valve);
    // assert(valve, `Loop ${VALVE}±1 times`);

    frst_x.llist = undefined;
    last_x.llist = undefined;
  }

  /** @headconst @param nd_x */
  protected delete$(nd_x: DoublyLListNode<T>): void {
    this.deleteRange$(nd_x, nd_x);
  }

  /**
   * Insert after `nd_x` a new node containing `pl_x`
   * @headconst @param nd_x
   * @const @param pl_x
   */
  protected insertNext$(nd_x: DoublyLListNode<T>, pl_x: T): void {
    /*#static*/ if (INOUT) {
      assert(nd_x.llist === this);
    }
    const nd_: DoublyLListNode<T> = {
      llist: this,
      payload: pl_x,
    };
    if (nd_x.next) {
      nd_x.next.prev = nd_;
      nd_.next = nd_x.next;
    } else {
      this.last$ = nd_;
    }
    nd_.prev = nd_x;
    nd_x.next = nd_;
  }

  /** @const @param pl_x */
  protected append$(pl_x: T): void {
    if (this.empty) {
      this.frst$ = this.last$ = { llist: this, payload: pl_x };
    } else {
      this.insertNext$(this.last$!, pl_x);
    }
  }
}
/*80--------------------------------------------------------------------------*/
