/**
 * Read a fence with Netron's ONNX reader and reduce what it returns to the graph that is
 * drawn: operator nodes with their visible attributes and weights, the graph's inputs and outputs,
 * and the edges between them, labelled with tensor shapes where the model states them.
 *
 * Netron's model objects are rich (tensors with data, nested graphs, functions, metadata); only
 * what a static drawing shows is kept, so the layout worker and the tests speak a small shape.
 */
import { FenceContext } from './context.js';
import type { Netron } from './netron.js';

export interface Attribute {
  name: string;
  value: string;
}

export interface Weight {
  /** The operator's input the weight feeds, e.g. `W`; the tensor's own name when unknown. */
  name: string;
  /** The tensor's shape, `64×3×7×7`, when known. */
  shape?: string;
}

export interface Operator {
  kind: 'operator';
  id: string;
  /** The operator type, e.g. `Conv`. */
  type: string;
  /** Netron's category, lower-cased: `layer`, `activation`, `pool`…; absent when unknown. */
  category?: string;
  /** The node's own name, when the model gives it one that differs from its type. */
  name?: string;
  attributes: Attribute[];
  weights: Weight[];
}

export interface Terminal {
  kind: 'input' | 'output';
  id: string;
  name: string;
  /** The tensor type as the model declares it, e.g. `float32[N,3,224,224]`; absent when unstated. */
  type?: string;
}

export type Node = Operator | Terminal;

export interface Edge {
  from: string;
  to: string;
  /** The tensor's shape, `1×3×224×224`, when the model states it. */
  label?: string;
}

export interface Graph {
  name: string;
  nodes: Node[];
  edges: Edge[];
  /** What was read but is not drawn: nested graphs, functions, the reader's own remarks. */
  notes: string[];
}

export type ReadResult =
  | { ok: true; graph: Graph }
  | { ok: false; message: string; line?: number; column?: number };

/** At most this many characters of an attribute value are shown. */
const MAX_VALUE = 40;
/** A value list longer than this is cut to its first items and an ellipsis. */
const MAX_ITEMS = 8;

export async function readModel(source: string, netron: Netron): Promise<ReadResult> {
  const context = new FenceContext(source, netron);
  const factory = new netron.onnx.ModelFactory();
  let model: NetronModel;
  try {
    const type = await factory.match(context);
    if (!type) {
      return { ok: false, message: 'The fence is not an ONNX model in text, protobuf text or JSON form.' };
    }
    model = await factory.open(context) as NetronModel;
  } catch (error) {
    return failure(error);
  }
  const graphs = model.modules ?? model.graphs ?? [];
  const main = graphs[0];
  if (!main) return { ok: false, message: 'The model has no graph.' };
  const graph = convert(main);
  graph.notes.push(...context.notes);
  if (graphs.length > 1) graph.notes.push(`${graphs.length - 1} further graph(s) are not drawn.`);
  const functions = model.functions ?? [];
  if (functions.length > 0) graph.notes.push(`${functions.length} function(s) are not drawn.`);
  return { ok: true, graph };
}

function failure(error: unknown): ReadResult {
  let message = error instanceof Error ? error.message : String(error);
  // The readers wrap what went wrong: "File format is not onnx.ModelProto (Unexpected token '}' at 3:1)."
  const wrapped = /^File format is not onnx\.\w+ \((.*)\)\.?$/s.exec(message);
  if (wrapped) message = wrapped[1]!;
  // Netron's text reader says where it stopped, as a 1-based line and column, which the render
  // contract counts the same way.
  const where = /\s*\bat (\d+):(\d+)\.?$/.exec(message);
  if (where) {
    const detail = message.slice(0, where.index).trim().replace(/\.$/, '');
    return { ok: false, message: `${detail}.`, line: Number(where[1]), column: Number(where[2]) };
  }
  return { ok: false, message: /[.!?]$/.test(message) ? message : `${message}.` };
}

/* The parts of Netron's object model that are read. */
interface NetronModel {
  modules?: NetronGraph[];
  graphs?: NetronGraph[];
  functions?: unknown[];
}
interface NetronGraph {
  name: string;
  inputs: NetronArgument[];
  outputs: NetronArgument[];
  nodes: NetronNode[];
}
interface NetronArgument {
  name: string;
  value: unknown;
  type?: string | null;
  visible?: boolean;
}
interface NetronTyped {
  type?: { toString(): string; shape?: { dimensions?: unknown[] } } | null;
}
interface NetronValue extends NetronTyped {
  name: string;
  initializer: NetronTyped | null;
}
interface NetronNode {
  name: string;
  type: { name: string; category?: string; module?: string };
  inputs: NetronArgument[];
  outputs: NetronArgument[];
  attributes: NetronArgument[];
}

function convert(graph: NetronGraph): Graph {
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  const notes: string[] = [];
  /** Which node produces each tensor. */
  const producers = new Map<string, string>();
  /** Every value, by name, as first met, for its type. */
  const values = new Map<string, NetronValue>();
  const ids = new Map<string, number>();
  const identify = (base: string): string => {
    const count = ids.get(base) ?? 0;
    ids.set(base, count + 1);
    return count === 0 ? base : `${base}#${count}`;
  };

  for (const input of graph.inputs) {
    for (const value of valuesOf(input)) {
      const id = identify(`in:${value.name}`);
      nodes.push({ kind: 'input', id, name: value.name, ...typeOf(value) });
      producers.set(value.name, id);
      values.set(value.name, value);
    }
  }
  const operators: { node: NetronNode; id: string }[] = [];
  for (const node of graph.nodes) {
    const id = identify(`op:${node.type.name}`);
    operators.push({ node, id });
    for (const output of node.outputs) {
      for (const value of valuesOf(output)) {
        producers.set(value.name, id);
        values.set(value.name, value);
      }
    }
  }
  for (const { node, id } of operators) {
    const weights: Weight[] = [];
    for (const input of node.inputs) {
      for (const value of valuesOf(input)) {
        if (value.initializer) {
          // The metadata names the input (`W`); without it Netron numbers it, and the tensor's own
          // name reads better than a digit.
          const name = input.name && !/^\d+$/.test(input.name) ? input.name : value.name;
          weights.push({ name, ...shapeOf(value.initializer, 'shape') });
          continue;
        }
        let from = producers.get(value.name);
        if (!from) {
          // Named but never declared or produced: a weight left out of a hand-written model, or
          // an input the model forgot. Drawn as an input, so the graph still reads.
          from = identify(`in:${value.name}`);
          nodes.push({ kind: 'input', id: from, name: value.name, ...typeOf(value) });
          producers.set(value.name, from);
        }
        edges.push({ from, to: id, ...shapeOf(values.get(value.name) ?? value) });
      }
    }
    const attributes: Attribute[] = [];
    for (const attribute of node.attributes) {
      if (attribute.visible === false) continue;
      const shown = formatAttribute(attribute, notes, node.type.name);
      if (shown) attributes.push(shown);
    }
    const operator: Operator = { kind: 'operator', id, type: node.type.name, attributes, weights };
    if (node.type.category) operator.category = node.type.category.toLowerCase();
    if (node.name && node.name !== node.type.name) operator.name = node.name;
    nodes.push(operator);
  }
  for (const output of graph.outputs) {
    for (const value of valuesOf(output)) {
      const id = identify(`out:${value.name}`);
      nodes.push({ kind: 'output', id, name: value.name, ...typeOf(value) });
      const from = producers.get(value.name);
      if (from) edges.push({ from, to: id, ...shapeOf(values.get(value.name) ?? value) });
      else notes.push(`Output ${value.name} is not produced by any node.`);
    }
  }
  return { name: graph.name, nodes, edges, notes };
}

function valuesOf(argument: NetronArgument): NetronValue[] {
  const value = argument.value;
  if (Array.isArray(value)) return value.filter((item): item is NetronValue => isValue(item));
  return isValue(value) ? [value] : [];
}

function isValue(item: unknown): item is NetronValue {
  return typeof item === 'object' && item !== null && 'name' in item && 'initializer' in item;
}

function typeOf(value: NetronValue): { type?: string } {
  const type = value.type?.toString();
  return type ? { type } : {};
}

function shapeOf(value: NetronTyped): { label?: string };
function shapeOf(value: NetronTyped, key: 'shape'): { shape?: string };
function shapeOf(value: NetronTyped, key: 'label' | 'shape' = 'label'): Record<string, string> {
  const dimensions = value.type?.shape?.dimensions;
  if (!Array.isArray(dimensions) || dimensions.length === 0) return {};
  return { [key]: dimensions.map((dimension) => dimension === null || dimension === undefined ? '?' : String(dimension)).join('×') };
}

/** One attribute as `name = value` text; graphs and tensors are summarised, not expanded. */
function formatAttribute(attribute: NetronArgument, notes: string[], operator: string): Attribute | undefined {
  const { name, type } = attribute;
  const value = attribute.value;
  if (type === 'graph' || type === 'graph[]') {
    const graphs = Array.isArray(value) ? value : [value];
    const names = graphs.map((graph) => (graph as { name?: string } | null)?.name || 'graph');
    notes.push(`${operator}.${name}: the nested graph${graphs.length > 1 ? 's' : ''} ${names.join(', ')} ${graphs.length > 1 ? 'are' : 'is'} not drawn.`);
    return { name, value: names.map((label) => `graph(${label})`).join(', ') };
  }
  if (type === 'tensor' || type === 'tensor[]') {
    const tensors = Array.isArray(value) ? value : [value];
    return { name, value: tensors.map((tensor) => (tensor as { type?: { toString(): string } } | null)?.type?.toString() || 'tensor').join(', ') };
  }
  return { name, value: truncate(formatValue(value)) };
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) {
    const items = value.slice(0, MAX_ITEMS).map(formatValue);
    if (value.length > MAX_ITEMS) items.push('…');
    return `[${items.join(', ')}]`;
  }
  if (typeof value === 'bigint' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (typeof value === 'string') return value;
  if (typeof value === 'object' && 'toString' in value && value.toString !== Object.prototype.toString) return String(value);
  return JSON.stringify(value);
}

function truncate(text: string): string {
  return text.length > MAX_VALUE ? `${text.slice(0, MAX_VALUE - 1).trimEnd()}…` : text;
}
