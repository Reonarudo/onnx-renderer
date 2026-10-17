import { readModel } from './model.js';
import { layoutGraph, type Direction, type Layout } from './layout.js';
import { drawGraph } from './draw.js';
import type { Netron } from './netron.js';
import type { RenderResult } from './runtime.js';

/**
 * Read, lay out and draw one fence: everything the worker does, kept free of the worker so tests
 * can call it directly. `nodes` is the most operators, graph inputs and outputs a fence may hold:
 * past a thousand, a static drawing stops being readable.
 */
export async function renderModel(
  source: string,
  netron: Netron,
  layout: Layout,
  direction: Direction = 'down',
  nodes = 1000
): Promise<RenderResult> {
  const read = await readModel(source, netron);
  if (!read.ok) {
    const result: RenderResult = { status: 'failure', message: read.message };
    if (read.line !== undefined) result.line = read.line;
    if (read.column !== undefined) result.column = read.column;
    return result;
  }
  const { graph } = read;
  if (graph.nodes.length > nodes) {
    return { status: 'failure', message: `The graph has ${graph.nodes.length} nodes, over the ${nodes}-node limit.` };
  }
  let drawing;
  try {
    drawing = await layoutGraph(graph, layout, direction);
  } catch (error) {
    // ELK's messages are Java exception names; the author gets a plain one.
    const detail = error instanceof Error ? error.message : String(error);
    return { status: 'failure', message: `The graph could not be laid out (${detail.slice(0, 200)}).` };
  }
  return { status: 'success', output: drawGraph(drawing), notes: graph.notes };
}
