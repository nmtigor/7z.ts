/** 80**************************************************************************
 * @module lib/7z/Z7_test.ts
 * @license LGPL-2.1
 ******************************************************************************/

import { assertEquals, assertGreaterOrEqual } from "@std/assert";
import { walk } from "@std/fs";
import { basename } from "@std/path";
import { describe, it } from "@std/testing/bdd";
import { pathToFileURL } from "node:url";
import "../jslang.ts";
import { calcCRC32 } from "../util/crc32.ts";
import { ArcFileInfo } from "./util.ts";
import { Z7 } from "./Z7.ts";
/*80--------------------------------------------------------------------------*/

const D_ = `${import.meta.dirname}/testdata`;

type GetArcFileInfoP = {
  path: string | URL;
  /** Default: `basename(path)` */
  arcPath?: string;
  /** Default: `false` */
  recursive?: boolean;
};
/**
 * @const @param _x
 * @out @param out_x
 */
const getArcFileInfo = async (
  _x: GetArcFileInfoP,
  out_x: ArcFileInfo[] = [],
): Promise<ArcFileInfo[]> => {
  // console.log({ path_x, arcPath_x });
  const fi = Deno.statSync(_x.path);
  const arcPath = _x.arcPath ?? basename(_x.path);
  out_x.push(
    new ArcFileInfo({
      url: pathToFileURL(`${_x.path}`),
      arcPath,
      isDir: fi.isDirectory,
      size: fi.size,
      mtime: fi.mtime,
    }),
  );
  if (fi.isDirectory && _x.recursive) {
    // console.log(await Array.fromAsync(walk(path_x)));
    for await (const { path, name } of walk(_x.path, { maxDepth: 1 })) {
      // console.log({ path, name });
      if (path !== _x.path) {
        await getArcFileInfo({
          path: `${_x.path}/${name}`,
          arcPath: `${arcPath}/${name}`,
          recursive: _x.recursive,
        }, out_x);
      }
    }
  }
  return out_x;
};

describe("basics", () => {
  /** archive path array */
  const arcP_a = [
    "fo_1",
    "fo_1/fo_2",
    "fo_1/add_notes_24dp_E3E3E3_FILL0_wght400_GRAD0_opsz24.svg",
    "fo_1/fo_2/2025-07-16_en",
    "fo_1/fo_2/2025-07-16_zh",
    "f😄/mt",
    "f😄",
  ];

  const z7_ = "lzma.7z";
  it(`Z7.extract() "${z7_}"`, async () => {
    const arcP_a_ = arcP_a.slice();
    await Z7.extract(`file://${D_}/${z7_}`, async (xf) => {
      const i_ = arcP_a_.indexOf(xf.arcPath);
      assertGreaterOrEqual(i_, 0);
      const fi = Deno.statSync(`${D_}/${arcP_a_[i_]}`);
      assertEquals(xf.isDir, fi.isDirectory);

      if (xf.size) {
        const dec = await Uint8Array.fromRsU8ary(xf.readable!);
        // const raw = Deno.readFileSync(`${D_}/${arcP_a_[i_]}`);
        // assertEquals(dec, raw);

        if (xf.crc32) {
          assertEquals(xf.crc32, calcCRC32(dec));
        }
      }

      arcP_a_.splice(i_, 1);
    });
    assertEquals(arcP_a_.length, 0);
  });

  const rD_ = "x_lzma";
  /* deno test -RW */
  it.skip(`Z7.extract() "${z7_}" to "gen/${rD_}/"`, async () => {
    await Deno.mkdir(`${D_}/gen/${rD_}`, { recursive: true });
    await Z7.extract(`file://${D_}/${z7_}`, async (xf) => {
      const P_ = `${D_}/gen/${rD_}/${xf.arcPath}`;
      if (xf.isDir) {
        await Deno.mkdir(P_, { recursive: true });
      } else {
        await Deno.writeFile(P_, xf.readable ?? new Uint8Array());
      }
    });
  });

  /** relative path array */
  const RP_a = ["fo_1", "f😄"];

  it("Z7.archive() then Z7.extractRs()", async () => {
    const afi_a: ArcFileInfo[] = [];
    for (const RP of RP_a) {
      await getArcFileInfo({ path: `${D_}/${RP}`, recursive: true }, afi_a);
    }
    const zes = await Z7.archive(afi_a);

    const arcP_a_ = arcP_a.slice();
    await Z7.extractRs(zes.readable, async (xf) => {
      const i_ = arcP_a_.indexOf(xf.arcPath);
      assertGreaterOrEqual(i_, 0);
      const fi = Deno.statSync(`${D_}/${arcP_a_[i_]}`);
      assertEquals(xf.isDir, fi.isDirectory);

      if (xf.size) {
        const dec = await Uint8Array.fromRsU8ary(xf.readable!);
        const raw = Deno.readFileSync(`${D_}/${arcP_a_[i_]}`);
        assertEquals(dec, raw);

        if (xf.crc32) {
          assertEquals(xf.crc32, calcCRC32(dec));
        }
      }

      arcP_a_.splice(i_, 1);
    });
    assertEquals(arcP_a_.length, 0);
  });

  const z7_1 = "lzma_1.7z";
  /* deno test -RW */
  it.skip(`Z7.archive() to "gen/${z7_1}"`, async () => {
    const afi_a: ArcFileInfo[] = [];
    for (const RP of RP_a) {
      await getArcFileInfo({ path: `${D_}/${RP}`, recursive: true }, afi_a);
    }
    // console.log("afi_a: ", afi_a.map((afi) => afi.toJSON()));
    const zes = await Z7.archive(afi_a);
    await Deno.mkdir(`${D_}/gen`, { recursive: true });
    await Deno.writeFile(`${D_}/gen/${z7_1}`, zes.readable);
  });
});

describe("archive/extract with no (de)compression", () => {
  /** archive path array */
  const arcP_a = ["f😄/mt", "f😄"];

  const z7_ = "mt.7z";
  it(`Z7.extract() "${z7_}"`, async () => {
    const arcP_a_ = arcP_a.slice();
    await Z7.extract(`file://${D_}/${z7_}`, (xf) => {
      const i_ = arcP_a_.indexOf(xf.arcPath);
      assertGreaterOrEqual(i_, 0);
      const fi = Deno.statSync(`${D_}/${arcP_a_[i_]}`);
      assertEquals(xf.size, 0);
      assertEquals(xf.isDir, fi.isDirectory);

      arcP_a_.splice(i_, 1);
    });
    assertEquals(arcP_a_.length, 0);
  });

  const rD_ = "x_mt";
  /* deno test -RW */
  it.skip(`Z7.extract() "${z7_}" to "gen/${rD_}/"`, async () => {
    await Deno.mkdir(`${D_}/gen/${rD_}`, { recursive: true });
    await Z7.extract(`file://${D_}/${z7_}`, async (xf) => {
      const P_ = `${D_}/gen/${rD_}/${xf.arcPath}`;
      if (xf.isDir) {
        await Deno.mkdir(P_, { recursive: true });
      } else {
        await Deno.writeFile(P_, xf.readable ?? new Uint8Array());
      }
    });
  });

  /** relative path array */
  const RP_a = ["f😄"];

  it("Z7.archive() then Z7.extractRs()", async () => {
    const afi_a: ArcFileInfo[] = [];
    for (const RP of RP_a) {
      await getArcFileInfo({ path: `${D_}/${RP}`, recursive: true }, afi_a);
    }
    const zes = await Z7.archive(afi_a);

    const arcP_a_ = arcP_a.slice();
    await Z7.extractRs(zes.readable, (xf) => {
      const i_ = arcP_a_.indexOf(xf.arcPath);
      assertGreaterOrEqual(i_, 0);
      const fi = Deno.statSync(`${D_}/${arcP_a_[i_]}`);
      assertEquals(xf.size, 0);
      assertEquals(xf.isDir, fi.isDirectory);

      arcP_a_.splice(i_, 1);
    });
    assertEquals(arcP_a_.length, 0);
  });

  const z7_1 = "mt_1.7z";
  /* deno test -RW */
  it.skip(`Z7.archive() to "gen/${z7_1}"`, async () => {
    const afi_a: ArcFileInfo[] = [];
    for (const RP of RP_a) {
      await getArcFileInfo({ path: `${D_}/${RP}`, recursive: true }, afi_a);
    }
    // console.log("afi_a: ", afi_a.map((afi) => afi.toJSON()));
    const zes = await Z7.archive(afi_a);
    await Deno.mkdir(`${D_}/gen`, { recursive: true });
    await Deno.writeFile(`${D_}/gen/${z7_1}`, zes.readable);
  });
});
/*80--------------------------------------------------------------------------*/
