/**
 * What Netron's ONNX reader asks of its host, answered for one fence.
 *
 * Netron's readers take a `context` (`view.Context` in Netron's `view.js`) that hands them the
 * bytes, sniffs their encoding, and loads sibling modules and assets. This is the subset the ONNX
 * reader uses, over a buffer in memory: the fence's text as UTF-8. There is no file to resolve
 * external data against, so `fetch` refuses; a model whose weights live in a side file still
 * draws, since the reader only fetches external data when a tensor's values are asked for.
 */
import type { Netron } from './netron.js';
/**
 * Netron's `base.js` gives BigInt a `toNumber`, and the ONNX reader calls it on every 64-bit field
 * (`ir_version` is one, defaulting to `0n`). `base.js` is not vendored — it is mostly tensor
 * decoding — so the one extension the reader needs is made here, the same way. It is global, but
 * this code runs in the layout worker, whose globals are its own.
 */
declare global {
    interface BigInt {
        toNumber(): number;
    }
}
/** Netron's `base.BinaryStream`: a cursor over a byte buffer. */
export declare class Stream {
    private readonly buffer;
    private position_;
    constructor(buffer: Uint8Array);
    get position(): number;
    get length(): number;
    seek(position: number): void;
    skip(offset: number): void;
    peek(length?: number): Uint8Array;
    read(length?: number): Uint8Array;
    stream(length: number): Stream;
}
/**
 * The name the reader sees the fence under. It decides which of Netron's ONNX readers may claim
 * the bytes: the text-syntax reader refuses `.onnx` (a binary file would be sniffed as text
 * first), and nothing claims `.onnxtxt` by name, so every reader goes by content.
 */
export declare const IDENTIFIER = "fence.onnxtxt";
export declare class FenceContext {
    readonly identifier = "fence.onnxtxt";
    readonly stream: Stream;
    /** Set by the reader that claims the fence (`set`). */
    type: string | undefined;
    value: unknown;
    /** What the reader reported without failing (`error` with `fatal` false). */
    readonly notes: string[];
    private readonly content;
    private readonly tagged;
    private readonly netron;
    constructor(source: string, netron: Netron);
    get container(): null;
    set(type: string, value: unknown): string;
    error(error: unknown, fatal?: boolean): void;
    asset(file: string): Promise<string>;
    require(id: string): Promise<unknown>;
    fetch(file: string): Promise<never>;
    /** Sniff the bytes as `type`, once; `undefined` when they are not that. */
    peek(type: string): Promise<unknown>;
    read(type: string, ...args: unknown[]): Promise<unknown>;
    /** The field tags a protobuf reader finds at the top level, as Netron sniffs a file's format. */
    tags(type: string): Promise<Map<unknown, unknown>>;
}
