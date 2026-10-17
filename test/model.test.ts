import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readModel as readWith, type Graph } from '../src/model.js';
import { loadNetron } from '../src/netron.js';
import { CONV } from './helpers.js';

const netron = await loadNetron();
const readModel = (source: string) => readWith(source, netron);

async function read(source: string): Promise<Graph> {
  const result = await readModel(source);
  assert.equal(result.ok, true, JSON.stringify(result));
  return result.ok ? result.graph : (undefined as never);
}

test('the ONNX text syntax: operators, declared types, hidden defaults, weights and implicit inputs', async () => {
  const graph = await read(CONV);
  assert.equal(graph.name, 'cnn');
  assert.deepEqual(graph.nodes.map((node) => node.id), ['in:x', 'op:Conv', 'op:Relu', 'op:GlobalAveragePool', 'in:fc_w', 'in:fc_b', 'op:Gemm', 'out:y']);
  const conv = graph.nodes[1]!;
  assert.equal(conv.kind, 'operator');
  if (conv.kind !== 'operator') return;
  assert.equal(conv.category, 'layer');
  // `group = 1` is the operator's default, so Netron hides it; `w` is an initializer, so it is a row.
  assert.deepEqual(conv.attributes, [{ name: 'kernel_shape', value: '[3, 3]' }, { name: 'pads', value: '[1, 1, 1, 1]' }]);
  assert.deepEqual(conv.weights, [{ name: 'W', shape: '8×3×3×3' }]);
  const gemm = graph.nodes[6]!;
  assert.deepEqual(gemm.kind === 'operator' ? gemm.attributes : [], [{ name: 'transB', value: '1' }]);
  assert.deepEqual(graph.nodes[0], { kind: 'input', id: 'in:x', name: 'x', type: 'float32[N,3,32,32]' });
  // Names the model never declares are drawn as inputs, so a hand-written model still reads.
  assert.deepEqual(graph.nodes[4], { kind: 'input', id: 'in:fc_w', name: 'fc_w' });
  assert.deepEqual(graph.nodes[7], { kind: 'output', id: 'out:y', name: 'y', type: 'float32[N,10]' });
  assert.deepEqual(graph.edges, [
    { from: 'in:x', to: 'op:Conv', label: 'N×3×32×32' },
    { from: 'op:Conv', to: 'op:Relu' },
    { from: 'op:Relu', to: 'op:GlobalAveragePool' },
    { from: 'op:GlobalAveragePool', to: 'op:Gemm' },
    { from: 'in:fc_w', to: 'op:Gemm' },
    { from: 'in:fc_b', to: 'op:Gemm' },
    { from: 'op:Gemm', to: 'out:y', label: 'N×10' }
  ]);
  assert.deepEqual(graph.notes, []);
});

test('the header is optional', async () => {
  const graph = await read('g (float[2] x) => (float[2] y) { y = Relu (x) }');
  assert.deepEqual(graph.nodes.map((node) => node.id), ['in:x', 'op:Relu', 'out:y']);
});

test('protobuf text and JSON are read too', async () => {
  const pbtxt = await read('ir_version: 7\ngraph { name: "g" node { input: "x" output: "y" op_type: "Sigmoid" } input { name: "x" type { tensor_type { elem_type: 1 shape { dim { dim_value: 2 } dim { dim_param: "C" } } } } } output { name: "y" } }');
  assert.deepEqual(pbtxt.nodes.map((node) => node.id), ['in:x', 'op:Sigmoid', 'out:y']);
  assert.deepEqual(pbtxt.edges[0], { from: 'in:x', to: 'op:Sigmoid', label: '2×C' });
  const json = await read('{"irVersion":"7","graph":{"name":"j","node":[{"input":["x"],"output":["y"],"opType":"Tanh","name":"act"}],"input":[{"name":"x"}],"output":[{"name":"y"}]}}');
  assert.deepEqual(json.nodes[1], { kind: 'operator', id: 'op:Tanh', type: 'Tanh', category: 'activation', name: 'act', attributes: [], weights: [] });
});

test('a syntax error names its line and column, both counted from 1 as Netron counts them', async () => {
  assert.deepEqual(await readModel('g (float[1] x) => (float[1] y) {\n  y = Relu (x\n}'), { ok: false, message: 'Unexpected token \'}\'.', line: 3, column: 1 });
  const missing = await readModel('g (float[1] x) => (float[1] y) {\n  y = Relu x)\n}');
  assert.equal(missing.ok, false);
  if (missing.ok) return;
  assert.match(missing.message, /^Expected '\('|^Unexpected/);
  assert.deepEqual([missing.line, missing.column], [2, 12]);
});

test('text that is no model at all is refused in one sentence', async () => {
  assert.deepEqual(await readModel('hello world'), { ok: false, message: 'The fence is not an ONNX model in text, protobuf text or JSON form.' });
  assert.deepEqual(await readModel(''), { ok: false, message: 'The fence is not an ONNX model in text, protobuf text or JSON form.' });
  assert.deepEqual(await readModel('{"a": 1}'), { ok: false, message: 'The fence is not an ONNX model in text, protobuf text or JSON form.' });
});

test('nested graphs are named in the row and noted, not drawn; repeated types get distinct ids', async () => {
  const graph = await read(`g (bool c, float[1] x) => (float[1] y) {
  y = If <then_branch = yes () => (float[1] t) { t = Relu (x) }, else_branch = no () => (float[1] e) { e = Neg (x) }> (c)
  z = Relu (x)
  w = Relu (z)
}`);
  const branch = graph.nodes.find((node) => node.id === 'op:If');
  assert.deepEqual(branch?.kind === 'operator' ? branch.attributes : [], [{ name: 'then_branch', value: 'graph(yes)' }, { name: 'else_branch', value: 'graph(no)' }]);
  assert.deepEqual(graph.notes, ['If.then_branch: the nested graph yes is not drawn.', 'If.else_branch: the nested graph no is not drawn.']);
  assert.deepEqual(graph.nodes.filter((node) => node.kind === 'operator').map((node) => node.id), ['op:If', 'op:Relu', 'op:Relu#1']);
});

test('long values are cut, long lists are elided, and strings and floats are shown as written', async () => {
  const graph = await read(`g (float[1] x) => (float[1] y) {
  y = Custom <s = "a very long string value that goes on and on and on and on", f = 0.5, ints = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], strs = ["a", "b"]> (x)
}`);
  const custom = graph.nodes[1];
  assert.deepEqual(custom?.kind === 'operator' ? custom.attributes : [], [
    { name: 's', value: 'a very long string value that goes on a…' },
    { name: 'f', value: '0.5' },
    { name: 'ints', value: '[1, 2, 3, 4, 5, 6, 7, 8, …]' },
    { name: 'strs', value: '[a, b]' }
  ]);
  assert.equal(custom?.kind === 'operator' ? custom.category : 'x', undefined);
});
