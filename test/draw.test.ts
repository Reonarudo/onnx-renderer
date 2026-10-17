import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ELK } from '../src/elk.js';
import { loadNetron } from '../src/netron.js';
import { renderModel } from '../src/render.js';
import { measure } from '../src/measure.js';
import { sizeOf } from '../src/layout.js';
import { CONV } from './helpers.js';

const netron = await loadNetron();
const elk = new ELK();
const layout = (graph: Parameters<typeof elk.layout>[0]) => elk.layout(graph);

async function draw(source: string, direction?: 'down' | 'right'): Promise<string> {
  const result = await renderModel(source, netron, layout, direction);
  assert.equal(result.status, 'success', JSON.stringify(result));
  return result.status === 'success' ? result.output : '';
}

/** The `viewBox` size, which is the drawing's size in ELK pixels. */
const size = (svg: string) => /viewBox="-8 -8 ([\d.]+) ([\d.]+)"/.exec(svg)!.slice(1, 3).map(Number) as [number, number];

test('a graph is one sizeless SVG with only the onnx class, a viewBox, its operators, rows, pills and labels', async () => {
  const svg = await draw(CONV);
  assert.match(svg, /^<svg class="onnx" viewBox="-8 -8 [\d.]+ [\d.]+" font-family="'Helvetica Neue', Helvetica, Arial, sans-serif" xmlns="http:\/\/www\.w3\.org\/2000\/svg">/);
  assert.doesNotMatch(svg.slice(0, svg.indexOf('>')), / width=| height=/);
  assert.match(svg, /<path d="[^"]+" class="header category-layer" fill="rgb\(51, 85, 136\)"\/><text x="12" y="15" class="type" fill="#fff" stroke="none" font-size="12" font-weight="600">Conv<\/text>/);
  assert.match(svg, /<text x="12" y="[\d.]+" class="attribute" fill="#000" stroke="none" font-size="11"><tspan class="key" fill="#333">kernel_shape<\/tspan> = \[3, 3\]<\/text>/);
  assert.match(svg, /<text x="12" y="[\d.]+" class="weight" [^>]*><tspan class="key" fill="#333" font-weight="600">W<\/tspan> ⟨8×3×3×3⟩<\/text>/);
  assert.match(svg, /<g class="node input"[^>]*><rect [^>]*class="pill" fill="#eee" stroke="#333" stroke-width="1"\/><text x="12" y="15" class="type" fill="#000" [^>]*>x<\/text><text x="12" y="34" class="tensor" fill="#555" stroke="none" font-size="11">float32\[N,3,32,32\]<\/text>/);
  assert.match(svg, /<g class="node output"/);
  assert.match(svg, /<text x="[\d.]+" y="[\d.]+" class="label" fill="#555" stroke="none" font-size="10">N×3×32×32<\/text>/);
  assert.equal((svg.match(/class="wire" fill="none" stroke="#000" stroke-width="1"/g) ?? []).length, 7);
  assert.equal((svg.match(/class="arrow" fill="#000" stroke="none"/g) ?? []).length, 7);
});

test('every element the extension\'s stylesheet coloured is painted, and nothing needs a stylesheet', async () => {
  const svg = await draw(CONV);
  for (const element of svg.match(/<(rect|path|text)\b[^>]*>/g) ?? []) assert.match(element, / fill="/, element);
  assert.doesNotMatch(svg, /<style|style=/);
});

test('a light header writes its type in black; a node name is lighter', async () => {
  const svg = await draw('g (bool c, float[1] x) => (float[1] y) {\n  k = Constant <value_float = 1.0> ()\n  y = If <then_branch = a () => (float[1] t) { t = Relu (x) }, else_branch = b () => (float[1] e) { e = Neg (x) }> (c)\n}');
  assert.match(svg, /class="header category-constant" fill="#eee"\/><text [^>]*class="type" fill="#000"[^>]*>Constant</);
  assert.match(svg, /class="header" fill="#333"\/><text [^>]*class="type" fill="#fff"[^>]*>If</);
  const named = await draw('ir_version: 7\ngraph { node { input: "x" output: "y" op_type: "Relu" name: "act" } input { name: "x" } output { name: "y" } }');
  assert.match(named, /<tspan class="name" font-weight="normal" font-size="11" opacity=".85"> act<\/tspan>/);
});

test('the layout flows down by default, and to the right on request', async () => {
  const [downWidth, downHeight] = size(await draw('g (float[1] x) => (float[1] y) { y = Relu (x) }'));
  const [rightWidth, rightHeight] = size(await draw('g (float[1] x) => (float[1] y) { y = Relu (x) }', 'right'));
  assert.ok(downHeight > downWidth, `down: ${downWidth}×${downHeight}`);
  assert.ok(rightWidth > rightHeight, `right: ${rightWidth}×${rightHeight}`);
});

test('model text reaches the SVG only as escaped text', async () => {
  const svg = await draw('ir_version: 7\ngraph { name: "<g>" node { name: "<n>" input: "<b>x</b>" output: "y" op_type: "Relu" attribute { name: "<a>" type: STRING s: "<i>v</i>" } } input { name: "<b>x</b>" } output { name: "y" } }');
  assert.doesNotMatch(svg, /<b>|<i>|<n>|<a>/);
  assert.match(svg, />&lt;b&gt;x&lt;\/b&gt;<\/text>/);
  assert.match(svg, /<tspan class="key" fill="#333">&lt;a&gt;<\/tspan> = &lt;i&gt;v&lt;\/i&gt;/);
  assert.match(svg, /<title>Relu \(&lt;n&gt;\)<\/title>/);
});

test('failures carry the reader\'s position through, and a graph over the node limit is refused', async () => {
  assert.deepEqual(await renderModel('g (float[1] x) => (float[1] y) {\n  y = Relu (x\n}', netron, layout), { status: 'failure', message: 'Unexpected token \'}\'.', line: 3, column: 1 });
  const chain = ['g (float[1] x0) => (float[1] y) {'];
  for (let i = 0; i < 1001; i++) chain.push(`  x${i + 1} = Relu (x${i})`);
  chain.push('  y = Identity (x1001)', '}');
  assert.deepEqual(await renderModel(chain.join('\n'), netron, layout), { status: 'failure', message: 'The graph has 1004 nodes, over the 1000-node limit.' });
});

test('boxes grow with their widest text, measured as Helvetica', () => {
  assert.equal(measure('iii', 10), 6.66);
  assert.ok(measure('WWW', 10, true) > measure('WWW', 10));
  const narrow = sizeOf({ kind: 'operator', id: 'a', type: 'Relu', attributes: [], weights: [] });
  const wide = sizeOf({ kind: 'operator', id: 'b', type: 'Relu', attributes: [{ name: 'a_long_attribute_name', value: '[1, 2, 3, 4]' }], weights: [{ name: 'W', shape: '1×2' }] });
  assert.deepEqual(narrow, { width: 60, height: 22 });
  assert.ok(wide.width > narrow.width);
  assert.equal(wide.height, 22 + 17 * 2);
  assert.deepEqual(sizeOf({ kind: 'input', id: 'c', name: 'x' }), { width: 60, height: 22 });
  assert.deepEqual(sizeOf({ kind: 'input', id: 'c', name: 'x', type: 'float32[1]' }).height, 39);
});
