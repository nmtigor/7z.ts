/** 80**************************************************************************
 * @module lib/7z/Z7
 * @license LGPL-2.1
 ******************************************************************************/

import { _TRACE } from "../../preNs.ts";
import { trace, traceOut } from "../util/trace.ts";
import type { FetchP } from "./alias.ts";
import { ExtractedFile } from "./ExtractedFile.ts";
import type { CompressionMode } from "./lzma/alias.ts";
import type { ArcFileInfo } from "./util.ts";
import { Z7DecodeMainStream } from "./Z7DecodeMainStream.ts";
import { Z7EncodeStream } from "./Z7EncodeStream.ts";
/*80--------------------------------------------------------------------------*/

export const Z7 = new class {
  /**
   * @headconst @param rs_x
   * @headconst @param cb_x
   */
  @traceOut(_TRACE)
  async extractRs(
    rs_x: ReadableStream<Uint8Array>,
    cb_x: (xf: ExtractedFile) => void | Promise<void>,
  ): Promise<void> {
    /*#static*/ if (_TRACE) {
      console.log(`${trace.indent}>>>>>>> Z7.extractRs() >>>>>>>`);
    }
    const zdms = new Z7DecodeMainStream();
    rs_x.pipeTo(zdms.writable);

    await zdms.safeguard.promise;
    // console.log("zdms._db_: ", zdms._db_);
    // console.log(`Coder: ${zdms._db_.folder_a.at(0)?.Coders.at(0)}`);

    for await (using xf of zdms) {
      await cb_x(xf);

      await xf.safeguard.promise;
    }
  }

  /** @headconst @param url_x */
  async extract(
    url_x: FetchP,
    cb_x: (xf: ExtractedFile) => void | Promise<void>,
  ): Promise<void> {
    /*#static*/ if (_TRACE) {
      console.log(`${trace.indent}>>>>>>> Z7.extract() >>>>>>>`);
    }
    const res = await fetch(url_x);
    await this.extractRs(res.body!, cb_x);
  }
  /*64||||||||||||||||||||||||||||||||||||||||||||||||||||||||||*/

  /**
   * @const @param afi_a_x
   * @const @param mode_x
   */
  @traceOut(_TRACE)
  async archive(afi_a_x: ArcFileInfo[], mode_x: CompressionMode = 5) {
    /*#static*/ if (_TRACE) {
      console.log(
        `${trace.indent}>>>>>>> Z7.archive( , mode_x: ${mode_x}) >>>>>>>`,
      );
      // console.log(`${trace.dent}afi_a_x: `, afi_a_x.map((afi) => afi.toJSON()));
    }
    const zes = new Z7EncodeStream(afi_a_x, mode_x);

    await zes.safeguard.promise;

    return zes;
  }
}();
/*80--------------------------------------------------------------------------*/
