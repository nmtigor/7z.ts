/** 80**************************************************************************
 * @module lib/7z/Z7DecodeStream
 * @license LGPL-2.1
 ******************************************************************************/

import type { uint } from "../alias.ts";
import { InStream } from "./InStream.ts";
import { NoInput } from "./util.ts";
import { Z7StreamBufr } from "./Z7StreamBufr.ts";
/*80--------------------------------------------------------------------------*/

export abstract class Z7DecodeStream extends InStream {
  protected readonly bufr$ = new Z7StreamBufr();

  /**
   * After `prepareAsync$()`, `len_x` bytes can be parsed syncly.
   * @const @param len_x
   * @headconst @param chunkCb_x
   * @throw {@linkcode NoInput}
   */
  protected async prepareAsync$(
    len_x: uint,
    chunkCb_x?: () => void,
  ): Promise<void> {
    while (this.bufr$.prepare(len_x) > 0) {
      await this.chunk$;
      chunkCb_x?.();

      if (this.wsDone$) {
        throw new NoInput(this.bufr$.caofs + len_x, this.bufr$.size);
      }

      this.bufr$.add(this.wsU8a$!);
    }
  }

  /**
   * @const @param ofs_x in context
   * @throw {@linkcode NoInput}
   * @throw {@linkcode ExceedSize}
   */
  protected async locateAsync$(ofs_x: uint): Promise<void> {
    if (ofs_x > this.bufr$.cofs) {
      await this.prepareAsync$(ofs_x - this.bufr$.cofs);
    }
    this.bufr$.cofs = ofs_x;
  }
}
/*80--------------------------------------------------------------------------*/
