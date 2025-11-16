/** 80**************************************************************************
 * @module lib/7z/util
 * @license LGPL-2.1
 ******************************************************************************/

import type { uint } from "../alias.ts";
import { MyError } from "../util.ts";
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
