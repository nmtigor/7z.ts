/** 80**************************************************************************
 * @module lib/util/string
 * @license MIT
 ******************************************************************************/

import type { TypedArray, uint16 } from "../alias.ts";
import { validateBinaryLike } from "./general_cf.ts";
import { MurmurHash3_64 } from "./murmurhash3.ts";
import * as Is from "./is.ts";
/*80--------------------------------------------------------------------------*/

/* Not sure if js impls use regexp interning like string. So. */
// const lt_re_ = /[\n\r\u001C-\u001E\u0085\u2029]/g;
/**
 * [Line terminator](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Lexical_grammar#line_terminators)
 */
// const lt_re_ = /\r\n|\n|\r|\u2028|\u2029/g;
const lt_re_ = /\r\n|\n|\r/g;
/** @const @param text_x */
export const linesOf = (text_x: string) => text_x.split(lt_re_);
// console.log(linesOf("abc\n\n123\n"));
/*80--------------------------------------------------------------------------*/

/**
 * @const @param _x the UTF-16 code unit value returned by `String.charCodeAt()`
 */
export const isSpaceOrTab = (_x: uint16): boolean =>
  _x === /* " " */ 0x20 || _x === /* "\t" */ 9;

/** @see {@linkcode isSpaceOrTab()} */
export const isLFOr0 = (_x: uint16): boolean =>
  _x === /* "\n" */ 0xA || _x === 0;

/** @see {@linkcode isSpaceOrTab()} */
export const isDecimalDigit = (_x: uint16): boolean => 0x30 <= _x && _x <= 0x39;
/** @see {@linkcode isSpaceOrTab()} */
export const isHexDigit = (_x: uint16): boolean =>
  (0x30 <= _x && _x <= 0x39) || // 0..9
  (0x41 <= _x && _x <= 0x46) || // A..F
  (0x61 <= _x && _x <= 0x66); // a..f
/** @see {@linkcode isSpaceOrTab()} */
export const isOctalDigit = (_x: uint16): boolean => (0x30 <= _x && _x <= 0x37); // 0..7

/** @see {@linkcode isSpaceOrTab()} */
export const isASCIIUpLetter = (
  _x: uint16,
): boolean => (0x41 <= _x && _x <= 0x5A); // A..Z
/** @see {@linkcode isSpaceOrTab()} */
export const isASCIILoLetter = (
  _x: uint16,
): boolean => (0x61 <= _x && _x <= 0x7A); // a..z
/** @see {@linkcode isSpaceOrTab()} */
export const isASCIILetter = (_x: uint16): boolean =>
  isASCIIUpLetter(_x) || isASCIILoLetter(_x);

/** @see {@linkcode isSpaceOrTab()} */
export const isWordLetter = (_x: uint16): boolean =>
  isDecimalDigit(_x) || isASCIILetter(_x) || _x === /* "_" */ 0x5F;

/** @see {@linkcode isSpaceOrTab()} */
export const isASCIIControl = (_x: uint16): boolean =>
  0 <= _x && _x <= 0x1F || _x === 0x7F;

// deno-fmt-ignore
/**
 * [White space](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Lexical_grammar#white_space)
 */
export const ws_a = [
  0x9, 0xB, 0xC, 0x20, 0xA0,
  0x0_1680,
  0x0_2000, 0x0_2001, 0x0_2002, 0x0_2003, 0x0_2004, 0x0_2005, 
  0x0_2006, 0x0_2007, 0x0_2008, 0x0_2009, 0x0_200A,
  0x0_202F, 0x0_205F,
  0x0_3000,
  0x0_FEFF,
] as uint16[];
/** @see {@linkcode isSpaceOrTab()} */
export const isWhitespaceUCod = (_x: uint16, a_x: uint16[] = ws_a) =>
  a_x.indexOf(_x) >= 0;

// /* Not sure if js impls use regexp interning like string. So. */
// const ws_re_ = /^\s+$/;
// /** */
// export const isWhitespace = (_x: string) => ws_re_.test(_x);
/*80--------------------------------------------------------------------------*/

const textEncoder_ = new TextEncoder();
export const encodeStr = textEncoder_.encode.bind(textEncoder_);

const textDecoder_ = new TextDecoder();
export const decodeABV = textDecoder_.decode.bind(textDecoder_);
/*80--------------------------------------------------------------------------*/

/** https://developer.mozilla.org/en-US/docs/Glossary/Base64 */
const B64_ = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/**
 * Ref. https://github.com/denoland/std/blob/e02e89fef3cd7f625e487f76e9d56b8b60137102/encoding/base64.ts#L112
 * @const @param data_x
 */
export const b64From = (
  data_x: ArrayBuffer | Uint8Array | string,
): string => {
  const uint8 = validateBinaryLike(data_x);
  let b64 = "";
  let i_;
  const LEN = uint8.length;
  for (i_ = 2; i_ < LEN; i_ += 3) {
    b64 += B64_[(uint8[i_ - 2]!) >> 2];
    b64 += B64_[
      (((uint8[i_ - 2]!) & 0x03) << 4) |
      ((uint8[i_ - 1]!) >> 4)
    ];
    b64 += B64_[
      (((uint8[i_ - 1]!) & 0x0f) << 2) |
      ((uint8[i_]!) >> 6)
    ];
    b64 += B64_[(uint8[i_]!) & 0x3f];
  }
  if (i_ === LEN + 1) {
    /* 1 octet yet to write */
    b64 += B64_[(uint8[i_ - 2]!) >> 2];
    b64 += B64_[((uint8[i_ - 2]!) & 0x03) << 4];
    b64 += "==";
  }
  if (i_ === LEN) {
    /* 2 octets yet to write */
    b64 += B64_[(uint8[i_ - 2]!) >> 2];
    b64 += B64_[
      (((uint8[i_ - 2]!) & 0x03) << 4) |
      ((uint8[i_ - 1]!) >> 4)
    ];
    b64 += B64_[((uint8[i_ - 1]!) & 0x0f) << 2];
    b64 += "=";
  }
  return b64;
};

/**
 * Ref. https://github.com/denoland/std/blob/e02e89fef3cd7f625e487f76e9d56b8b60137102/encoding/base64url.ts#L39
 * @const @param b64_x
 */
export const b64urlFromB64 = (b64_x: string): string => {
  return b64_x.endsWith("=")
    ? b64_x.endsWith("==")
      ? b64_x.replace(/\+/g, "-").replace(/\//g, "_").slice(0, -2)
      : b64_x.replace(/\+/g, "-").replace(/\//g, "_").slice(0, -1)
    : b64_x.replace(/\+/g, "-").replace(/\//g, "_");
};

/**
 * Ref. https://github.com/denoland/std/blob/e02e89fef3cd7f625e487f76e9d56b8b60137102/encoding/base64url.ts#L63
 * @const @param data_x
 */
export const b64urlFrom = (
  data_x: ArrayBuffer | Uint8Array | string,
): string => {
  return b64urlFromB64(b64From(data_x));
};
/*64----------------------------------------------------------*/

/**
 * Ref. https://github.com/denoland/std/blob/e02e89fef3cd7f625e487f76e9d56b8b60137102/encoding/base64.ts#L168
 * @const @param b64_x
 */
export const uint8FromB64 = (b64_x: string): Uint8Array => {
  const binString = atob(b64_x);
  const size = binString.length;
  const uint8 = new Uint8Array(size);
  for (let i = 0; i < size; i++) {
    uint8[i] = binString.charCodeAt(i);
  }
  return uint8;
};

/** @const @param b64_x */
export const decodeB64 = (b64_x: string): string => {
  return decodeABV(uint8FromB64(b64_x));
};

/**
 * Ref. https://github.com/denoland/std/blob/e02e89fef3cd7f625e487f76e9d56b8b60137102/encoding/base64url.ts#L31
 * @param b64url_x
 * @throw `TypeError`
 */
export const b64FromB64url = (b64url_x: string): string => {
  if (!/^[-_A-Z0-9]*?={0,2}$/i.test(b64url_x)) {
    /* Contains characters not part of base64url spec. */
    throw new TypeError("Failed to decode base64url: invalid character");
  }
  const ret =
    (b64url_x.length % 4 === 2
      ? b64url_x + "=="
      : b64url_x.length % 4 === 3
      ? b64url_x + "="
      : b64url_x.length % 4 === 1
      ? undefined
      : b64url_x)?.replace(/\-/g, "+").replace(/_/g, "/");
  if (ret === undefined) throw new TypeError("Illegal base64url string");
  return ret;
};

/**
 * Ref. https://github.com/denoland/std/blob/e02e89fef3cd7f625e487f76e9d56b8b60137102/encoding/base64url.ts#L88
 * @param b64url_x
 * @throw `TypeError`
 */
export const uint8FromB64url = (b64url_x: string): Uint8Array => {
  return uint8FromB64(b64FromB64url(b64url_x));
};

/**
 * @const @param b64url_x
 * @throw `TypeError`
 */
export const decodeB64url = (b64url_x: string): string => {
  return decodeABV(uint8FromB64url(b64url_x));
};
/*80--------------------------------------------------------------------------*/

export const sha256 = async (src_x: string | BufferSource): Promise<string> => {
  if (Is.string(src_x)) src_x = encodeStr(src_x);
  const ab_ = await crypto.subtle.digest("SHA-256", src_x);
  return b64From(ab_);
};

export const murmur3 = (
  _x: string | ArrayBuffer | TypedArray<ArrayBuffer>,
): string => {
  const h_ = new MurmurHash3_64();
  h_.update(_x);
  return h_.hexdigest();
};

// /**
//  * Ref. [Simple (non-secure) hash function](https://stackoverflow.com/a/8831937)
//  */
// export const hash = (src_x: string): string => {
//   let hash = 0;
//   for (let i = 0, iI = src_x.length; i < iI; i++) {
//     const chr = src_x.charCodeAt(i);
//     hash = (hash << 5) - hash + chr;
//     hash |= 0; // Convert to 32bit integer
//   }
//   return hash + "";
// };
/*80--------------------------------------------------------------------------*/
