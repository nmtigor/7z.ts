/** 80**************************************************************************
 * @module lib/7z/util
 * @license LGPL-2.1
 ******************************************************************************/

import type { ts_t, uint, uint8 } from "../alias.ts";
import "../jslang.ts";
import { MyError } from "../util.ts";
import type { FetchP } from "./alias.ts";
import { Z7 } from "./Z7.ts";
/*80--------------------------------------------------------------------------*/

export class NoInput extends MyError {
  /**
   * @const @param required_x
   * @const @param got_x
   */
  constructor(required_x?: uint, got_x?: uint) {
    super(
      required_x ? `required ${required_x}, only got ${got_x}` : "No input",
    );
  }
}

/** For development only */
export class ExceedSize extends MyError {
  /** @const @param msg_x */
  constructor(msg_x?: string) {
    super(msg_x ?? "Exceed size");
  }
}

export class IncorrectFormat extends MyError {
  /** @const @param msg_x */
  constructor(msg_x?: string) {
    super(msg_x ?? "Incorrect format");
  }
}

export class UnsupportedFeature extends MyError {
  /** @const @param msg_x */
  constructor(msg_x?: string) {
    super(msg_x ?? "Unsupported feature");
  }
}

export class ExcessiveMemoryUsage extends MyError {
  /** @const @param msg_x */
  constructor(msg_x?: string) {
    super(msg_x ?? "Excessive memory usage");
  }
}
/*80--------------------------------------------------------------------------*/

export type ArcFileInfoCtorP = {
  url: FetchP;
  arcPath: string;
  isDir: boolean;
  size?: uint;
  mtime: Date | ts_t | null;
};

export class ArcFileInfo {
  url: FetchP;

  arcPath: string;
  isDir: boolean;
  size: uint;
  mtime: ts_t | undefined;

  constructor(_x: ArcFileInfoCtorP) {
    this.url = _x.url;
    this.arcPath = _x.arcPath;
    this.isDir = _x.isDir;
    this.size = _x.isDir ? 0 : (_x.size ?? 0);
    this.mtime = _x.mtime instanceof Date
      ? _x.mtime.valueOf()
      : (_x.mtime ?? undefined);
  }
  /*64||||||||||||||||||||||||||||||||||||||||||||||||||||||||||*/

  /** For testing only */
  toJSON() {
    return {
      url: this.url instanceof Request ? this.url.url : `${this.url}`,
      arcPath: this.arcPath,
      isDir: this.isDir,
      size: this.size,
      mtime: this.mtime ? new Date(this.mtime).myformat() : null,
    };
  }
}
/*80--------------------------------------------------------------------------*/

/** in milliseconds */
const _1601: ts_t = Date.UTC(1601, 0, 1);
/** Convert Windows/LDAP timestamp to Unix timestamp */
export const utsFrom = (wts_x: bigint): ts_t =>
  Math.round(Number(wts_x / 10_000n)) + _1601;
/** Convert Unix timestamp to Windows/LDAP timestamp */
export const wtsFrom = (uts_x: ts_t): bigint => BigInt(uts_x - _1601) * 10_000n;
/*80--------------------------------------------------------------------------*/

/**
 * Use little-endian format\
 * `in( buf_x.length >= ofs_x + m_x)`
 * @const @param val_x
 * @const @param m_x
 * @out @param buf_x
 * @const @param ofs_x
 */
export const writeUint8m = (
  val_x: uint | bigint,
  m_x: 2 | 3 | 4 | 5 | 6 | 7 | 8,
  buf_x: uint8[] | Uint8Array,
  ofs_x: uint = 0,
): void => {
  const bv_ = BigInt(val_x);
  for (let i = 0; i < m_x; i++) {
    buf_x[ofs_x + i] = Number(bv_ >> BigInt(8 * i) & 0xFFn);
  }
};
/*80--------------------------------------------------------------------------*/

export const Z7Num_a = [
  1 << (8 * 0 + 8 - 1),
  1 << (8 * 1 + 8 - 2),
  1 << (8 * 2 + 8 - 3),
  1 << (8 * 3 + 8 - 4),
  1n << (8n * 4n + 8n - 5n),
  1n << (8n * 5n + 8n - 6n),
  1n << (8n * 6n + 8n - 7n),
  1n << (8n * 7n + 8n - 8n),
  1n << (8n * 8n),
];
// console.log({ Z7Num_a });

/**
 * Get number of leading 1s\
 * `in( 0 <= val_x && val_x < 2**64)`
 * @const @param val_x `[0,8]`
 */
export const getZ7L1 = (val_x: uint | bigint): uint8 => {
  let i_ = 0;
  for (; i_ < Z7Num_a.length; i_++) {
    if (val_x < Z7Num_a[i_]) break;
  }
  return i_;
};
// console.log(getZ7L1(2 ** 20)); // 2
// console.log(getZ7L1(2n ** 48n)); // 6
/*80--------------------------------------------------------------------------*/
