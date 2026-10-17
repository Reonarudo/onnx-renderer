import type { Direction } from './layout.js';
export interface RuntimeOptions {
    /** Milliseconds per render; default 3000. */
    timeout?: number;
    /** Milliseconds per engine start; default 10000. */
    startupTimeout?: number;
    limits?: {
        /** Whole fence body, in string length; default 1000000. */
        sourceChars?: number;
        /** Success output, in UTF-8 bytes; default 4 MiB. */
        outputBytes?: number;
        /** Operators plus graph inputs and outputs; default 1000. */
        nodes?: number;
    };
}
/** One fence: its body, and its `direction` attribute exactly as written (absent means `down`). */
export interface RenderInput {
    source: string;
    direction?: string;
}
export type RenderResult = {
    status: 'success';
    output: string;
    notes: string[];
} | {
    status: 'failure';
    message: string;
    line?: number;
    column?: number;
} | {
    status: 'timeout';
    budget: number;
} | {
    status: 'unavailable';
    reason: string;
};
export interface Runtime {
    render(input: RenderInput): RenderResult;
    dispose(): Promise<void>;
}
/** The directions a graph flows in, as the `direction` attribute spells them. */
export declare const DIRECTIONS: readonly Direction[];
export declare const DEFAULT_DIRECTION: Direction;
/**
 * Run Netron's ONNX reader, ELK and the drawing in a worker thread that `render` blocks on.
 *
 * ELK's layered layout is superlinear in the number of nodes and edges, so a large enough graph
 * can take many seconds. A render that overruns its budget terminates the worker — the only way to
 * stop it mid-flight — and the next render starts a fresh one, so one pathological model costs
 * only its own fence.
 */
export declare function createRuntime(options?: RuntimeOptions): Promise<Runtime>;
