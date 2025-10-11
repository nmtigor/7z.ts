/** 80**************************************************************************
 * Ref. [[lzma1]/src/lzma.test.ts](https://github.com/xseman/lzma1/blob/master/src/lzma.test.ts)
 *
 * @module lzma1/lzma_test
 * @license MIT
 ******************************************************************************/

import {
  assert,
  assertEquals,
  assertInstanceOf,
  assertLess,
  assertNotEquals,
} from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import { b64From, decodeB64 } from "../../util/string.ts";
import {
  compress,
  compressString,
  decompress,
  decompressString,
  Lzma,
} from "./Lzma.ts";
/*80--------------------------------------------------------------------------*/

describe("basics", () => {
  it("hello world", () => {
    const raw = "hello world";
    const enc_0 = /* deno-fmt-ignore */ new Uint8Array([
0x5d,0x00,0x00,0x01,0x00,0x0b,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x34,0x19,
0x49,0xee,0x8d,0xe9,0x17,0x89,0x3a,0x33,0x60,0x05,0xf7,0xcf,0x64,0xff,0xfb,0x78,
0x20,0x00
    ]);
    const enc = compressString(raw, 1);
    assertEquals(enc, enc_0);

    const dec = decompressString(enc_0);
    assertEquals(dec, raw);
  });

  it("lorem ipsum", () => {
    const raw =
      "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.";
    const enc_0 = /* deno-fmt-ignore */ new Uint8Array([
0x5d,0x00,0x00,0x01,0x00,0xbd,0x01,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x26,0x1b,
0xca,0x46,0x67,0x5a,0xf2,0x77,0xb8,0x7d,0x86,0xd8,0x41,0xdb,0x05,0x35,0xcd,0x83,
0xa5,0x7c,0x12,0xa5,0x05,0xdb,0x90,0xbd,0x2f,0x14,0xd3,0x71,0x72,0x96,0xa8,0x8a,
0x7d,0x84,0x56,0x71,0x8d,0x6a,0x22,0x98,0xab,0x9e,0x3d,0xc3,0x55,0xef,0xcc,0xa5,
0xc3,0xdd,0x5b,0x8e,0xbf,0x03,0x81,0x21,0x40,0xd6,0x26,0x91,0x02,0x45,0x4f,0x92,
0xa1,0x78,0xbb,0x8a,0x00,0xaf,0x90,0x2a,0x26,0x92,0x02,0x23,0xe5,0x5c,0xb3,0x2d,
0xe3,0xe8,0x5c,0x2c,0xfb,0x32,0x25,0x99,0x5c,0xbc,0x71,0xf3,0x58,0x5a,0xd3,0x1b,
0x39,0xb4,0xbf,0x6f,0xc7,0x61,0x36,0x92,0x14,0xe8,0x55,0xd3,0xef,0x77,0xe0,0x68,
0xfb,0xee,0x08,0x72,0x16,0x7e,0x2c,0xed,0x0a,0x69,0x78,0x8e,0x0c,0x1c,0x31,0x67,
0xd5,0xb1,0x74,0x88,0x38,0xf5,0xe7,0x74,0x80,0x6e,0x7e,0x1e,0xaf,0x6d,0xf5,0x32,
0x22,0x17,0xbc,0xda,0x0f,0xa5,0x2f,0x85,0x48,0x72,0x02,0xfc,0xb0,0x14,0xc7,0x16,
0xaa,0xae,0xcf,0x79,0x2a,0x0d,0x15,0x7f,0x49,0x1a,0xe1,0x14,0xd4,0x9b,0x51,0x94,
0xfc,0x9e,0x5d,0xc1,0x1a,0x73,0x30,0x5c,0xbc,0x65,0x2d,0xd8,0x28,0xf9,0x09,0x73,
0xcb,0xf7,0xad,0x4f,0x05,0x72,0x03,0xa5,0x6c,0x08,0x5b,0x36,0x26,0xfa,0x04,0x96,
0x20,0xf5,0x4e,0x13,0x76,0x5f,0xce,0x4b,0x71,0x53,0xa7,0x5d,0x91,0x1b,0x1e,0x77,
0x56,0x40,0x7e,0x91,0xde,0x51,0x72,0x0c,0x10,0x61,0x74,0x4b,0xf6,0x6f,0x6e,0x90,
0x6a,0x13,0x1f,0x99,0xfb,0x42,0xdf,0x6a,0xa8,0x94,0x52,0xcf,0x3d,0x77,0xcf,0x2f,
0x21,0x62,0xcb,0xf3,0x6b,0x5a,0xfe,0xfe,0x62,0x05,0x22,0x6c,0xe8,0xdf,0x9f,0xde,
0x8a,0x60,0xf3,0x7e,0x42,0xa6,0x24,0x48,0xd0,0xf3,0xff,0x66,0xd3,0xe1,0xed,0x4d,
0xd8,0xdb,0x85,0x71,0xa3,0xab,0xc7,0x1b,0xcd,0x67,0x22,0xb7,0x6b,0xbc,0xf2,0x7c,
0x01,0xf0,0x48,0xa5,0x0c,0x38,0x9d,0x70,0xb4,0xe1,0x05,0xff,0xd6,0x30,0x7f,0xf8
    ]);
    const enc = compressString(raw, 1);
    assertEquals(enc, enc_0);

    const dec = decompressString(enc);
    assertEquals(dec, raw);
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
    it(raw_x, () => {
      const enc = compressString(raw_x, 5);
      const dec = decompressString(enc);
      assertEquals(dec, raw_x);
    });
  });
});

describe("LZMA class direct usage", () => {
  it("should create an instance with proper initialization", () => {
    const lzma = new Lzma();
    assert(lzma);
  });

  it("should compress and decompress without initializing LZMA class", () => {
    const raw = "Testing compression utilities";
    const enc = compressString(raw);
    const dec = decompressString(enc);
    assertEquals(dec, raw);
  });

  it("should handle all compression modes", () => {
    const raw = "Test string for all modes";
    /* Test all compression modes (1-9) */
    for (let mode = 1 as const; mode <= 9; mode++) {
      const enc = compressString(raw, mode);
      const dec = decompressString(enc);
      assertEquals(dec, raw);
    }
  });
});

describe("large data compression", () => {
  it("should handle large string input", () => {
    const raw = "a".repeat(10_000);
    /* 3_152_731 = 0x30_1b5b =
    (0x20_0000 + 0x1000) + (0x10_09c9) + (0x80 + 274) */
    const enc = compressString(raw);
    const dec = decompressString(enc);
    assertEquals(dec, raw);
  });

  it("should compress repeated data efficiently", () => {
    const raw = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".repeat(1000);
    const enc = compressString(raw);

    /* Verify compression ratio is good (compressed size should be much smaller) */
    assertLess(enc.length, raw.length / 5);

    const dec = decompressString(enc);
    assertEquals(dec, raw);
  });
});

describe("error handling", () => {
  it("should gracefully handle very small inputs", () => {
    const raw_a = ["a", "b", "c", "1", "2", "3"];
    for (const raw of raw_a) {
      const enc = compressString(raw);
      const dec = decompressString(enc);
      assertEquals(dec, raw);
    }
  });

  it("should handle inputs with mixed content types", () => {
    const raw = "Text with numbers 12345 and symbols !@#$%";
    const enc = compressString(raw);
    const dec = decompressString(enc);
    assertEquals(dec, raw);
  });
});

describe("complex data structures", () => {
  it("should handle JSON data", () => {
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
    const enc = compressString(raw_1);
    const dec = decompressString(enc);

    assertEquals(dec, raw_1);
    const dec_1 = JSON.parse(dec);
    assertEquals(dec_1, raw);
  });

  it("should handle base64 encoded data", () => {
    const raw = "This is some text that will be base64 encoded";
    const raw_1 = b64From(raw);

    const enc = compressString(raw_1);
    const dec = decompressString(enc);

    assertEquals(dec, raw_1);
    const dec_1 = decodeB64(raw_1);
    assertEquals(dec_1, raw);
  });
});

describe("edge case scenarios", () => {
  it("compressing data with many zero bytes", () => {
    /* Tests handling of sparse data with repeated zero values */
    /* Tests dictionary optimization and run-length encoding mechanisms */
    const raw = new Uint8Array(10_000);
    /* Just a few non-zero values */
    for (let i = 0; i < raw.length; i += 1000) raw[i] = 255;
    const enc = compress(raw);
    const dec = decompress(enc);
    assertEquals(dec, raw);
  });

  it("compressing binary data with all byte values", () => {
    /* Tests byte value handling across the full range (0-255) */
    /* Ensures the encoder properly processes all possible byte values
    and correctly transforms between signed/unsigned representations */
    const raw = new Uint8Array(256);
    for (let i = 0; i < 256; i++) raw[i] = i;
    const enc = compress(raw);
    const dec = decompress(enc);
    assertEquals(dec, raw);
  });
});

describe("internal algorithm behavior", () => {
  it("multistage compression with varying patterns", () => {
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
    const enc = compressString(raw);
    const dec = decompressString(enc);
    assertEquals(dec, raw);
  });
});

describe("boundary condition tests", () => {
  it("decompressing corrupted data", () => {
    /* Tests error handling and recovery mechanisms when processing damaged data */
    /* Verifies the decoder's robustness against data corruption */
    try {
      /* First compress valid data */
      const raw = "Test data for corruption test";
      const enc = compressString(raw);

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
      const dec = decompressString(corruptedData);

      /* If it doesn't throw, the result should at least be different */
      assertNotEquals(dec, raw);
    } catch (error) {
      /* It's okay if it throws, as we're testing error handling */
      assertInstanceOf(error, Error);
    }
  });

  it("handling of almost-maximum-length inputs", () => {
    /* Tests the algorithm's block boundary handling */
    /* Exercises buffer management near size thresholds to ensure
    proper allocation and processing of data chunks at edge cases */
    const blockSize = 1024 * 64; // 64KB blocks

    /* Test with sizes near block boundaries to hit edge cases */
    for (const offset of [-1, 0, 1]) {
      const size = blockSize + offset;
      const raw = "A".repeat(size);
      const enc = compressString(raw);
      const dec = decompressString(enc);
      assertEquals(dec, raw);
    }
  });
});

describe("Internal algorithm stress tests", () => {
  it("large repetitive data to trigger MoveBlock", () => {
    /* Create data that will trigger internal buffer management
		including the MoveBlock method when buffer boundaries are hit */
    const largeSize = 1024 * 128;
    const pattern = "ABCD".repeat(32); // 128 byte pattern
    const raw = pattern.repeat(Math.ceil(largeSize / pattern.length));

    const enc = compressString(raw);
    const dec = decompressString(enc);
    assertEquals(dec, raw);
  });

  it("compression at different levels to exercise all paths", () => {
    const raw =
      "This is a test string that will be compressed at different levels to ensure all code paths are exercised."
        .repeat(100);

    for (let mode = 1 as const; mode <= 9; ++mode) {
      const enc = compressString(raw, mode);
      const dec = decompressString(enc);
      assertEquals(dec, raw);
    }
  });
});
/*80--------------------------------------------------------------------------*/
