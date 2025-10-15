/** 80**************************************************************************
 * Ref. [[lzma1]/src/streams.ts](https://github.com/xseman/lzma1/blob/master/src/streams.ts)
 *    * Remove type `RelativeIndexable`
 *    * Move `isBufferWithCount()` to here, and use valibot in it.
 *
 * @module lib/7z/lzma/streams
 * @license MIT
 ******************************************************************************/

import type { uint, uint8 } from "@fe-lib/alias.ts";
import { vuint } from "@fe-lib/alias.ts";
import * as Is from "@fe-lib/util/is.ts";
import * as v from "@valibot/valibot";
/*80--------------------------------------------------------------------------*/

/** Base stream interface for input/output operations */
export type BaseStream = {
  buf: Uint8Array | uint8[];
  pos: uint;
  count: uint;
};

/** Represents a buffer with a count of used elements */
export type BufferWithCount = {
  buf: uint8[];
  count: uint;
  write(buf: uint8[]): void;
};
const vBufferWithCount_ = v.object({
  buf: v.custom((val) => Is.array(val)),
  count: vuint,
  write: v.function(),
});
export const isBufferWithCount = (x: unknown): x is BufferWithCount => {
  return v.safeParse(vBufferWithCount_, x).success;
};

/** Writer interface for output operations */
export type Writer = {
  buf?: uint8[];
  count?: uint;
  write(buf: uint8[]): void;
};
/*80--------------------------------------------------------------------------*/
