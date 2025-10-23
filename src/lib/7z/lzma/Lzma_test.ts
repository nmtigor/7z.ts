/** 80**************************************************************************
 * Ref. [[lzma1]/src/lzma.test.ts](https://github.com/xseman/lzma1/blob/master/src/lzma.test.ts)
 *    * Remove helper functions `bytesToHexString()`, `hexStringToUint8Array()`
 *    * Remove `describe("buffer handling")`
 *    * Fix "large repetitive data to trigger MoveBlock"
 *
 * @module lib/7z/lzma/Lzma_test.ts
 * @license MIT
 ******************************************************************************/

import {
  assertEquals,
  assertInstanceOf,
  assertLess,
  assertNotEquals,
} from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import "../../jslang.ts";
import { b64From, decodeABV, decodeB64 } from "../../util/string.ts";
import {
  compress,
  compressString,
  decompress,
  decompressString,
} from "./Lzma.ts";
import { LzmaEncodeStream } from "./LzmaEncodeStream.ts";
import { LzmaDecodeStream } from "./LzmaDecodeStream.ts";
/*80--------------------------------------------------------------------------*/

const D_ = `${import.meta.dirname}/testdata`;

describe("basics", () => {
  it("hello world", async () => {
    const raw = "hello world";
    const enc_0 = /* deno-fmt-ignore */ new Uint8Array([
0x5d,0x00,0x00,0x01,0x00,0x0b,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x34,0x19,
0x49,0xee,0x8d,0xe9,0x17,0x89,0x3a,0x33,0x60,0x05,0xf7,0xcf,0x64,0xff,0xfb,0x78,
0x20,0x00
    ]);
    const enc = await compressString(raw, 1);
    assertEquals(enc, enc_0);

    // console.log(enc_0.length);
    const dec = await decompressString(enc_0);
    assertEquals(dec, raw);
  });

  it("streamable", async () => {
    const F_ = "lorem.txt";
    const { size } = Deno.statSync(`${D_}/${F_}`);
    const les = new LzmaEncodeStream().compress(size, 1);
    const res = await fetch(`file://${D_}/${F_}`);
    const rs_ = res.body!.pipeThrough(les);
    const enc = await Uint8Array.fromRsU8(rs_);

    const enc_0 = Deno.readFileSync(`${D_}/lorem.lzma`);
    assertEquals(enc, enc_0);

    const lds = new LzmaDecodeStream().decompress();
    const res_1 = await fetch(`file://${D_}/lorem.lzma`);
    const rs_1 = res_1.body!.pipeThrough(lds);
    const dec = await Uint8Array.fromRsU8ary(rs_1);

    const raw = Deno.readTextFileSync(`${D_}/${F_}`);
    assertEquals(decodeABV(dec), raw);
  });
});

describe("compress and decompress edge cases", () => {
  [
    "∆∇√",
    "£→F♣∆",
    "√∑∆j",
    "☆☆∆™",
    "∑∑∂∇×",
    "☆/∂∂∇∆G`∑≠±5V",
    "≈¶p(o¶O°Dc∆R∞*∞$∞¥",
    "\n\\√D√s∂s♠→",
    "∂j√l√c√]<",
    "S€≠Q∂zD#∑ √}√U∑8∑R\t",
    "024020000070042",
  ].forEach((raw_x) => {
    it(raw_x, async () => {
      const enc = await compressString(raw_x, 5);
      const dec = await decompressString(enc);
      assertEquals(dec, raw_x);
    });
  });
});

describe("LZMA class direct usage", () => {
  it("should compress and decompress without initializing LZMA class", async () => {
    const raw = "Testing compression utilities";
    const enc = await compressString(raw);
    const dec = await decompressString(enc);
    assertEquals(dec, raw);
  });

  it("should handle all compression modes", async () => {
    const raw = "Test string for all modes";
    /* Test all compression modes (1-9) */
    for (let mode = 1 as const; mode <= 9; mode++) {
      const enc = await compressString(raw, mode);
      const dec = await decompressString(enc);
      assertEquals(dec, raw);
    }
  });
});

describe("large data compression", () => {
  it("should handle large string input", async () => {
    const raw = "a".repeat(10_000);
    const enc = await compressString(raw); // 3229
    const dec = await decompressString(enc);
    assertEquals(dec, raw);
  });

  it("should compress repeated data efficiently", async () => {
    const raw = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".repeat(1000);
    const enc = await compressString(raw, 1);

    /* Verify compression ratio is good (compressed size should be much smaller) */
    assertLess(enc.length, raw.length / 5);

    const dec = await decompressString(enc);
    assertEquals(dec, raw);
  });
});

describe("error handling", () => {
  it("should gracefully handle very small inputs", async () => {
    const raw_a = ["a", "b", "c", "1", "2", "3"];
    for (const raw of raw_a) {
      const enc = await compressString(raw);
      const dec = await decompressString(enc);
      assertEquals(dec, raw);
    }
  });

  it("should handle inputs with mixed content types", async () => {
    const raw = "Text with numbers 12345 and symbols !@#$%";
    const enc = await compressString(raw);
    const dec = await decompressString(enc);
    assertEquals(dec, raw);
  });
});

describe("complex data structures", () => {
  it("should handle JSON data", async () => {
    const raw = {
      name: "Test Object",
      numbers: [1, 2, 3, 4, 5],
      nested: {
        property: "value",
        flag: true,
        count: 42,
      },
      tags: ["compression", "test", "lzma"],
    };

    const raw_1 = JSON.stringify(raw);
    const enc = await compressString(raw_1);
    const dec = await decompressString(enc);

    assertEquals(dec, raw_1);
    const dec_1 = JSON.parse(dec);
    assertEquals(dec_1, raw);
  });

  it("should handle base64 encoded data", async () => {
    const raw = "This is some text that will be base64 encoded";
    const raw_1 = b64From(raw);

    const enc = await compressString(raw_1);
    const dec = await decompressString(enc);

    assertEquals(dec, raw_1);
    const dec_1 = decodeB64(raw_1);
    assertEquals(dec_1, raw);
  });
});

describe("edge case scenarios", () => {
  it("compressing data with many zero bytes", async () => {
    /* Tests handling of sparse data with repeated zero values */
    /* Tests dictionary optimization and run-length encoding mechanisms */
    const raw = new Uint8Array(10_000);
    /* Just a few non-zero values */
    for (let i = 0; i < raw.length; i += 1000) raw[i] = 255;
    const enc = await compress(raw);
    const dec = await decompress(enc);
    assertEquals(dec, raw);
  });

  it("compressing binary data with all byte values", async () => {
    /* Tests byte value handling across the full range (0-255) */
    /* Ensures the encoder properly processes all possible byte values
    and correctly transforms between signed/unsigned representations */
    const raw = new Uint8Array(256);
    for (let i = 0; i < 256; i++) raw[i] = i;
    const enc = await compress(raw);
    const dec = await decompress(enc);
    assertEquals(dec, raw);
  });
});

describe("internal algorithm behavior", () => {
  it("multistage compression with varying patterns", async () => {
    /* Tests the match finder's ability to handle alternating patterns */
    /* Exercises the dictionary matching and LZ77 substring detection algorithms
		by creating data with both repetitive and random sections */
    let raw = "";
    /* Create a pattern that alternates between repetitive and random sections */
    for (let i = 0; i < 20; i++) {
      /* Add repetitive section */
      raw += "ABCDEFGH".repeat(100);
      /* Add some random data */
      for (let j = 0; j < 100; j++) {
        raw += String.fromCharCode(65 + Math.floor(Math.random() * 26));
      }
    }
    const enc = await compressString(raw);
    const dec = await decompressString(enc);
    assertEquals(dec, raw);
  });
});

describe("boundary condition tests", () => {
  it("decompressing corrupted data", async () => {
    /* Tests error handling and recovery mechanisms when processing damaged data */
    /* Verifies the decoder's robustness against data corruption */
    try {
      /* First compress valid data */
      const raw = "Test data for corruption test";
      const enc = await compressString(raw);

      /* Now corrupt the middle of the enc data */
      const corruptedData = new Uint8Array(enc.length);
      for (let i = 0; i < enc.length; i++) corruptedData[i] = enc[i];

      /* Corrupt data in the middle (after header) */
      if (corruptedData.length > 10) {
        corruptedData[7] = 255 - corruptedData[7];
        corruptedData[8] = 255 - corruptedData[8];
        corruptedData[9] = 255 - corruptedData[9];
      }

      /* This should either throw an error or return invalid data */
      const dec = await decompressString(corruptedData);

      /* If it doesn't throw, the result should at least be different */
      assertNotEquals(dec, raw);
    } catch (error) {
      /* It's okay if it throws, as we're testing error handling */
      assertInstanceOf(error, Error);
    }
  });

  it("handling of almost-maximum-length inputs", async () => {
    /* Tests the algorithm's block boundary handling */
    /* Exercises buffer management near size thresholds to ensure
    proper allocation and processing of data chunks at edge cases */
    const blockSize = 1024 * 64; // 64KB blocks

    /* Test with sizes near block boundaries to hit edge cases */
    for (const offset of [-1, 0, 1]) {
      const size = blockSize + offset;
      const raw = "A".repeat(size);
      const enc = await compressString(raw);
      const dec = await decompressString(enc);
      assertEquals(dec, raw);
    }
  });
});

describe("Internal algorithm stress tests", () => {
  it("large repetitive data to trigger MoveBlock", async () => {
    /* Create data that will trigger internal buffer management
		including the MoveBlock method when buffer boundaries are hit */
    const largeSize = 1024 * 128;
    const pattern = "ABCD".repeat(32); // 128 byte pattern
    const raw = pattern.repeat(Math.ceil(largeSize / pattern.length));

    const enc = await compressString(raw, 1); // 3231
    const dec = await decompressString(enc);
    assertEquals(dec, raw);
  });

  it("compression at different levels to exercise all paths", async () => {
    const raw =
      "This is a test string that will be compressed at different levels to ensure all code paths are exercised."
        .repeat(100);
    // console.log(raw.length); // 10_500

    // const enc = compressString(raw, 1); // 3230
    // const dec = decompressString(enc);
    // assertEquals(dec, raw);

    for (let mode = 1 as const; mode <= 9; ++mode) {
      const enc = await compressString(raw, mode);
      const dec = await decompressString(enc);
      assertEquals(dec, raw);
    }
  });
});
/*80--------------------------------------------------------------------------*/
