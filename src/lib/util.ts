/** 80**************************************************************************
 * This module is loaded with top priority!
 *
 * @module lib/util
 * @license MIT
 ******************************************************************************/

import { AUTOTEST, INOUT } from "../preNs.ts";
import type { uint } from "./alias.ts";
/*80--------------------------------------------------------------------------*/

const space_a_: (string | undefined)[] = [];
export const space = (n_: uint) => {
  if (space_a_[n_] === undefined) {
    space_a_[n_] = new Array(n_).fill(" ").join("");
  }
  return space_a_[n_]!;
};
/*80-------------------------------------------------------------------------*/

/**
 * @throw
 * @const @param assertion
 * @const @param msg
 */
export function assert(
  assertion: any,
  ...data: any[]
  // meta?: { url: string },
) {
  // if (!assertion && meta) {
  //   const match = meta.url.match(/\/([^\/]+\.js)/);
  //   // console.log(match);
  //   if (match) msg += ` (${match[1]})`;
  // }
  /*#static*/ if (!AUTOTEST) {
    console.assert(assertion, ...data);
  }

  if (!assertion) throw new Error(data[0], { cause: data });
}

/** @throw */
export function fail(...data: any[]): never {
  /*#static*/ if (!AUTOTEST) {
    console.assert(false, ...data);
  }

  throw new Error(data[0], { cause: data });
}

export function warn(
  ...data: any[]
  // meta?: { url: string }
) {
  /*#static*/ if (AUTOTEST) return;

  // if (meta) {
  //   const match = meta.url.match(/\/([^\/]+\.js)/);
  //   if (match) msg += ` (${match[1]})`;
  // }
  console.warn(...data);
}
/*80-------------------------------------------------------------------------*/

/**
 * Ref. https://devblogs.microsoft.com/typescript/announcing-typescript-5-0/#decorators
 * @headconst @param _tgt_x
 * @headconst @param ctx_x
 */
export const bind = (_tgt_x: unknown, ctx_x: ClassMethodDecoratorContext) => {
  const methodName = ctx_x.name;
  assert(
    !ctx_x.private,
    `'bound' cannot decorate private properties like ${methodName as string}.`,
  );
  ctx_x.addInitializer(function (this: any) {
    this[methodName] = this[methodName].bind(this);
  });
};

/** @headconst @param _x */
export const out = <This, Return, Args extends any[]>(
  _x: (self_y: This, ret_y: Return, args_y: Args) => void,
) => {
  return (tgt_x: (this: This, ...args: Args) => Return) => {
    return /*#static*/ INOUT
      ? function (this: This, ...args: Args): Return {
        const ret = tgt_x.call(this, ...args);
        _x(this, ret, args);
        return ret;
      }
      : tgt_x;
  };
};
/*80-------------------------------------------------------------------------*/

/**
 * `thik` will be used by CYPRESS, WDIO tesing. Setting this base class is to
 * prevent them from importing `ToolbarResizr`. WDIO tesing runs under Deno
 * environment. Importing `ToolbarResizr` there could cause strange problems.
 */
export abstract class TbR_0 {
  static readonly thik = 48;
}
/*80--------------------------------------------------------------------------*/
