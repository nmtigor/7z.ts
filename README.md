TOTEXT

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

### Streamable 7z extract

```bash
7z a -m0=LZMA lzma.7z f😄 fo_1 fo_2
```
```ts
const D_ = `${import.meta.dirname}/testdata`;

await Deno.mkdir(`${D_}/x_lzma`, { recursive: true });
for await (const xf of await Z7.extract(`file://${D_}/lzma.7z`)) {
  const P_ = `${D_}/x_lzma/${xf.path}`;
  if (xf.isDir) {
    await Deno.mkdir(P_, { recursive: true });
  } else {
    await Deno.writeFile(P_, xf.readable ?? new Uint8Array());
  }
}
```
For more use cases, see "src/lib/7z/Z7_test.ts".

### Unittest

```bash
cd /path_to/7z.ts
# deno 2.5.6
deno test -R # 12 passed (29 steps)
```

### Main references

- [ip7z/7zip]
- [xseman/lzma1]

[ip7z/7zip]: https://github.com/ip7z/7zip
[xseman/lzma1]: https://github.com/xseman/lzma1
