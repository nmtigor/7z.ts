/** 80**************************************************************************
 * @module lib/7z/lzma/ChunkState
 * @license MIT
 ******************************************************************************/

import type { uint, uint16, uint32, uint8 } from "../../alias.ts";
import type { CDist, CProb, CState } from "./alias.ts";
import type { ILitSubCoder } from "./LitCoder.ts";
import type { BitTree } from "./util.ts";
import { ExceedSize } from "./util.ts";
/*80--------------------------------------------------------------------------*/

// const dynamic_ = false;

export abstract class ProbStateND {
  protected readonly name$;

  /** If `dynamic_`, it's non-`readonly`. */
  protected readonly size$: uint;

  /** If `dynamic_`, it's non-`readonly`. */
  protected readonly u16a$;
  get _u16aByteSize_() {
    return this.u16a$.byteLength;
  }

  protected ofs$: uint = 0;

  /**
   * @const @param dim_x
   * @const @param size_x
   * @const @param name_x
   */
  constructor(dim_x: 2 | 3, size_x: uint, name_x: string) {
    this.name$ = name_x;
    this.size$ = size_x;
    this.u16a$ = new Uint16Array(size_x * dim_x);
  }

  /** @final */
  reset_StateND() {
    this.ofs$ = 0;
  }
  /*64||||||||||||||||||||||||||||||||||||||||||||||||||||||||||*/

  /**
   * @final
  //  * @const @param dim_x
   * @throw {@linkcode ExceedSize}
   */
  protected check$(): void {
    if (this.ofs$ < this.size$) return;

    // if (dynamic_) {
    //   this.size$ = this.ofs$ + 1;
    //   if (this.size$ * dim_x > this.u16a$.length) {
    //     const u16a = new Uint16Array(this.size$ * 2 * dim_x);
    //     u16a.set(this.u16a$, 0);
    //     this.u16a$ = u16a;
    //   }
    //   return;
    // }

    throw new ExceedSize(this.info$);
  }

  /**
   * @const @param probs_x
   * @const @param idx_x
   * @const @param prob_x
   * @throw {@linkcode ExceedSize}
   */
  abstract ad(probs_x: CProb[], idx_x: uint16, prob_x: CProb): void;
  /*64||||||||||||||||||||||||||||||||||||||||||||||||||||||||||*/

  protected abstract get info$(): string;
}

/** @final */
class ProbState2D extends ProbStateND {
  /**
   * @const @param size_x
   * @const @param name_x
   */
  constructor(size_x: uint, name_x: string) {
    super(2, size_x, name_x);
  }
  /*64||||||||||||||||||||||||||||||||||||||||||||||||||||||||||*/

  /** @implements */
  ad(probs_x: CProb[], idx_x: uint16, prob_x: CProb): void {
    if (probs_x[idx_x] === prob_x) return;

    if (
      this.ofs$ > 2 &&
      this.u16a$[this.ofs$ - 2] === idx_x &&
      this.u16a$[this.ofs$ - 1] === probs_x[idx_x]
    ) return;

    this.check$();

    this.u16a$[this.ofs$++] = idx_x;
    this.u16a$[this.ofs$++] = probs_x[idx_x];
  }

  /**
   * @const
   * @headconst @param _x
   */
  restoreTo(_x: CProb[]): void {
    for (let i = this.ofs$; i >= 2; i -= 2) {
      _x[this.u16a$[i - 2]] = this.u16a$[i - 1];
    }
  }
  /*64||||||||||||||||||||||||||||||||||||||||||||||||||||||||||*/

  /** @implement */
  protected get info$(): string {
    return `${this.name$} (2×${this.size$})`;
  }

  /** For testing only */
  override toString(): string {
    const s_a: string[] = [];
    for (let i = 0; i < this.ofs$; i += 2) {
      s_a.push(`${this.u16a$[i]},${this.u16a$[i + 1]},`);
    }
    return `${this.info$}: ${s_a.join(" ")}`;
  }
}

/** @final */
export class ProbState3D extends ProbStateND {
  d1: uint16 = 0;

  /**
   * @const @param size_x
   * @const @param name_x
   */
  constructor(size_x: uint, name_x: string) {
    super(3, size_x, name_x);
  }
  /*64||||||||||||||||||||||||||||||||||||||||||||||||||||||||||*/

  /** @implements */
  ad(probs_x: CProb[], idx_x: uint16, prob_x: CProb): void {
    if (probs_x[idx_x] === prob_x) return;

    if (
      this.ofs$ > 3 &&
      this.u16a$[this.ofs$ - 3] === this.d1 &&
      this.u16a$[this.ofs$ - 2] === idx_x &&
      this.u16a$[this.ofs$ - 1] === probs_x[idx_x]
    ) return;

    this.check$();

    this.u16a$[this.ofs$++] = this.d1;
    this.u16a$[this.ofs$++] = idx_x;
    this.u16a$[this.ofs$++] = probs_x[idx_x];
  }

  /**
   * @const
   * @headconst @param _x
   */
  restoreToBitTrees(_x: BitTree[]): void {
    for (let i = this.ofs$; i >= 3; i -= 3) {
      _x[this.u16a$[i - 3]].Probs[this.u16a$[i - 2]] = this.u16a$[i - 1];
    }
  }

  /**
   * @const
   * @headconst @param _x
   */
  restoreToSubCoders(_x: ILitSubCoder[]): void {
    for (let i = this.ofs$; i >= 3; i -= 3) {
      _x[this.u16a$[i - 3]].decoders[this.u16a$[i - 2]] = this.u16a$[i - 1];
    }
  }
  /*64||||||||||||||||||||||||||||||||||||||||||||||||||||||||||*/

  /** @implement */
  protected get info$(): string {
    return `${this.name$} (3×${this.size$})`;
  }

  /** For testing only */
  override toString(): string {
    const s_a: string[] = [];
    for (let i = 0; i < this.ofs$; i += 3) {
      s_a.push(`${this.u16a$[i]},${this.u16a$[i + 1]},${this.u16a$[i + 2]},`);
    }
    return `${this.info$}: ${s_a.join(" ")}`;
  }
}

export class LenState {
  readonly _name_;

  readonly choice = new ProbState2D(4, "choice");
  readonly lowCoder = new ProbState3D(8, "lowCoder");
  readonly midCoder = new ProbState3D(8, "midCoder");
  readonly highCoder = new ProbState2D(16, "highCoder");

  get _arysByteSize_() {
    return this.choice._u16aByteSize_ +
      this.lowCoder._u16aByteSize_ +
      this.midCoder._u16aByteSize_ +
      this.highCoder._u16aByteSize_;
  }

  /** @const @param name_x */
  constructor(name_x: string) {
    this._name_ = name_x;
  }

  reset_LenState() {
    this.choice.reset_StateND();
    this.lowCoder.reset_StateND();
    this.midCoder.reset_StateND();
    this.highCoder.reset_StateND();
  }
  /*64||||||||||||||||||||||||||||||||||||||||||||||||||||||||||*/

  get #info() {
    return `${this._name_} (${this.constructor.name})`;
  }

  /** For testing only */
  toString() {
    return `${this.#info}:
    ${this.choice}
    ${this.lowCoder}
    ${this.midCoder}
    ${this.highCoder}`;
  }
}
/*64----------------------------------------------------------*/

export class ChunkState {
  Code: uint32 = 0;
  Range: uint32 = 0;

  rep0: CDist = 0;
  rep1: CDist = 0;
  rep2: CDist = 0;
  rep3: CDist = 0;
  state: CState = 0;

  nowPos48: uint = 0;
  prevByte: uint8 = 0;

  readonly posSlotDecoder = new ProbState3D(16, "posSlotDecoder");
  readonly AlignDecoder = new ProbState2D(8, "AlignDecoder");
  readonly PosDecoders = new ProbState2D(16, "PosDecoders");

  readonly isMatch = new ProbState2D(1, "isMatch");
  readonly isRep = new ProbState2D(1, "isRep");
  readonly IsRepG0 = new ProbState2D(1, "IsRepG0");
  readonly IsRepG1 = new ProbState2D(1, "IsRepG1");
  readonly IsRepG2 = new ProbState2D(1, "IsRepG2");
  readonly IsRep0Long = new ProbState2D(1, "IsRep0Long");

  readonly lendec = new LenState("lendec");
  readonly replendec = new LenState("replendec");

  readonly litCoders = new ProbState3D(32, "litCoders");

  get _arysByteSize_() {
    return this.posSlotDecoder._u16aByteSize_ +
      this.AlignDecoder._u16aByteSize_ +
      this.PosDecoders._u16aByteSize_ +
      this.isMatch._u16aByteSize_ +
      this.isRep._u16aByteSize_ +
      this.IsRepG0._u16aByteSize_ +
      this.IsRepG1._u16aByteSize_ +
      this.IsRepG2._u16aByteSize_ +
      this.IsRep0Long._u16aByteSize_ +
      this.lendec._arysByteSize_ +
      this.replendec._arysByteSize_ +
      this.litCoders._u16aByteSize_;
  }

  reset_ChunkState() {
    this.posSlotDecoder.reset_StateND();
    this.AlignDecoder.reset_StateND();
    this.PosDecoders.reset_StateND();

    this.isMatch.reset_StateND();
    this.isRep.reset_StateND();
    this.IsRepG0.reset_StateND();
    this.IsRepG1.reset_StateND();
    this.IsRepG2.reset_StateND();
    this.IsRep0Long.reset_StateND();

    this.lendec.reset_LenState();
    this.replendec.reset_LenState();

    this.litCoders.reset_StateND();
  }
  /*64||||||||||||||||||||||||||||||||||||||||||||||||||||||||||*/

  /** For testing only */
  toString() {
    return `(${this.constructor.name}):
  Code: 0x${(this.Code >>> 0).toString(16)}
  Range: 0x${(this.Range >>> 0).toString(16)}
  rep0: 0x${this.rep0.toString(16)}
  nowPos48: ${this.nowPos48}
  prevByte: 0x${this.prevByte.toString(16)}
  ${this.posSlotDecoder}
  ${this.AlignDecoder}
  ${this.PosDecoders}
  ${this.isMatch}
  ${this.isRep}
  ${this.IsRepG0}
  ${this.IsRepG1}
  ${this.IsRepG2}
  ${this.IsRep0Long}
  ${this.lendec}
  ${this.replendec}
  ${this.litCoders}
`;
  }
}
/*80--------------------------------------------------------------------------*/
