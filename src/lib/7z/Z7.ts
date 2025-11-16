/** 80**************************************************************************
 * @module lib/7z/Z7
 * @license LGPL-2.1
 ******************************************************************************/

import { Z7DecodeMainStream } from "./Z7DecodeMainStream.ts";
/*80--------------------------------------------------------------------------*/

export const Z7 = new class {
  /** @const @param url_x */
  async extract(url_x: string | URL): Promise<Z7DecodeMainStream> {
    const zdms = new Z7DecodeMainStream();
    const res = await fetch(url_x);
    res.body!.pipeTo(zdms.writable);

    const err = await zdms.error.promise;
    if (err) throw err;
    // console.log("zdms._db_: ", zdms._db_);
    // console.log(`${zdms._db_.folder_a[0].Coders[0]}`);

    return zdms;
  }
}();
/*80--------------------------------------------------------------------------*/
