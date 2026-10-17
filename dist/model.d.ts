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
export type ReadResult = {
    ok: true;
    graph: Graph;
} | {
    ok: false;
    message: string;
    line?: number;
    column?: number;
};
export declare function readModel(source: string, netron: Netron): Promise<ReadResult>;
