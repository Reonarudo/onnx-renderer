import { type Direction, type Layout } from './layout.js';
import type { Netron } from './netron.js';
import type { RenderResult } from './runtime.js';
/**
 * Read, lay out and draw one fence: everything the worker does, kept free of the worker so tests
 * can call it directly. `nodes` is the most operators, graph inputs and outputs a fence may hold:
 * past a thousand, a static drawing stops being readable.
 */
export declare function renderModel(source: string, netron: Netron, layout: Layout, direction?: Direction, nodes?: number): Promise<RenderResult>;
