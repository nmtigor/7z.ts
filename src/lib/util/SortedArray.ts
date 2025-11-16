/** 80**************************************************************************
 * @module lib/util/SortedArray
 * @license MIT
 ******************************************************************************/

import { INOUT } from "../../preNs.ts";
import type { id_t } from "../alias.ts";
import type { int, uint } from "../alias.ts";
import "../jslang.ts";
import { assert, fail } from "../util.ts";
/*80--------------------------------------------------------------------------*/

export type Less<T> = (a: T, b: T) => boolean;

//kkkk SortedArray: consider using B-tree, ref. https://youtu.be/K1a2Bk8NrYQ
/**
 * Completely ordered array without duplicate.
 *
 * primaryconst: const exclude `#sorted`, `#tmp_a`
 */
export class SortedArray<T> extends Array<T> {
  static #ID = 0 as id_t;
  readonly id = ++SortedArray.#ID as id_t;
  /** @final */
  get _type_id_() {
    return `${this.constructor.name}_${this.id}`;
  }
  /*64||||||||||||||||||||||||||||||||||||||||||||||||||||||||||*/

  #less: Less<T>;
  setLess(_x: Less<T>): this {
    if (_x === this.#less) return this;

    this.#less = _x;
    this.#sorted = false;
    return this;
  }

  #tmp_a: (T | undefined)[] | undefined;
  protected get tmp_a$() {
    this.#tmp_a ??= [];
    return this.#tmp_a;
  }
  get _tmp_a_() {
    return this.#tmp_a;
  }

  /**
   * [0, this.length]
   * Helper. Set by `includes()`
   */
  #index: uint = 0;
  // get _index_() {
  //   return this.#index;
  // }

  #sorted: boolean;
  get sorted() {
    return this.#sorted;
  }
  messUp(): this {
    this.#sorted = false;
    return this;
  }

  /**
   * @headconst @param less_x
   * @headconst @param val_a_x Not handled yet. Could `resort()` later
   */
  // deno-lint-ignore constructor-super
  constructor(less_x: Less<T>, val_a_x?: T[]) {
    if (val_a_x) {
      if (val_a_x.length === 1) {
        super(1);
        this[0] = val_a_x[0];
        this.#sorted = true;
      } else {
        super(...val_a_x);
        this.#sorted = false;
      }
    } else {
      super();
      this.#sorted = true;
    }
    this.#less = less_x;
  }

  reset_SortedArray(): this {
    this.length = 0;
    this.#index = 0; //!
    this.#tmp_a = undefined;
    this.#sorted = true;
    return this;
  }
  /*64||||||||||||||||||||||||||||||||||||||||||||||||||||||||||*/

  /**
   * If `#sorted`, assign `#index`
   * @headconst @param val_x
   */
  override includes(val_x: T): boolean {
    return this.#sorted
      ? this.#find_j(val_x, 0, this.length)
      : super.includes(val_x);
  }

  /**
   * If `#sorted`, assign `#index`
   * @headconst @param val_x
   */
  override indexOf(val_x: T): uint | -1 {
    return this.#sorted
      ? this.includes(val_x) ? this.#index : -1
      : super.indexOf(val_x);
  }

  /**
   * It seems that `Array.slice()` would call the constructor implicitly, which
   * will cause problems because this constructor is inconsistent with Array's
   * constructor.
   */
  override slice(strt_x?: int | undefined, stop_x?: int | undefined): T[] {
    if (!this.length) return [];

    if (strt_x === undefined) strt_x = 0;
    else strt_x = Number.normalize(strt_x, this.length);
    if (stop_x === undefined) stop_x = this.length;
    else stop_x = Number.normalize(stop_x, this.length);
    if (strt_x! >= stop_x!) return [];

    const ret = new Array<T>(stop_x! - strt_x!);
    for (let i = ret.length; i--;) {
      ret[i] = this[strt_x! + i];
    }
    return ret;
  }

  /**
   * Disable `splice()` for the moment.
   *
   * It seems that `Array.splice()` would call the constructor implicitly, which
   * will cause problems because this constructor is inconsistent with Array's
   * constructor.
   */
  override splice(..._x: unknown[]): T[] {
    fail("Disabled");
  }

  /** @see {@linkcode splice()} */
  override map<U>(
    _callbackfn: (value: T, index: number, array: T[]) => U,
    _thisArg?: unknown,
  ): U[] {
    fail("Disabled");
  }
  /*64||||||||||||||||||||||||||||||||||||||||||||||||||||||||||*/

  // more_or_equal_( a, b ) { return this.#less( b, a ); }
  // unequal_( a, b ) { return this.#less( a, b ) || this.#less( b, a ); }
  // equal_( a, b ) { return !this.unequal_( a, b ); }
  // less_or_equal_( a, b ) { return this.#less( a, b ) || this.equal_( a, b ); }
  // more_( a, b ) { return this.less_or_equal_( b, a ); }

  /**
   * Assign `#index`
   * @headconst @param val_x
   * @const @param jdx_x
   * @const @param len_x
   */
  #find_j(val_x: T, jdx_x: uint, len_x: uint): boolean {
    let ret = false;
    if (len_x === 1) {
      if (this.#less(this[jdx_x], val_x)) {
        this.#index = jdx_x + 1;
      } else if (this.#less(val_x, this[jdx_x])) {
        this.#index = jdx_x;
      } else {
        this.#index = jdx_x;
        ret = true;
      }
    } else if (len_x > 1) {
      const m = Math.floor(len_x / 2);
      if (this.#less(val_x, this[jdx_x + m])) {
        ret = this.#find_j(val_x, jdx_x, m);
      } else if (this.#less(this[jdx_x + m], val_x)) {
        ret = this.#find_j(val_x, jdx_x + m, len_x - m);
      } else {
        this.#index = jdx_x + m;
        ret = true;
      }
    }
    return ret;
  }

  /**
   * Return index of smallest one greater equal than `val_x
   * Return `-1` if `empty`, `len` if no such one
   * @headconst @param val_x
   */
  mostGE(val_x: T): uint | -1 {
    /*#static*/ if (INOUT) {
      assert(this.#sorted, "This method is callable only in the sorted state.");
    }
    if (!this.length) return -1;

    let ret = this.indexOf(val_x);
    if (ret < 0) {
      if (this.#index === this.length) {
        ret = this.#index;
      } else if (this.#less(this[this.#index], val_x)) {
        ret = this.#index + 1;
      } else {
        ret = this.#index;
      }
    }
    return ret;
  }
  // /**
  //  * Return index of greatest one smaller equal than `val_x
  //  * Return `-1` if no such one
  //  * @headconst @param val_x
  //  */
  // mostSE( val_x:T ):int
  // {
  //   if( this.empty ) return -1

  //   let ret = this.indexOf( val_x );
  //   if( ret < 0 )
  //   {
  //     if( this.#index === this.len ) ret = this.#index - 1;
  //     else if( this.#less( val_x, this.val_a$[this.#index] ) )
  //          ret = this.#index - 1;
  //     else ret = this.#index;
  //   }
  //   return ret;
  // }

  /**
   * Newly add, keeping sorted
   * @headconst @param val_x
   * @return the index of the added;
   *    if already exist, return `-1`
   */
  add(val_x: T): uint | -1 {
    /*#static*/ if (INOUT) {
      assert(this.#sorted, "This method is callable only in the sorted state.");
    }
    const had = this.includes(val_x);
    if (!had) {
      for (let i = this.length; i-- > this.#index;) {
        this[i + 1] = this[i];
      }
      this[this.#index] = val_x;
    }
    return had ? -1 : this.#index;
  }
  /** @headconst @param val_a_x */
  add_O(val_a_x?: T[]): this {
    if (val_a_x) {
      for (const v of val_a_x) this.add(v);
    }
    return this;
  }

  /**
   * `in( this.length )`\
   * `in( 0 <= _x && _x < this.length )`
   * @const @param _x
   */
  #deleteByIndex_impl(_x: uint) {
    for (let i = _x + 1; i < this.length; ++i) {
      this[i - 1] = this[i];
    }
    this.length -= 1;
  }
  /**
   * @param _x Could be any `int`, e.g. `-1` is the last
   * @return Return the normalized index of the deleted
   */
  deleteByIndex(_x: int): uint | -1 {
    if (!this.length) return -1;

    _x = Number.normalize(_x, this.length);
    this.#deleteByIndex_impl(_x);
    return _x;
  }
  /**
   * @headconst @param val_x
   * @return Return the index of the deleted;
   *    if not exist, return `-1`
   */
  delete(val_x: T): uint | -1 {
    /*#static*/ if (INOUT) {
      assert(this.#sorted, "This method is callable only in the sorted state.");
    }
    const has = this.includes(val_x);
    if (has) {
      this.#deleteByIndex_impl(this.#index);
    }
    return has ? this.#index : -1;
  }
  delete_O(val_a_x?: T[]): void {
    if (val_a_x) {
      for (const v of val_a_x) this.delete(v);
    }
  }
  /*64||||||||||||||||||||||||||||||||||||||||||||||||||||||||||*/

  /**
   * [Merge sort](https://youtu.be/frxO8pIyVE0?t=927)\
   * Sort [idx_x, idx_x + len_x) and [idx_x + len_x, idx_x + 2 * len_x) in
   * place\
   * `in( idx_x + len_x < this.len )`
   * @primaryconst
   * @const @param idx_x
   * @const @param len_x 4, 8, ...
   */
  #sortInPlace(idx_x: uint, len_x: uint) {
    const k_0 = idx_x + len_x,
      k_1 = Math.min(idx_x + 2 * len_x, this.length);
    let j_0 = idx_x,
      j_1 = k_0;
    let i_ = idx_x;
    const tmp_a_ = this.tmp_a$;
    while (j_0 < k_0 && j_1 < k_1) {
      if (this.#less(this[j_1], this[j_0])) {
        tmp_a_[i_] = this[j_1++];
      } else {
        tmp_a_[i_] = this[j_0++];
      }
      i_ += 1;
    }
    if (j_0 >= k_0) {
      /*#static*/ if (INOUT) {
        assert(k_1 - i_ === k_1 - j_1);
      }
    } else {
      /*#static*/ if (INOUT) {
        assert(k_1 - i_ === k_0 - j_0);
      }
      for (let iSrc = j_0, iTgt = i_; iSrc < k_0; ++iSrc, ++iTgt) {
        this[iTgt] = this[iSrc];
      }
    }
    for (let iSrc = idx_x; iSrc < i_; ++iSrc) {
      this[iSrc] = tmp_a_[iSrc]!;
      tmp_a_[iSrc] = undefined;
    }
  }
  /**
   * `in( idx_x + 1 < this.len )`
   * @primaryconst
   * @const @param idx_x
   */
  #sortInPlace_1(idx_x: uint) {
    if (this.#less(this[idx_x + 1], this[idx_x])) {
      this.swap(idx_x + 1, idx_x);
    }
  }
  /**
   * `in( idx_x + 2 < this.len )`
   * @primaryconst
   * @const @param idx_x
   */
  #sortInPlace_2(idx_x: uint) {
    if (this.#less(this[idx_x + 2], this[idx_x])) {
      this.swap(idx_x + 2, idx_x + 1).swap(idx_x + 1, idx_x);
      if (idx_x + 3 < this.length) {
        if (this.#less(this[idx_x + 3], this[idx_x + 1])) {
          this.swap(idx_x + 3, idx_x + 2).swap(idx_x + 2, idx_x + 1);
        } else if (this.#less(this[idx_x + 3], this[idx_x + 2])) {
          this.swap(idx_x + 3, idx_x + 2);
        }
      }
    } else {
      if (this.#less(this[idx_x + 2], this[idx_x + 1])) {
        this.swap(idx_x + 2, idx_x + 1);
        if (idx_x + 3 < this.length) {
          if (this.#less(this[idx_x + 3], this[idx_x + 2])) {
            this.swap(idx_x + 3, idx_x + 2);
          }
        }
      }
    }
  }
  /** @primaryconst */
  resort(): this {
    if (this.#sorted) return this;

    const LEN = this.length;
    for (let e = 1; 2 ** (e - 1) <= LEN; ++e) {
      const u_ = 2 ** e; // unit
      const l_ = 2 ** (e - 1); // len_x
      const n_ = Math.floor(LEN / u_);
      const r_ = LEN - u_ * n_; // remainder
      for (let i = 0; i < n_; ++i) {
        if (l_ === 1) this.#sortInPlace_1(u_ * i);
        else if (l_ === 2) this.#sortInPlace_2(u_ * i);
        else this.#sortInPlace(u_ * i, l_);
      }
      if (r_ > l_) {
        if (l_ === 1) this.#sortInPlace_1(u_ * n_);
        else if (l_ === 2) this.#sortInPlace_2(u_ * n_);
        else this.#sortInPlace(u_ * n_, l_);
      }
    }
    this.#sorted = true;
    return this;
  }
  /*64||||||||||||||||||||||||||||||||||||||||||||||||||||||||||*/

  // toString() {
  //   const str_a: string[] = [];
  //   for (const val of this.val_a$) {
  //     str_a.push(String(val));
  //   }
  //   return `[ ${str_a.join(", ")} ]`;
  // }

  // toJSON(): T[] {
  //   return this.val_a$;
  // }
}
/*64----------------------------------------------------------*/

export class SortedIdo<T extends { id: id_t } = { id: id_t }>
  extends SortedArray<T> {
  static #less: Less<{ id: id_t }> = (a, b) => a.id < b.id;

  constructor(val_a_x?: T[]) {
    super(SortedIdo.#less, val_a_x);
  }
}
/*80--------------------------------------------------------------------------*/
