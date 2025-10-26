TOTEXT

### Streamable

```ts
const { size } = Deno.statSync(`${D_}/lorem.txt`);
const les = new LzmaEncodeStream().compress(size, 1);
const res = await fetch(`file://${D_}/lorem.txt`);
const rs_ = res.body!.pipeThrough(les);

const lds = new LzmaDecodeStream().decompress();
const res_1 = await fetch(`file://${D_}/lorem.txt.lzma`);
const rs_1 = res_1.body!.pipeThrough(lds);
```
See `it("streamable"` in "src/lib/7z/lzma/Lzma_test.ts".

### Unittest

```bash
cd /path_to/7z.ts
# deno 2.4.3
deno test -R # 11 passed (29 steps)
```

### Main references

- [ip7z/7zip]
- [xseman/lzma1]

[ip7z/7zip]: https://github.com/ip7z/7zip
[xseman/lzma1]: https://github.com/xseman/lzma1
