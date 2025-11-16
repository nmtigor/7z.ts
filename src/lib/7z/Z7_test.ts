/** 80**************************************************************************
 * @module lib/7z/Z7_test.ts
 * @license MIT
 ******************************************************************************/

import { assertEquals, assertGreaterOrEqual } from "@std/assert";
import { it } from "@std/testing/bdd";
import "../jslang.ts";
import { calcCRC32 } from "../util/crc32.ts";
import { Z7 } from "./Z7.ts";
/*80--------------------------------------------------------------------------*/

const D_ = `${import.meta.dirname}/testdata`;

it("basics", async () => {
  // await Deno.mkdir(`${D_}/x_lzma`, { recursive: true });
  // for await (const xf of await Z7.extract(`file://${D_}/lzma.7z`)) {
  //   const P_ = `${D_}/x_lzma/${xf.path}`;
  //   if (xf.isDir) {
  //     await Deno.mkdir(P_, { recursive: true });
  //   } else {
  //     await Deno.writeFile(P_, xf.readable ?? new Uint8Array());
  //   }
  // }

  const P_a = [
    "fo_1",
    "fo_2",
    "fo_1/add_notes_24dp_E3E3E3_FILL0_wght400_GRAD0_opsz24.svg",
    "fo_1/export_notes_24dp_E3E3E3_FILL0_wght400_GRAD0_opsz24.svg",
    "fo_2/2025-07-16_en",
    "fo_2/2025-07-16_zh",
    "f😄",
  ];
  for await (const xf of await Z7.extract(`file://${D_}/lzma.7z`)) {
    const i_ = P_a.indexOf(xf.path);
    assertGreaterOrEqual(i_, 0);
    const fi = Deno.statSync(`${D_}/${P_a[i_]}`);
    assertEquals(xf.isDir, fi.isDirectory);

    if (xf.hasStream) {
      const dec = await Uint8Array.fromRsU8ary(xf.readable!);
      // const raw = Deno.readFileSync(`${D_}/${P_a[i_]}`);
      // assertEquals(dec, raw);

      if (xf.crc32) {
        assertEquals(xf.crc32, calcCRC32(dec));
      }
    }

    P_a.splice(i_, 1);
  }
});
/*80--------------------------------------------------------------------------*/
