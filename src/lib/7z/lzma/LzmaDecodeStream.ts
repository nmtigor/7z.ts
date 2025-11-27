/** 80**************************************************************************
 * Ref. [[lzma1]/src/lzma.ts](https://github.com/xseman/lzma1/blob/master/src/lzma.ts)
 *    * Refactor heavily
 *    * Make streamable
 *
 * @module lib/7z/lzma/LzmaDecodeStream
 * @license MIT
 ******************************************************************************/

import { _TRACE, INOUT } from "../../../preNs.ts";
import type { uint, uint8 } from "../../alias.ts";
import { LOG_cssc } from "../../alias.ts";
import "../../jslang.ts";
import { assert, bind } from "../../util.ts";
import { trace, traceOut } from "../../util/trace.ts";
import { InStream } from "../InStream.ts";
import { ExceedSize, NoInput } from "../util.ts";
import { MAX_UINT48 } from "./alias.ts";
import { DecoderChunker } from "./CoderChunker.ts";
import { LzmaDecoder } from "./LzmaDecoder.ts";
import { CorruptedInput, TruncatedInput } from "./util.ts";
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

type CtorP_ = {
  /** `5` */
  props: uint8[];
  /** `< 2**48` */
  outSize?: uint | -1;
};

/** @final */
export class LzmaDecodeStream extends InStream {
  readonly #ctorp: CtorP_ | undefined;

  readonly #decoder = new LzmaDecoder();
  readonly #chunker = new DecoderChunker(this.#decoder);

  /* writable */
  readonly #redByts = new RedByts(32, "#redByts");

  /* readable */
  #rsEnque: ((chunk_x: Uint8Array) => void) | undefined;
  #rsClose!: () => void;

  /** `< 2**48` */
  #outSize: uint | -1 = 0;
  #enqSize: uint = 0;
  checkSize(): boolean {
    return this.#outSize === -1 || this.#outSize === this.#enqSize;
  }

  readonly readable;
  /* ~ */

  /** @const @param _x */
  constructor(_x?: CtorP_) {
    /*#static*/ if (INOUT) {
      if (_x) assert(_x.props.length === 5);
    }
    super();
    this.#ctorp = _x;

    this.readable = new ReadableStream<Uint8Array>({
      start: this._rsStart,
      //jjjj TOCLEANUP
      // pull: this._rsPull,
      // cancel: this._rsCancel,
    });

    this.#decompress();
  }

  // static async from(_x: string | URL) {
  //   const lds = new LzmaDecodeStream();
  //   const res = await fetch(_x);
  //   res.body!.pipeThrough(lds)
  //   return lds;
  // }
  /*64||||||||||||||||||||||||||||||||||||||||||||||||||||||||||*/

  /**
   * @throw {@linkcode NoInput}
   * @throw {@linkcode ExceedSize}
   */
  readByte(): uint8 | -1 {
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

  #readByteImpl(): uint8 | -1 | undefined {
    if (this.wsU8a$ && this.wsOfs$ < this.wsU8a$.length) {
      // console.log(`${trace.dent}wsOfs$: ${this.wsOfs$}`);
      // console.log(
      //   `${trace.dent}wsU8a$[${this.wsOfs$}]: 0x${
      //     this.wsU8a$[this.wsOfs$].toString(16)
      //   }`,
      // );
      return this.wsU8a$[this.wsOfs$++];
    }

    if (this.wsDone$) return -1;

    return undefined;
  }

  // @traceOut(_TRACE)
  async readByteAsync(): Promise<uint8 | -1> {
    // /*#static*/ if (_TRACE) {
    //   console.log(
    //     `${trace.indent}>>>>>>> ${this._type_id_}.readByteAsync() >>>>>>>`,
    //   );
    // }
    const ret = this.#readByteImpl();
    if (ret !== undefined) return ret;

    await this.chunk$;
    return this.#readByteImpl()!;
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
    this.#rsEnque = (_y) => {
      this.#enqSize += _y.length;
      rc_x.enqueue(_y);
    };
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
        `${trace.indent}>>>>>>> ${this._type_id_}.writeFrom() >>>>>>>`,
      );
      console.log(`${trace.dent}`, { ofs_x, len_x });
    }
    this.#rsEnque?.(
      new Uint8Array(
        ofs_x === 0 && len_x === buf_x.length
          ? buf_x
          : buf_x.slice(ofs_x, ofs_x + len_x),
      ),
    );
  }
  /*49|||||||||||||||||||||||||||||||||||||||||||*/

  async #initDecode(): Promise<void> {
    let props = this.#ctorp?.props;
    if (!props) {
      props = [];
      for (let i = 0; i < 5; ++i) {
        const r_: uint8 = await this.readByteAsync();
        if (r_ === -1) throw new TruncatedInput();
        props[i] = r_;
      }
    }
    if (!this.#decoder.setDecoderProperties(props)) {
      throw new CorruptedInput();
    }

    if (this.#ctorp) {
      this.#outSize = this.#ctorp.outSize ?? -1;
    } else {
      let hex_length = "";
      for (let i = 0; i < 8; ++i) {
        let r_: uint8 | string = await this.readByteAsync();
        if (r_ === -1) throw new TruncatedInput();
        r_ = r_.toString(16);
        if (r_.length === 1) r_ = "0" + r_;
        hex_length = `${r_}${hex_length}`;
      }
      /* Was the length set in the header (if it was compressed from a stream,
      the length is all f"s). */
      if (/^0+$|^f+$/i.test(hex_length)) {
        this.#outSize = -1;
      } else {
        /* NOTE: If there is a problem with the decoder because of the length,
        you can always set the length to -1 (N1_longLit) which means unknown. */
        const tmp_length = parseInt(hex_length, 16);
        this.#outSize = tmp_length <= MAX_UINT48 ? tmp_length : -1;
      }
    }

    this.#decoder.inStream = this;
    this.#decoder.OutWindow.flush();
    this.#decoder.OutWindow.outStream = this;
    await this.#decoder.Init();

    this.#chunker.outSize = this.#outSize;
    this.#chunker.alive = true;
  }
  /*64||||||||||||||||||||||||||||||||||||||||||||||||||||||||||*/

  @traceOut(_TRACE)
  async #processAsync(): Promise<void> {
    /*#static*/ if (_TRACE) {
      console.log(
        `${trace.indent}>>>>>>> ${this._type_id_}.#processAsync() >>>>>>>`,
      );
    }
    await this.#initDecode();

    // while (await this.#chunker.processChunkAsync());
    // console.log(this.#chunker._info_);

    let alive = false;
    do {
      try {
        alive = this.#chunker.processChunk();
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

        await this.chunk$;
        /* Inputs are used up, but `.processChunk()` above does not set `alive`
        to `false` yet (which may happen e.g. if `#chunk.outSize === -1`), we
        stop processing. */ if (this.wsDone$) {
          this.#chunker.cleanup();
          break;
        }

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

  #decompress(): void {
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
  }
}
/*80--------------------------------------------------------------------------*/
