# Third-party notices and provenance

The library's own TypeScript, tests and scripts are MIT licensed (see `LICENSE`).
This does not relicense its dependencies or the vendored code below. elkjs and
`@xmldom/xmldom` are not bundled: they are runtime dependencies installed from the
npm registry, pinned exactly in `package.json` and `package-lock.json`. The test
suite checks that the installed packages, the lock file, this notice and the licence
copies agree.

## Netron 9.3.1 (`vendor/netron/`)

The ONNX reader is [Netron](https://github.com/lutzroeder/netron)'s own, by Lutz
Roeder, MIT licensed (`vendor/netron/LICENSE`, also `licenses/NETRON-LICENSE`).
Five of its source modules are vendored unmodified from commit
`aa75482bcf0bcf75565c51126eba40de447c476f` (version 9.3.1) and loaded by the
layout worker from `vendor/netron/`:

| File | Role |
| --- | --- |
| `onnx.js` | The ONNX model reader: text syntax, protobuf text and binary, JSON |
| `onnx-proto.js` | The `onnx.ModelProto` message classes |
| `protobuf.js` | Protocol Buffers text and binary decoding |
| `text.js` | Text decoding |
| `json.js` | JSON reading |

`onnx-metadata.json` is derived from Netron's `source/onnx-metadata.json` at
the same commit by `scripts/vendor.mjs`, which keeps each operator's name,
module, version, category, input and output names and attribute defaults and
drops the documentation strings, since a drawing never shows them.
`vendor/netron/provenance.json` records the commit and the SHA-256 of every
upstream file; `vendor/netron/SHA256SUMS` pins the vendored files, and the
test suite checks both. Netron's `base.js` is not vendored; the one thing the
reader needs from it, `BigInt.prototype.toNumber`, is re-created in
`src/context.ts` the same way.

Netron's drawing code is not used. The boxes, rows, pills and category
colours follow the look of Netron's `grapher.css`, reimplemented in
`src/draw.ts`.

## elkjs 0.12.0 (Eclipse Layout Kernel)

The layout worker loads `lib/elk.bundled.js` from the npm package
[`elkjs`](https://www.npmjs.com/package/elkjs) 0.12.0: the layered layout algorithm
of the Eclipse Layout Kernel, transpiled from Java to JavaScript by the elkjs
project. It places every node and routes every edge.

elkjs is dual-licensed EPL-2.0 OR GPL-3.0-or-later; this library uses it under the
**Eclipse Public License 2.0**, whose full text is in `licenses/ELKJS-EPL-2.0.md`.
Copyright is held by Kiel University and the ELK contributors. It is used
unmodified. Source code:
<https://github.com/kieler/elkjs> (the JavaScript build) and
<https://github.com/eclipse/elk> (the Java source it is transpiled from).

npm integrity
`sha512-YZcKynxVxYoKIOEpywEPwCFdg+BTbxQRNf3pbwdDCvc8O3kQD8bmIwSxKU1eOTVc4Xo+VG9Te+575mlfvOrhEQ==`.

## XML library

`@xmldom/xmldom` 0.9.12 builds and serialises each graph. Its MIT license and
attribution are in `licenses/XMLDOM-LICENSE`. npm integrity
`sha512-5AXjrcMClTryPe9LgZrygpB1lj7s0S9E0+W+AHaVKAVyHanafK86iPSvG5xHVSp/jC+VH1UXu0TAEmY279xH7A==`.
