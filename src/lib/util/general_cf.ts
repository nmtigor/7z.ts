/** 80**************************************************************************
 * For working in cloudflare, seperated from lib/util/general
 *
 * @module lib/util/general_cf
 * @license MIT
 ******************************************************************************/

import { encodeStr } from "./string.ts";
import * as Is from "./is.ts";
/*80--------------------------------------------------------------------------*/

/**
 * Ref. https://github.com/denoland/std/blob/e02e89fef3cd7f625e487f76e9d56b8b60137102/encoding/_validate_binary_like.ts#L5
 * @const @param val_x
 */
export const getTypeName = (val_x: unknown): string => {
  const type = typeof val_x;
  if (type !== "object") {
    return type;
  } else if (val_x === null) {
    return "null";
  } else {
    return val_x?.constructor?.name ?? "object";
  }
};

/**
 * Ref. https://github.com/denoland/std/blob/e02e89fef3cd7f625e487f76e9d56b8b60137102/encoding/_validate_binary_like.ts#L16
 * @throw `TypeError`
 * @const @param src_x
 */
export const validateBinaryLike = (src_x: unknown): Uint8Array => {
  if (Is.string(src_x)) {
    return encodeStr(src_x);
  } else if (src_x instanceof Uint8Array) {
    return src_x;
  } else if (src_x instanceof ArrayBuffer) {
    return new Uint8Array(src_x);
  }
  throw new TypeError(
    `Cannot validate the input as it must be a Uint8Array, a string, or an ArrayBuffer: ` +
      `received a value of the type ${getTypeName(src_x)}`,
  );
};
/*80--------------------------------------------------------------------------*/
