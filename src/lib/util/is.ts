/** 80**************************************************************************
 * Ref. [[vscode-languageserver-node]/client/src/common/utils/is.ts](https://github.com/microsoft/vscode-languageserver-node/blob/main/client/src/common/utils/is.ts)
 *    * Add `int()`
 *    * Improve `array()`, `typedArray()`, `thenable()`
 *    * Remove `asPromise()`
 *
 * @module lib/util/is
 * @license MIT
 ******************************************************************************/

/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import type { int, Thenable, TypedArray } from "../alias.ts";
/*80--------------------------------------------------------------------------*/

/** @const @param _x */
export function bool(_x: any): _x is boolean {
  return _x === true || _x === false;
}

/** @const @param _x */
export function string(_x: any): _x is string {
  return typeof _x === "string" || _x instanceof String;
}

/** @const @param _x */
export function num(_x: any): _x is number {
  return typeof _x === "number" || _x instanceof Number;
}

/** @const @param _x */
export function int(_x: any): _x is int {
  return Number.isInteger(_x);
}

/** @const @param _x */
export function error(_x: any): _x is Error {
  return _x instanceof Error;
}

/** @const @param _x */
export function func(_x: any): _x is Function {
  return typeof _x === "function";
}

/** @const @param _x */
export function array(_x: any): _x is unknown[] {
  return Array.isArray(_x);
}

/** @const @param _x */
export function stringArray(_x: any): _x is string[] {
  return array(_x) && (_x as any[]).every((_y) => string(_y));
}

/** @const @param _x */
export function typedArray(_x: any): _x is TypedArray {
  return ArrayBuffer.isView(_x) && !(_x instanceof DataView);
}

/**
 * Ref. https://github.com/then/is-promise
 *
 * @headconst @param _x Is const unless `_x.then` is a non-const getter.
 */
export function thenable(_x: any): _x is Thenable<unknown> {
  return !!_x && (typeof _x === "object" || func(_x)) && func(_x.then);
}
// console.assert(thenable(Promise.resolve()));
/*80--------------------------------------------------------------------------*/
