# onnx-renderer

Draw ONNX models written as text as Netron-style graphs — safe, inline-ready SVG — in Node, at
build time. It draws; it never runs a model. One of six renderer libraries that share the
[render contract](http://192.168.188.68:3001/projects/markdown-renderers/wiki/Render_contract);
it started as a copy of [ONNX Graph Preview](https://github.com/Reonarudo/onnx-markdown-preview)
and draws what that extension draws.

```sh
npm install github:Reonarudo/onnx-renderer#v0.1.0
```

On npm 12 or later, a project installing git dependencies also needs `allow-git=root` in its
`.npmrc`. Nothing runs on install: `dist/` and the Netron reader are committed.

## Use

```js
import { createRuntime } from '@reonarudo/onnx-renderer';

const runtime = await createRuntime();
const result = runtime.render({
  source: 'g (float[N, 3] x) => (float[N, 3] y) { y = Relu (x) }',
  direction: 'right'
});
await runtime.dispose();
```

`render({ source, direction? })` is synchronous. `source` is the fence body; `direction` is the
fence's `direction` attribute exactly as written. It returns one of:

| `status` | Fields | When |
| --- | --- | --- |
| `success` | `output`, `notes` | `output` is one `<svg class="onnx" viewBox="…">` with no size, ready to inline; `notes` holds what was read but not drawn, as plain text |
| `failure` | `message`, `line?`, `column?` | a model error (plain text; line and column 1-based and fence-relative, as Netron's reader counts them), an unknown direction, or an exceeded limit |
| `timeout` | `budget` | the layout ran past `timeout` milliseconds |
| `unavailable` | `reason` | the layout worker could not start |

`render` throws only for programmer errors: input that is not `{ source: string, direction?:
string }`, or a call after `dispose()`. `createRuntime` rejects only for invalid options.

### Direction

`direction` is the one fence attribute that changes the drawing: `down` (the default, also when
absent) or `right`, the way the graph flows. Only those two exact, lower-case values are
accepted. Anything else — `Right`, `left`, an empty string — is a `failure` naming the value and
both choices, never a fallback. `DIRECTIONS` and `DEFAULT_DIRECTION` are exported for checking an
attribute.

### Runtime options

| Option | Default | |
| --- | --- | --- |
| `timeout` | `3000` | milliseconds per layout |
| `startupTimeout` | `10000` | milliseconds per worker start, never charged to a render |
| `limits.sourceChars` | `1000000` | fence body, in string length |
| `limits.outputBytes` | `4194304` | the graph's SVG, in UTF-8 bytes |
| `limits.nodes` | `1000` | operators plus graph inputs and outputs |

Each must be a finite positive number. Limits can be raised or lowered, never disabled. The
source default is larger than the other renderers' 64 000, because models in the protobuf text
form routinely run past it. Past a thousand nodes a static drawing stops being readable; dense
graphs of a few hundred nodes can need more than the default timeout.

### What the consumer does

The consumer does everything presentational:

- wraps the SVG: figure, caption, alt text, the author's class and alignment;
- escapes `message`, `notes` and `reason` when writing them into HTML. They are plain text, but
  a message may quote what the author wrote (`Cannot convert <script> to a BigInt`);
- creates one runtime per build or preview and disposes of it;
- caches, if it wants to — including remembering that a fence timed out.

## What is read

The fence holds the whole model, in any of three text forms told apart by content:

- the [ONNX text syntax](https://onnx.ai/onnx/repo-docs/Syntax.html), with or without its
  `<ir_version: …>` header;
- the protobuf text form of `ModelProto` (`onnx.save(…, format="textproto")`, `protoc --decode`);
- the JSON form (`MessageToJson` of a `ModelProto`).

A binary `.onnx` file cannot go in a fence. Nothing outside the fence is read: a tensor whose data
lives in an external file is drawn from its declared type alone.

## What is drawn

Each operator is a box in the style of [Netron](https://github.com/lutzroeder/netron), whose ONNX
reader this library uses:

| In the model | Drawn as |
| --- | --- |
| An operator (`Conv`, `Relu`, …) | A box headed with its type, coloured by Netron's category (layers blue, activations red, pooling green, …), and its name beside the type when it has one |
| An attribute | A row `name = value`; attributes left at their default are not shown, as in Netron. Values are cut at 40 characters and lists at 8 items |
| An initializer the operator reads | A row `W ⟨64×3×7×7⟩`, named as the operator's specification names that input |
| A graph input or output | A pill with its name and, when declared, its type |
| A tensor between operators | An arrow, labelled with the tensor's shape when the model declares it |
| A name that is used but never declared | A pill, as an input: a hand-written model need not spell out every weight |

Nested graphs (an `If`'s branches, a `Loop`'s body) are named in the row but not drawn, and
functions are not drawn; both are returned as `notes`, with anything the reader skipped.

## The output

The graph paints itself. The colours, strokes and font sizes the extension kept in its preview
stylesheet are **presentation attributes** on the elements, so the SVG draws the same with no
stylesheet, and any stylesheet of the consumer's still overrides them. The classes that
stylesheet used are kept for that: `node`, `input`, `output`, `box`, `header`, `category-<name>`,
`type`, `name`, `attribute`, `weight`, `key`, `pill`, `tensor`, `edge`, `wire`, `arrow`,
`label-box` and `label`. The root sets the font family, Helvetica or the nearest sans-serif;
box widths are measured as Helvetica.

The background is transparent, and the boxes and pills are filled, so the drawing reads best on
white. The extension's white card, padding and rounded corners are presentation and stay with
the consumer. The `viewBox` is in ELK's pixels, so a consumer that sizes the SVG from it at 1:1
shows it at the extension's size; scale it with CSS (`max-width: 100%; height: auto`).

## How the safety guarantees are met

Fence source is treated as untrusted.

- **Bounded time.** Netron's reader, ELK's layout and the drawing run in a worker thread that
  `render` blocks on with `Atomics.wait`. A render past its budget terminates the worker; the next
  render starts a fresh one and waits for it under `startupTimeout` — which includes loading the
  reader and ELK and drawing a warm-up graph — before its own budget begins.
- **Bounded memory.** The worker's JavaScript heap is capped at 256 MB, the extension's value.
  A worker that dies mid-render is reported as a `timeout` and replaced.
- **Bounded input and output.** `limits.sourceChars` is checked before the worker sees the
  source, `limits.nodes` after the model is read and before it is laid out, and
  `limits.outputBytes` on the finished SVG.
- **No reach outside.** The reader is handed the fence alone. Its requests for a file, an external
  tensor or a module other than the ONNX schema are refused.
- **Safe to inline, by construction.** There is no sanitizer, because nothing needs removing: the
  SVG is built through the DOM, and the only text from the model — names, types, attribute values,
  shapes — reaches it as escaped text content, never as markup or an attribute value. The output
  holds only `svg`, `g`, `rect`, `path`, `text`, `tspan` and `title`, with geometry, class and
  paint attributes; the tests parse hostile models' output against that allowlist.
- **Isolated, by construction.** The output carries no `id`, no `href`, no `url()` and no
  `<style>`, so two graphs on one page have nothing to collide on and nothing to address outside
  themselves. Should a drawing ever need one, it is to be namespaced with `onnx-<8 hex>-` from the
  source and direction; a test fails the day an id appears.
- **Plain text out.** `message` and `notes` are the reader's words and may quote the fence; they
  never carry markup of the reader's own or an absolute path.

Output is deterministic: the same source and direction yield byte-identical SVG in any runtime.

## The reader

`vendor/netron/` holds five of Netron's source modules, unmodified, and a trimmed copy of its
operator metadata, all from one pinned commit. `SHA256SUMS` pins them and `provenance.json`
records the commit and the SHA-256 of every upstream file; `test/vendor.test.ts` checks both.
`npm run vendor` fetches them again (`NETRON_COMMIT` overrides the commit) and rewrites both
files.

## Development

```sh
npm ci
npm run lint          # tsc --noEmit
npm run compile       # tsc → dist/, which is committed; CI fails if it is stale
npm test              # tests import dist/ and src/, so compile first
npm run test:packed   # npm pack, install into a temp project, render one fence
npm run vendor        # re-fetch the Netron reader at its pinned commit
```

Requires Node 22 or later (`.nvmrc` pins the version used in development).

## License

MIT. Netron's reader is MIT and vendored; elkjs is EPL-2.0 and @xmldom/xmldom MIT, both
installed from npm, not bundled — see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
