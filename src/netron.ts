/**
 * The vendored Netron modules (`vendor/netron/`, see THIRD_PARTY_NOTICES.md), loaded from where
 * the package keeps them. They are plain JavaScript that tsc does not compile, so they are reached
 * by URL from `dist/` (or `src/`) and typed here by only what `context.ts` and `model.ts` use.
 */
import { readFile } from 'node:fs/promises';

export interface Netron {
  onnx: {
    ModelFactory: new () => {
      match(context: unknown): Promise<string | null | undefined>;
      open(context: unknown): Promise<unknown>;
    };
  };
  proto: unknown;
  protobuf: {
    BinaryReader: { open(data: unknown, offset?: number): { signature(): Map<number, number>; decode(): unknown } };
    TextReader: { open(data: unknown): { signature(): Map<string, unknown> } | null };
  };
  text: {
    Reader: { open(data: unknown, length?: number): unknown };
    Decoder: { open(data: unknown, encoding?: string): unknown };
  };
  json: {
    TextReader: { open(data: unknown): { read(): unknown } | null };
  };
  /** `onnx-metadata.json` as the text the reader parses itself. */
  metadata: string;
}

const vendor = (name: string): URL => new URL(`../vendor/netron/${name}`, import.meta.url);

export async function loadNetron(): Promise<Netron> {
  const [onnx, proto, protobuf, text, json, metadata] = await Promise.all([
    import(vendor('onnx.js').href),
    import(vendor('onnx-proto.js').href),
    import(vendor('protobuf.js').href),
    import(vendor('text.js').href),
    import(vendor('json.js').href),
    readFile(vendor('onnx-metadata.json'), 'utf8')
  ]);
  return { onnx, proto, protobuf, text, json, metadata } as Netron;
}
