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
import { CorruptedInput, ExceedSize, NoInput, TruncatedInput } from "./util.ts";
/*80--------------------------------------------------------------------------*/

/** @final */
class RedByts {
  readonly #name;

  readonly #size: uint;
  readonly #u8a;

  #ofs: uint = 0;

  /** `[0, #rw)` is "read region". `[#rw, #ofs)` is "write region". */
  #rw: uint = 0;

  /**
   * @const @param size_x
   * @const @param name_x
   */
  constructor(size_x: uint, name_x: string) {
    this.#name = name_x;
    this.#size = size_x;
    this.#u8a = new Uint8Array(size_x);
  }

  /** `in( this.#rw <= this.#ofs)`  */
  reuse_RedByts() {
    this.#rw = this.#ofs;
    this.#ofs = 0;
  }

  reset_RedByts() {
    this.#rw = 0;
    this.#ofs = 0;
  }
  /*64||||||||||||||||||||||||||||||||||||||||||||||||||||||||||*/

  /**
   * `in( this.#rw <= this.#ofs)`
   * @const @param _x
   * @throw {@linkcode ExceedSize}
   */
  save(_x: uint8): void {
    if (this.#ofs >= this.#size) throw new ExceedSize(this.#info);

    this.#u8a[this.#ofs++] = _x;
  }

  /** @const */
  restore(): uint8 | undefined {
    return this.#ofs < this.#rw ? this.#u8a[this.#ofs++] : undefined;
  }
  /*64||||||||||||||||||||||||||||||||||||||||||||||||||||||||||*/

  get #info() {
    return `${this.#name} (${this.#size})`;
  }

  // /** For testing only */
  // toString() {
  //   const s_a: string[] = [];
  //   for (const n of this.#u8a) s_a.push(`${n},`);
  //   return `${this.#info}: ${s_a.join(" ")}`;
  // }
}
/*64----------------------------------------------------------*/

/** @final */
export class LzmaDecodeStream extends LzmaCodeStream {
  readonly #decoder = new LzmaDecoder();
  readonly #chunker = new DecoderChunker(this.#decoder);

  /* writable */
  readonly #redByts = new RedByts(32, "#redByts");

  /** transform stream */
  get #ts(): Promise<uint> {
    /*#static*/ if (INOUT) {
      assert(!this.tsCap$);
    }
    this.tsCap$ = Promise.withResolvers<uint8>();
    /* Let `writable` do the rest. */
    this.wsCap$?.resolve();
    this.wsCap$ = undefined;
    return this.tsCap$.promise;
  }
  /* ~ */

  /* readable */
  #rsEnque: ((chunk_x: Uint8Array) => void) | undefined;
  #rsClose!: () => void;

  #outSize: uint | -1 = 0;

  readonly readable;
  /* ~ */

  constructor() {
    super();

    this.readable = new ReadableStream<Uint8Array>({
      start: this._rsStart,
      pull: this._rsPull,
      cancel: this._rsCancel,
    });
  }
  /*64||||||||||||||||||||||||||||||||||||||||||||||||||||||||||*/

  /**
   * @throw {@linkcode NoInput}
   * @throw {@linkcode ExceedSize}
   */
  readByteSync(): uint8 | -1 {
    let ret = this.#redByts.restore();
    if (ret !== undefined) return ret;

    if (this.wsU8a$ && this.wsOfs$ < this.wsU8a$.length) {
      // console.log(`${trace.dent}wsOfs$: ${this.wsOfs$}`);
      ret = this.wsU8a$[this.wsOfs$++];
      this.#redByts.save(ret);
      return ret;
    }

    if (this.wsDone$) return -1;

    throw new NoInput();
  }

  /** @throw {@linkcode ExceedSize} */
  #readByteImpl(): uint8 | -1 | undefined {
    if (this.wsU8a$ && this.wsOfs$ < this.wsU8a$.length) {
      // console.log(`${trace.dent}wsOfs$: ${this.wsOfs$}`);
      return this.wsU8a$[this.wsOfs$++];
    }

    if (this.wsDone$) return -1;

    return undefined;
  }

  // @traceOut(_TRACE)
  async readByte(): Promise<uint8 | -1> {
    // /*#static*/ if (_TRACE) {
    //   console.log(`${trace.indent}>>>>>>> LzmaDecodeStream.readByte() >>>>>>>`);
    // }
    const ret = this.#readByteImpl();
    if (ret !== undefined) return ret;

    await this.#ts;
    return this.#readByteImpl()!;
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
    this.#rsEnque?.(new Uint8Array(buf_x.slice(ofs_x, ofs_x + len_x)));
  }
  /*49|||||||||||||||||||||||||||||||||||||||||||*/

  async #initDecode(): Promise<void> {
    const prop_a: uint8[] = [];
    for (let i = 0; i < 5; ++i) {
      const r_: uint8 = await this.readByte();
      if (r_ === -1) throw new TruncatedInput();
      prop_a[i] = r_;
    }
    if (!this.#decoder.setDecoderProperties(prop_a)) {
      throw new CorruptedInput();
    }

    let hex_length = "";
    for (let i = 0; i < 8; ++i) {
      let r_: uint8 | string = await this.readByte();
      if (r_ === -1) throw new TruncatedInput();
      r_ = r_.toString(16);
      if (r_.length === 1) r_ = "0" + r_;
      hex_length = `${r_}${hex_length}`;
    }
    /* Was the length set in the header (if it was compressed from a stream, the
    length is all f"s). */
    if (/^0+$|^f+$/i.test(hex_length)) {
      this.#outSize = -1;
    } else {
      /* NOTE: If there is a problem with the decoder because of the length,
      you can always set the length to -1 (N1_longLit) which means unknown. */
      const tmp_length = parseInt(hex_length, 16);
      this.#outSize = tmp_length > MAX_UINT48 ? -1 : tmp_length;
    }

    this.#decoder.inStream = this;
    this.#decoder.OutWindow.flush();
    this.#decoder.OutWindow.outStream = this;
    await this.#decoder.Init();

    this.#chunker.outSize = this.#outSize;
    this.#chunker.alive = true;
  }
  /*64||||||||||||||||||||||||||||||||||||||||||||||||||||||||||*/

  async #process(): Promise<void> {
    await this.#initDecode();

    // while (await this.#chunker.processChunk());

    let alive = false;
    do {
      try {
        alive = this.#chunker.processChunkSync();
        this.#redByts.reset_RedByts();
        // if (117628 <= this.#chunker._nSync_ && this.#chunker._nSync_ < 117632) {
        // console.log(`${this.#chunker}`);
        // console.log(this.#chunker._info_);
        // }
        // if (this.#chunker._nSync_ === 12) debugger;
      } catch (err) {
        if (!(err instanceof NoInput)) {
          // console.log(this.#chunker._info_);
          throw err;
        }

        await this.#ts;
        // console.log(
        //   `%crun here: wsU8a$.length: ${this.wsU8a$?.length}, wsOfs$: ${this.wsOfs$}`,
        //   `color:yellow`,
        // );
        this.#chunker.restoreState();
        this.#redByts.reuse_RedByts(); //!
        // throw err;
      }
    } while (alive);
    // console.log(`${this.#chunker}`);
  }

  decompress(): this {
    this.#process().then(() => {
      // console.log(`%crun here: LzmaDecodeStream.#process().then()`, `color:orange`);
      this.error.resolve(null);
    }).catch(this.error.resolve)
      .finally(() => {
        this.#rsEnque = undefined;
        this.#rsClose();
        this.cleanup();
      });
    return this;
  }
}
/*80--------------------------------------------------------------------------*/
