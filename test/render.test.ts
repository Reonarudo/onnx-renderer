import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DOMParser, type Element } from '@xmldom/xmldom';
import { createRuntime, DIRECTIONS, type RenderInput, type RenderResult, type Runtime } from '../dist/index.js';
import { CONV, DENSE } from './helpers.js';

const runtime = await createRuntime();
after(() => runtime.dispose());

const RELU = 'g (float[1] x) => (float[1] y) { y = Relu (x) }';

const success = (result: RenderResult): string => {
  assert.equal(result.status, 'success', JSON.stringify(result));
  return result.status === 'success' ? result.output : '';
};

/**
 * What a graph may contain: the elements and attributes the drawing builds, and no value that
 * names a script, a data URL or a network address. onnx is safe by construction; this proves it.
 */
const ELEMENTS = new Set(['svg', 'g', 'rect', 'path', 'text', 'tspan', 'title']);
const ATTRIBUTES = new Set([
  'class', 'viewBox', 'xmlns', 'transform', 'd', 'x', 'y', 'width', 'height', 'rx',
  'fill', 'stroke', 'stroke-width', 'opacity', 'font-family', 'font-size', 'font-weight'
]);
function assertSafe(svg: string): void {
  assert.doesNotMatch(svg, /<!--|<!DOCTYPE|<\?xml|<!ENTITY/i);
  const document = new DOMParser({ onError: (level, message) => { throw new Error(`${level}: ${message}`); } })
    .parseFromString(svg, 'image/svg+xml');
  const root = document.documentElement!;
  assert.equal(root.getAttribute('class'), 'onnx');
  assert.ok(root.hasAttribute('viewBox'));
  assert.equal(root.hasAttribute('width') || root.hasAttribute('height'), false);
  const visit = (element: Element): void => {
    assert.ok(ELEMENTS.has(element.tagName), `element <${element.tagName}>`);
    for (const attribute of Array.from(element.attributes)) {
      assert.ok(ATTRIBUTES.has(attribute.name), `attribute ${attribute.name} on <${element.tagName}>`);
      if (attribute.name === 'xmlns') {
        assert.equal(attribute.value, 'http://www.w3.org/2000/svg');
        continue;
      }
      assert.doesNotMatch(attribute.value, /javascript:|data:|:\/\/|url\(/i, `${attribute.name}="${attribute.value}"`);
    }
    for (const child of Array.from(element.childNodes)) if (child.nodeType === 1) visit(child as Element);
  };
  visit(root);
}

test('a model renders to one inline-ready SVG that paints itself, with the reader\'s notes', () => {
  const result = runtime.render({ source: 'g (bool c, float[1] x) => (float[1] y) {\n  y = If <then_branch = yes () => (float[1] t) { t = Relu (x) }, else_branch = no () => (float[1] e) { e = Neg (x) }> (c)\n}' });
  const svg = success(result);
  assertSafe(svg);
  assert.match(svg, /^<svg class="onnx" viewBox="/);
  assert.match(svg, />If<\/text>/);
  assert.deepEqual(result.status === 'success' && result.notes, ['If.then_branch: the nested graph yes is not drawn.', 'If.else_branch: the nested graph no is not drawn.']);
});

test('every fence of the extension\'s demo renders as the extension draws it', () => {
  const demo = readFileSync(new URL('./fixtures/demo.md', import.meta.url), 'utf8');
  const fences = [...demo.matchAll(/^```onnx([^\n]*)\n([\s\S]*?)^```$/gm)].map(([, info, source]): RenderInput => {
    const direction = /direction="(\w+)"/.exec(info!)?.[1];
    return direction ? { source: source!, direction } : { source: source! };
  });
  assert.equal(fences.length, 5);
  const results = fences.map((fence) => runtime.render(fence));
  for (const result of results.slice(0, 4)) assertSafe(success(result));
  assert.ok(results[2]!.status === 'success' && results[2]!.notes.length === 2);
  assert.deepEqual(results[4], { status: 'failure', message: 'Unexpected token \'}\'.', line: 3, column: 1 });
});

test('direction is down when absent, right on request, and anything else is a failure naming both', () => {
  const size = (svg: string) => /viewBox="-8 -8 ([\d.]+) ([\d.]+)"/.exec(svg)!.slice(1, 3).map(Number) as [number, number];
  assert.deepEqual(DIRECTIONS, ['down', 'right']);
  const absent = success(runtime.render({ source: RELU }));
  assert.equal(success(runtime.render({ source: RELU, direction: 'down' })), absent);
  const [width, height] = size(success(runtime.render({ source: RELU, direction: 'right' })));
  assert.ok(width > height && size(absent)[1] > size(absent)[0]);
  for (const direction of ['Right', 'DOWN', 'left', '', ' down']) {
    assert.deepEqual(runtime.render({ source: RELU, direction }),
      { status: 'failure', message: `Unknown direction "${direction}": use down or right.` }, direction);
  }
});

test('a model error comes back with its 1-based line and column', () => {
  assert.deepEqual(runtime.render({ source: 'g (float[1] x) => (float[1] y) {\n  y = Relu (x\n}' }),
    { status: 'failure', message: 'Unexpected token \'}\'.', line: 3, column: 1 });
  assert.deepEqual(runtime.render({ source: 'hello world' }),
    { status: 'failure', message: 'The fence is not an ONNX model in text, protobuf text or JSON form.' });
});

test('model text cannot inject markup, handlers or links: it is only ever escaped text', () => {
  const hostile = ['<script>alert(1)</script>', '"><foreignObject onload=alert(1)>', 'javascript:alert(1)',
    'data:text/html,x', 'https://example.com/x.svg', 'url(#x)', '<image href="https://example.com/x.png"/>'];
  for (const text of hostile) {
    const quoted = JSON.stringify(text);
    for (const source of [
      `ir_version: 7\ngraph { name: ${quoted} node { name: ${quoted} input: ${quoted} output: "y" op_type: ${quoted} attribute { name: ${quoted} type: STRING s: ${quoted} } } input { name: ${quoted} } output { name: "y" } }`,
      JSON.stringify({ irVersion: '7', graph: { name: text, node: [{ input: [text], output: ['y'], opType: text, name: text }], input: [{ name: text }], output: [{ name: 'y' }] } })
    ]) {
      const svg = success(runtime.render({ source }));
      assertSafe(svg);
      assert.doesNotMatch(svg, /<(script|foreignObject|image)\b/);
    }
  }
});

test('two graphs on one page share nothing to collide on: no id, reference or style', () => {
  for (const svg of [success(runtime.render({ source: RELU })), success(runtime.render({ source: CONV, direction: 'right' }))]) {
    assert.doesNotMatch(svg, /\bid=|href=|url\(|<style|style=/);
  }
});

test('the same input renders byte-identically, in this runtime and another', async () => {
  const first = success(runtime.render({ source: CONV, direction: 'right' }));
  assert.equal(success(runtime.render({ source: CONV, direction: 'right' })), first);
  const other = await createRuntime();
  try {
    assert.equal(success(other.render({ source: CONV, direction: 'right' })), first);
  } finally {
    await other.dispose();
  }
});

test('a source one character over sourceChars fails naming the limit; one at the limit renders', async () => {
  const sized = (length: number): string => `${RELU}\n#${'x'.repeat(length - RELU.length - 2)}`;
  assert.equal(sized(1_000_000).length, 1_000_000);
  success(runtime.render({ source: sized(1_000_000) }));
  assert.deepEqual(runtime.render({ source: sized(1_000_001) }), { status: 'failure', message: 'ONNX source exceeds the 1000000-character limit.' });
  const small = await createRuntime({ limits: { sourceChars: 60 } });
  try {
    assert.deepEqual(small.render({ source: sized(61) }), { status: 'failure', message: 'ONNX source exceeds the 60-character limit.' });
    success(small.render({ source: sized(60) }));
  } finally {
    await small.dispose();
  }
});

test('a graph one node over limits.nodes fails naming the limit; one at the limit renders', async () => {
  // x, Relu, y: three nodes.
  const small = await createRuntime({ limits: { nodes: 3 } });
  try {
    success(small.render({ source: RELU }));
    assert.deepEqual(small.render({ source: 'g (float[1] x) => (float[1] y) { h = Relu (x)\n y = Neg (h) }' }),
      { status: 'failure', message: 'The graph has 4 nodes, over the 3-node limit.' });
  } finally {
    await small.dispose();
  }
});

test('an output over outputBytes fails naming the limit', async () => {
  const small = await createRuntime({ limits: { outputBytes: 500 } });
  try {
    assert.deepEqual(small.render({ source: CONV }), { status: 'failure', message: 'The drawing exceeds the 500-byte output limit.' });
  } finally {
    await small.dispose();
  }
});

test('a runaway layout times out within its budget, and the next render on the runtime succeeds', async () => {
  const quick = await createRuntime({ timeout: 200 });
  try {
    let started = Date.now();
    assert.deepEqual(quick.render({ source: DENSE }), { status: 'timeout', budget: 200 });
    assert.ok(Date.now() - started < 1200, `timed out after ${Date.now() - started} ms`);
    // The replacement worker loads the reader and ELK and draws its warm-up, which takes longer
    // than 200 ms; none of it is charged to this render's budget.
    started = Date.now();
    success(quick.render({ source: RELU }));
    assert.ok(Date.now() - started < 10000);
  } finally {
    await quick.dispose();
  }
});

test('an engine that cannot start in time is unavailable, with a plain reason', async () => {
  const hasty = await createRuntime({ startupTimeout: 1 });
  try {
    assert.deepEqual(hasty.render({ source: RELU }), { status: 'unavailable', reason: 'the ONNX layout worker did not start within 1 ms' });
  } finally {
    await hasty.dispose();
  }
});

test('messages and notes are plain text: no markup the fence did not hold, no absolute path', () => {
  const sources = [
    'g (float[1] x) => (float[1] y) { y = Relu (x }',
    'ir_version: 7\ngraph { node { input: "x" output: "y" op_type: "Relu" } input { name: "x" } output { name: "z" } }',
    'ir_version: 7\ngraph { initializer { name: "w" data_location: EXTERNAL external_data { key: "location" value: "/etc/passwd" } } }',
    '{"irVersion": "seven"}',
    'g (float[1] x) => (float[1] y) {\n  y = Relu (x\n}'
  ];
  const results = sources.map((source) => runtime.render({ source }));
  for (const result of results) {
    const texts = result.status === 'failure' ? [result.message] : result.status === 'success' ? result.notes : [];
    for (const text of texts) {
      assert.doesNotMatch(text, /[<>]/, text);
      assert.doesNotMatch(text, new RegExp(process.cwd().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
      assert.doesNotMatch(text, /\/Users\/|\/home\/|node_modules|vendor\/netron/);
    }
  }
  assert.deepEqual(results[1]!.status === 'success' && results[1]!.notes, ['Output z is not produced by any node.']);
  // The reader quotes what the author wrote, as plain text that the consumer escapes like any message.
  const quoted = runtime.render({ source: '{"irVersion": "<script>"}' });
  assert.equal(quoted.status === 'failure' && quoted.message, 'File JSON format is not onnx.ModelProto (Cannot convert <script> to a BigInt).');
});

test('invalid runtime options reject createRuntime', async () => {
  for (const options of [
    { timeout: 0 }, { timeout: -1 }, { timeout: Number.NaN }, { timeout: Infinity },
    { startupTimeout: 0 }, { limits: { sourceChars: Infinity } }, { limits: { outputBytes: -5 } },
    { limits: { nodes: 0 } }, { limits: { nodes: '1000' } }, { timeout: '3000' }, { limits: null }, null
  ]) {
    await assert.rejects(createRuntime(options as never), TypeError, JSON.stringify(options));
  }
});

test('render throws only for programmer errors: malformed input, or a call after dispose', async () => {
  for (const input of [undefined, null, RELU, {}, { source: 1 }, { source: RELU, direction: 1 }, { source: RELU, direction: null }]) {
    assert.throws(() => runtime.render(input as never), TypeError, JSON.stringify(input));
  }
  const brief: Runtime = await createRuntime();
  await brief.dispose();
  await brief.dispose();
  assert.throws(() => brief.render({ source: RELU }), /after dispose/);
});
