/** 80**************************************************************************
 * This module is loaded with top priority!
 *
 * @module lib/alias
 * @license MIT
 ******************************************************************************/

export {};
/*80--------------------------------------------------------------------------*/
/* jslang */

export type Constructor<T = object> = new (...args: any[]) => T;
export type AbstractConstructor<T = object> = abstract new (
  ...args: any[]
) => T;
export type Func<This = any, Return = any, Args extends any[] = any[]> = (
  this: This,
  ...args: Args
) => Return;
// export type Id<T> = (_x: T) => T;
/*49-------------------------------------------*/

//#region TupleOf<>
/* Ref. [TSConf 2020: Keynote - Anders Hejlsberg](https://youtu.be/IGw2MRI0YV8) */

type _TupleOf<T, N extends number, R extends unknown[]> = R["length"] extends N
  ? R
  : _TupleOf<T, N, [...R, T]>;
export type TupleOf<T, N extends number> = N extends N
  ? number extends N ? T[] : _TupleOf<T, N, []>
  : never;
//#endregion

//#region XOR<>
/* Ref. https://stackoverflow.com/questions/42123407/does-typescript-support-mutually-exclusive-types */

type Without<T, U> = { [P in Exclude<keyof T, keyof U>]?: never };
export type XOR<T, U> = (T | U) extends object
  ? (Without<T, U> & U) | (Without<U, T> & T)
  : T | U;
//#endregion

//#region IndexOf<>
/* Ref. https://youtu.be/nNse0r0aRT8 */

export type IndexOf<T extends readonly any[], S extends number[] = []> =
  T["length"] extends S["length"] ? S[number] : IndexOf<T, [S["length"], ...S]>;

// const a = <const>["abc","123"];
// type T = IndexOf<typeof a>;
//#endregion

//#region ArrEl<>
/* Ref. https://stackoverflow.com/questions/41253310/typescript-retrieve-element-type-information-from-array-type */

export type ArrEl<Arr extends readonly unknown[]> = Arr extends
  readonly (infer El)[] ? El : never;
//#endregion

//#region Prettify<>
export type Prettify<T> = { [K in keyof T]: T[K] } & {};
//#endregion

//#region RemoveIndex<>
/* Ref. [How to remove index signature using mapped types](https://stackoverflow.com/a/51956054) */

export type RemoveIndex<T> = {
  [
    K in keyof T as string extends K ? never
      : number extends K ? never
      : symbol extends K ? never
      : K
  ]: T[K];
};
//#endregion

/* alias_v */
// //#region Brand<>
// /* Ref. [5 Things They’ll NEVER Add To TypeScript](https://youtu.be/Zsj1UlCsuio?t=267) */

// //jjjj TOCLEANUP
// // export type Brand<T, TBrand> = T & { [$brand]: TBrand };
// export type Brand<T, TBrand extends v.BrandName> = T & v.Brand<TBrand>;
// //#endregion
/* ~ */

//#region Writable<>
/* Ref. [TypeScript - Removing readonly modifier](https://stackoverflow.com/a/43001581) */

export type Writable<T> = { -readonly [P in keyof T]: T[P] };
export type DeepWritable<T> = {
  -readonly [P in keyof T]: DeepWritable<T[P]>;
};
//#endregion
/*64----------------------------------------------------------*/

/* alias_v */
//jjjj TOCLEANUP
// /* Not `declare const $brand: unique symbol` because it's used in `v.object()`. */
// export const $brand = Symbol("$brand");
// export const $brand_int64 = Symbol("$brand_int64");
// export const $brand_int32 = Symbol("$brand_int32");
// export const $brand_id = Symbol("$brand_id");
/* ~ */

// export type int = Brand<number, "int">;
// declare const $brand_int: unique symbol;
// export type Brand_int<TBrand> = int & { [$brand_int]: TBrand };
/** `Number.isInteger()` */
export type int = number;
/* alias_v */
// export const vint = v.pipe(v.number(), v.integer());
// // export type int = v.InferInput<typeof vint>;
/* ~ */
export type uint = number;
/* alias_v */
// // export type uint = Brand_int{"uint">;
// export const vuint = v.pipe(vint, v.minValue(0));
/* ~ */
// export const Int = BigInt;
// export const UInt = BigInt;

export type int64 = int;
/* alias_v */
// export type Int64 = Brand<int64, "Int64">;
// const vInt64 = v.pipe(vint, v.brand("Int64"));
// //jjjj TOCLEANUP
// // export type Brand_Int64<TBrand> = Int64 & { [$brand_int64]: TBrand };
// export type Brand_Int64<TBrand extends v.BrandName> = Int64 & v.Brand<TBrand>;
/* ~ */
export type int32 = int;
/* alias_v */
// export type Int32 = Brand<int32, "Int32">;
// //jjjj TOCLEANUP
// // export type Brand_Int32<TBrand> = Int32 & { [$brand_int32]: TBrand };
// export type Brand_Int32<TBrand extends v.BrandName> = Int32 & v.Brand<TBrand>;
/* ~ */
export type int16 = int;
/* alias_v */
// export type Int16 = Brand<int16, "Int16">;
/* ~ */
export type int8 = int;
/* alias_v */
// export type Int8 = Brand<int8, "Int8">;
/* ~ */
export type uint64 = uint;
export type uint32 = uint;
/* alias_v */
// export type UInt32 = Brand<uint32, "UInt32">;
/* ~ */
export type uint16 = uint;
/* alias_v */
// export type UInt16 = Brand<uint16, "UInt16">;
// export const vUInt16 = v.pipe(
//   vuint,
//   v.maxValue(2 ** 16 - 1),
//   v.brand("UInt16"),
// );
/* ~ */
export type uint8 = uint;
/* alias_v */
// export const vuint8 = v.pipe(vuint, v.maxValue(2 ** 8 - 1));
// export type UInt8 = Brand<uint8, "UInt8">;
/* ~ */

export type unum = number;
/* alias_v */
// export const vunum = v.pipe(v.number(), v.minValue(0));
/* ~ */
/*49-------------------------------------------*/

export type id_t = uint;
/* alias_v */
// export const vid_t = v.pipe(vuint);
// /** 0 is special */
// /* "Invalid type: Expected Object but received 16" */
// // const $brand_ = Symbol("$brand_");
// // export type Id_t = uint & { [$brand_]: "Id_t" };
// // export const vId_t = v.intersect([
// //   vuint,
// //   v.object({ [$brand_]: v.literal("Id_t") }),
// // ]);
// // console.log(v.safeParse(vId_t, 16));
// /* ~ */
// export type Id_t = Brand<uint, "Id_t">;
// export const vId_t = v.pipe(vuint, v.brand("Id_t"));
// //jjjj TOCLEANUP
// // export type Brand_id<TBrand> = Id_t & { [$brand_id]: TBrand };
// export type Brand_id<TBrand extends v.BrandName> = Id_t & v.Brand<TBrand>;
/* ~ */

/** Count one "\t" as 1 */
export type loff_t = uint32;
/* alias_v */
// export type ldt_t = Brand_Int32<"ldt_t">;
/* ~ */
export const loff_UNDEFINED: loff_t = -1_000_000_001;
export const loff_MAX: loff_t = 1_000_000_000;
/** Count one "\t" as e.g. 2, 4, 8 */
export type lcol_t = loff_t;

/* alias_v */
// export type lnum_t = Brand<uint32, "lnum_t">;
// // export const lnum_UNDEFINED:lnum_t = -256n;
// export const lnum_MAX = 1_000_000 as lnum_t;
/* ~ */

/** Type of unix timestamp */
export type ts_t = int64;
/* alias_v */
// export const vts_t = v.pipe(vint);
// /** Type of unix timestamp */
// export type Ts_t = Brand_Int64<"Ts_t">;
// export const vTs_t = v.pipe(vInt64, v.brand("Ts_t"));
/* ~ */

/** Recommand [0,1] */
export type Ratio = number;
/* alias_v */
// export const vRatio = v.pipe(v.number(), v.finite());
/* ~ */
/*64----------------------------------------------------------*/

// export type DecDigitChar = "0"
//   | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9";
// export type HexDigitChar = DecDigitChar
//   | "a" | "A" | "b" | "B" | "c" | "C" | "d" | "D" | "e" | "E" | "f" | "F";
// export type Hex8 = `${HexDigitChar}${HexDigitChar}`;

/**
 * Dull string\
 * String of characters 0x20 ~ 0x0_126
 */
export type Dulstr = string;
// export type Dulstr = Brand<string, "Dulstr">; //jjjj try to use this

/** Type of `"(😄)"[0]`, `"(😄)"[1]`, `"(😄)"[2]`, etc */
export type UChr = string;
// export type UChr = Brand<string, "UChr">; //jjjj try to use this

/* alias_v */
// /** Type of each element of `[..."(😄)"]` */
// export type Chr = Brand<string, "Chr">;
/* ~ */

// deno-fmt-ignore
/**
 * Ref. http://www.unicode.org/reports/tr9/#Table_Bidirectional_Character_Types
 */
export enum ChrTyp {
  /* Strong */
  L = 1, R = 2, AL = 4,
  /* Weak */
  EN = 8, ES = 0x10, ET = 0x20, AN = 0x40, CS = 0x80,
  NSM = 0x0_100, BN = 0x0_200,
  /* Neutral */
  B = 0x0_400, S = 0x0_800, WS = 0x1_000, ON = 0x2_000,
  /* Explicit Formatting */
  LRE = 0x4_000, LRO = 0x8_000, RLE = 0x10_000, RLO = 0x20_000, PDF = 0x40_000,
  LRI = 0x80_000, RLI = 0x100_000, FSI = 0x200_000, PDI = 0x400_000,
}
export type ChrTypName = keyof typeof ChrTyp;
/*64----------------------------------------------------------*/

export type dot2d_t = [x: number, y: number];
export type dim2d_t = [widt: number, high: number];
export type rect_t = TupleOf<number, 4>;

export type IntArray<T extends ArrayBufferLike = ArrayBufferLike> =
  | Int8Array<T>
  | Int16Array<T>
  | Int32Array<T>; // | BigInt64Array<T>
export type UintArray<T extends ArrayBufferLike = ArrayBufferLike> =
  | Uint8Array<T>
  | Uint8ClampedArray<T>
  | Uint16Array<T>
  | Uint32Array<T>; // | BigUint64Array<T>
export type IntegerArray<T extends ArrayBufferLike = ArrayBufferLike> =
  | IntArray<T>
  | UintArray<T>;
export type FloatArray<T extends ArrayBufferLike = ArrayBufferLike> =
  // | Float16Array<T>
  | Float32Array<T>
  | Float64Array<T>;
export type TypedArray<T extends ArrayBufferLike = ArrayBufferLike> =
  | IntegerArray<T>
  | FloatArray<T>;
/*64----------------------------------------------------------*/

export type Thenable<T> = PromiseLike<T>;
/*80--------------------------------------------------------------------------*/
/* dom */

export type CSSStyleName = keyof {
  [
    K in Extract<keyof CSSStyleDeclaration, string> as string extends K ? never
      : CSSStyleDeclaration[K] extends string ? K
      : never
  ]: never;
};
// const cname:CSSStyleName = "length";

export type CSSStyle = Partial<Record<CSSStyleName, string | number>>;

/** @deprecated Use `CSSStyle` instead. */
export type Style = Record<string, string>;
/*64----------------------------------------------------------*/

export const enum MouseButton {
  Main = 0,
  Auxiliary = 1,
  Secondary = 2,
  Back = 3,
  Forward = 4,
}
/*64----------------------------------------------------------*/

export const scrollO: ScrollToOptions = {
  left: 0,
  top: 0,
  behavior: "instant",
};
/*64----------------------------------------------------------*/

export const enum Hover {
  none = 0,
  hover,
}

export const enum Pointer {
  none = 0,
  coarse,
  fine,
}
/*64----------------------------------------------------------*/

export type C2D = CanvasRenderingContext2D;
export const C2D = globalThis.CanvasRenderingContext2D;
export type OC2D = OffscreenCanvasRenderingContext2D;
export const OC2D = globalThis.OffscreenCanvasRenderingContext2D;
/*80--------------------------------------------------------------------------*/
/* fe */

//jjjj TOCLEANUP
// export enum BufrDir {
//   ltr = 1,
//   rtl,
// }
export type BufrDir = "ltr" | "rtl";
/* alias_v */
// export const vBufrDir = v.picklist(["ltr", "rtl"]);
/* ~ */

export enum WritingMode {
  htb = 0b0_0001,

  vrl = 0b0_0100,
  vlr = 0b0_1000,
}
/* alias_v */
// // export const vWritingMode = v.enum(WritingMode);
// export const vWritingMode = v.picklist(["htb", "vrl", "vlr"]);
/* ~ */
// console.log(Object.keys(WritingMode).filter((_x) => isNaN(Number(_x))));
export const enum WritingDir {
  h = WritingMode.htb,
  v = WritingMode.vrl | WritingMode.vlr,
}

export type SetLayoutP = {
  bufrDir?: BufrDir;
  writingMode?: WritingMode;
};
/*64----------------------------------------------------------*/

export enum ToolbarSide {
  top_left = 0b0_0000_0001,
  top_rigt = 0b0_0000_0010,
  bot_left = 0b0_0000_0100,
  bot_rigt = 0b0_0000_1000,
  left_top = 0b0_0001_0000,
  // left_bot = 0b0_0010_0000,
  rigt_top = 0b0_0100_0000,
  // rigt_bot = 0b0_1000_0000,
}
/* alias_v */
// // export const vToolbarSide = v.enum(ToolbarSide);
// export const vToolbarSide = v.picklist(/* deno-fmt-ignore */ [
//   "top_left", "top_rigt",
//   "bot_left", "bot_rigt",
//   "left_top",
//   "rigt_top",
// ]);
/* ~ */
export const enum ToolbarInfo {
  top = ToolbarSide.top_left | ToolbarSide.top_rigt,
  bot = ToolbarSide.bot_left | ToolbarSide.bot_rigt,
  horz = top | bot,
  vert = ToolbarSide.left_top | ToolbarSide.rigt_top,
  frst = ToolbarSide.top_left | ToolbarSide.top_rigt | ToolbarSide.left_top,
  last = ToolbarSide.bot_left | ToolbarSide.bot_rigt | ToolbarSide.rigt_top,
}
/*64----------------------------------------------------------*/
/* zIndex */

/* Stacking context: Scronr */
export const Scrod_z = 10;
export const Scrobar_z = 10;
/*64----------------------------------------------------------*/

export type Runr = {
  run(): void | Promise<void>;
};
// export class DumRunr implements Runr {
//   run() {}
// }
/*64----------------------------------------------------------*/

export const enum Endpt {
  focus = 1,
  anchr,
}

export const enum Sortart {
  asc,
  desc,
}
/*80--------------------------------------------------------------------------*/

export const LOG_cssc = {
  selectionchange: "#cb9b8b",
  selectionchange_1: "#ff8257",

  xstate_transition: "#2196f3",
  xstate_entry: "#1ba39a",
  xstate_exit: "#506e6c",
  resiz: "#fdf717",
  intrs: "#adfd17",

  performance: "#00ff00",

  runhere: "#ff0000",

  testinfo: "#fffc62ff",
};
/*80--------------------------------------------------------------------------*/
