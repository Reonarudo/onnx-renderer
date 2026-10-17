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
  interface BigInt { toNumber(): number }
}
if (typeof BigInt.prototype.toNumber !== 'function') {
  Object.defineProperty(BigInt.prototype, 'toNumber', {
    value: function toNumber(this: bigint): number {
      if (this > Number.MAX_SAFE_INTEGER || this < Number.MIN_SAFE_INTEGER) {
        throw new Error(`64-bit value 0x${this.toString(16)} exceeds safe integer.`);
      }
      return Number(this);
    },
    configurable: true,
    writable: true
  });
}

/** Netron's `base.BinaryStream`: a cursor over a byte buffer. */
export class Stream {
  private position_ = 0;
  constructor(private readonly buffer: Uint8Array) {}
  get position(): number { return this.position_; }
  get length(): number { return this.buffer.length; }
  seek(position: number): void {
    this.position_ = position >= 0 ? position : this.buffer.length + position;
    if (this.position_ > this.buffer.length || this.position_ < 0) throw new Error('Unexpected end of file.');
  }
  skip(offset: number): void { this.seek(this.position_ + offset); }
  peek(length?: number): Uint8Array {
    if (this.position_ === 0 && length === undefined) return this.buffer;
    const start = this.position_;
    this.skip(length === undefined ? this.buffer.length - start : length);
    const end = this.position_;
    this.seek(start);
    return this.buffer.subarray(start, end);
  }
  read(length?: number): Uint8Array {
    if (this.position_ === 0 && length === undefined) {
      this.position_ = this.buffer.length;
      return this.buffer;
    }
    const start = this.position_;
    this.skip(length === undefined ? this.buffer.length - start : length);
    return this.buffer.subarray(start, this.position_);
  }
  stream(length: number): Stream { return new Stream(this.read(length).slice(0)); }
}

/**
 * The name the reader sees the fence under. It decides which of Netron's ONNX readers may claim
 * the bytes: the text-syntax reader refuses `.onnx` (a binary file would be sniffed as text
 * first), and nothing claims `.onnxtxt` by name, so every reader goes by content.
 */
export const IDENTIFIER = 'fence.onnxtxt';

export class FenceContext {
  readonly identifier = IDENTIFIER;
  readonly stream: Stream;
  /** Set by the reader that claims the fence (`set`). */
  type: string | undefined;
  value: unknown;
  /** What the reader reported without failing (`error` with `fatal` false). */
  readonly notes: string[] = [];
  private readonly content = new Map<string, unknown>();
  private readonly tagged = new Map<string, Map<unknown, unknown>>();

  private readonly netron: Netron;

  constructor(source: string, netron: Netron) {
    this.stream = new Stream(new TextEncoder().encode(source));
    this.netron = netron;
  }

  get container(): null { return null; }

  set(type: string, value: unknown): string {
    this.type = type;
    this.value = value;
    return type;
  }

  error(error: unknown, fatal?: boolean): void {
    if (fatal !== false) throw error;
    this.notes.push(error instanceof Error ? error.message : String(error));
  }

  async asset(file: string): Promise<string> {
    if (file === 'onnx-metadata.json') return this.netron.metadata;
    throw new Error(`No asset '${file}'.`);
  }

  async require(id: string): Promise<unknown> {
    if (id === './onnx-proto') return this.netron.proto;
    throw new Error(`No module '${id}' is available in a fence.`);
  }

  async fetch(file: string): Promise<never> {
    throw new Error(`'${file}' cannot be read: a fence has no files beside it.`);
  }

  /** Sniff the bytes as `type`, once; `undefined` when they are not that. */
  async peek(type: string): Promise<unknown> {
    if (!this.content.has(type)) {
      this.content.set(type, undefined);
      if (type === 'json') {
        const position = this.stream.position;
        try {
          const reader = this.netron.json.TextReader.open(this.stream);
          if (reader) this.content.set(type, reader.read());
        } catch {
          // Not JSON: the reader asks about other encodings next.
        }
        this.stream.seek(position);
      }
    }
    return this.content.get(type);
  }

  async read(type: string, ...args: unknown[]): Promise<unknown> {
    switch (type) {
      case 'json': {
        const reader = this.netron.json.TextReader.open(this.stream);
        if (!reader) throw new Error('Invalid JSON content.');
        return reader.read();
      }
      case 'protobuf.binary': return this.netron.protobuf.BinaryReader.open(this.stream);
      case 'protobuf.text': return this.netron.protobuf.TextReader.open(this.stream);
      case 'text': {
        if (typeof args[0] === 'number') return this.netron.text.Reader.open(this.stream.peek(Math.min(this.stream.length, args[0])));
        return this.netron.text.Reader.open(this.stream);
      }
      case 'text.decoder': return this.netron.text.Decoder.open(this.stream);
      default: return this.peek(type);
    }
  }

  /** The field tags a protobuf reader finds at the top level, as Netron sniffs a file's format. */
  async tags(type: string): Promise<Map<unknown, unknown>> {
    if (!this.tagged.has(type)) {
      let tags = new Map<unknown, unknown>();
      const position = this.stream.position;
      // JSON is never protobuf; the signature readers would otherwise read tags into it.
      const isJson = (() => { try { return this.netron.json.TextReader.open(this.stream) !== null; } catch { return false; } })();
      this.stream.seek(position);
      if (!isJson) {
        try {
          if (type === 'pbtxt') tags = this.netron.protobuf.TextReader.open(this.stream)?.signature() ?? tags;
          else if (type === 'pb') tags = this.netron.protobuf.BinaryReader.open(this.stream).signature();
          else if (type === 'pb+') tags = asTags(this.netron.protobuf.BinaryReader.open(this.stream).decode());
        } catch {
          tags = new Map();
        }
      }
      this.stream.seek(position);
      this.tagged.set(type, tags);
    }
    return this.tagged.get(type)!;
  }
}

/** `pb+` tags are a plain object in Netron; the ONNX reader indexes it by field number. */
function asTags(decoded: unknown): Map<unknown, unknown> {
  // The reader treats the result as an object with numeric keys, not a Map, so hand it back as is
  // through a Map-shaped wrapper only where `size` is asked for.
  const object = (decoded ?? {}) as Record<string, unknown>;
  const map = new Map<unknown, unknown>(Object.entries(object));
  return Object.assign(map, object);
}
