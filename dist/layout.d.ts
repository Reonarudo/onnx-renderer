/**
 * Size every node from its text, hand the graph to ELK, and read back where everything went.
 */
import type { ElkNode, ElkPoint } from 'elkjs/lib/elk-api.js';
import type { Graph, Node } from './model.js';
export type Layout = (graph: ElkNode) => Promise<ElkNode>;
export type Direction = 'down' | 'right';
/** Netron's proportions, in pixels: a header row, then one row per attribute or weight. */
export declare const HEADER = 22;
export declare const ROW = 17;
export declare const PAD = 12;
export declare const TYPE_SIZE = 12;
export declare const ROW_SIZE = 11;
export declare const LABEL_SIZE = 10;
/** Text of a row inside an operator: `name = value` or `name ⟨shape⟩`. */
export declare function rowText(row: {
    name: string;
    value?: string;
    shape?: string;
}): string;
export interface Placed {
    node: Node;
    x: number;
    y: number;
    width: number;
    height: number;
}
export interface Wire {
    points: ElkPoint[];
    label?: {
        text: string;
        x: number;
        y: number;
        width: number;
        height: number;
    };
}
export interface Drawing {
    placed: Placed[];
    wires: Wire[];
    width: number;
    height: number;
}
export declare function sizeOf(node: Node): {
    width: number;
    height: number;
};
export declare function layoutGraph(graph: Graph, layout: Layout, direction?: Direction): Promise<Drawing>;
