This program implements basic functions of the 7z archive file format in the web
environment.

## Features and notes

- This program runs in the web environment, and does not depend on Deno, Bun or
  Node.js.
- This program implements streamable (de)compression, extract, archive. So it's
  memory efficient.
  - To the archive, I put the header to the beginning of the .7z file, rather than
    the end of it. Consequently, by this program archived file could not be
    extracted by the official 7z program.
- About speed, to get a rough idea, I archive a 146MB folder then extract it.
  Here's the result:
  - js (this program): archive 229s, extract 55s
  - c (official 7z): archive 41s, extract 8s

  I.e., this program is about 5-7 times behind the official one.
- This program is written in TS, and does not depend on any other libraries.

Official 7z format specifies rich features. Some of them are planned to be
implemented later based on my needs. Currently, following features are in
vision:

- Add progress callbacks (medium-)
- Split ".7z" to ".7z.001"s (simple)
- Encrypt/Decrypt (medium)
- Implement in WASM (medium+)

## How to use

### Streamable 7z extract

```bash
7z a -m0=LZMA lzma.7z f😄 fo_1
```

```ts
const D_ = `${import.meta.dirname}/testdata`;
const z7_ = "lzma.7z";
const rD_ = "x_lzma";

await Deno.mkdir(`${D_}/gen/${rD_}`, { recursive: true });
await Z7.extract(`file://${D_}/${z7_}`, async (xf) => {
  const P_ = `${D_}/gen/${rD_}/${xf.arcPath}`;
  if (xf.isDir) {
    await Deno.mkdir(P_, { recursive: true });
  } else {
    await Deno.writeFile(P_, xf.readable ?? new Uint8Array());
  }
});
```

### Streamable 7z archive

```ts
const D_ = `${import.meta.dirname}/testdata`;
const RP_a = ["fo_1", "f😄"];
const z7_1 = "lzma_1.7z";

const afi_a: ArcFileInfo[] = [];
for (const RP of RP_a) {
  await getArcFileInfo({ path: `${D_}/${RP}`, recursive: true }, afi_a);
}
const zes = await Z7.archive(afi_a);
await Deno.mkdir(`${D_}/gen`, { recursive: true });
await Deno.writeFile(`${D_}/gen/${z7_1}`, zes.readable);
```

For more use cases, see "src/lib/7z/Z7_test.ts".

### Streamable LZMA (de)compression

```ts
const D_ = `${import.meta.dirname}/testdata`;
const F_ = "lorem.txt";

let res = await fetch(`file://${D_}/${F_}`);
const les = Lzma.compressRs(res.body!, 1);
const enc = await Uint8Array.fromRsU8ary(les.readable);

res = await fetch(`file://${D_}/${F_}.lzma`);
const lds = Lzma.decompressRs(res.body!);
const dec = await Uint8Array.fromRsU8ary(lds.readable);
```

For more use cases, see "src/lib/7z/lzma/Lzma_test.ts".

## Unittest

```bash
cd /path_to/7z.ts
# deno 2.5.6
deno test -R # 13 passed (33 steps)
```

## Main references

- [ip7z/7zip]
- [xseman/lzma1]

[ip7z/7zip]: https://github.com/ip7z/7zip
[xseman/lzma1]: https://github.com/xseman/lzma1
