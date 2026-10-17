/**
 * The vendored Netron modules (`vendor/netron/`, see THIRD_PARTY_NOTICES.md), loaded from where
 * the package keeps them. They are plain JavaScript that tsc does not compile, so they are reached
 * by URL from `dist/` (or `src/`) and typed here by only what `context.ts` and `model.ts` use.
 */
import { readFile } from 'node:fs/promises';
const vendor = (name) => new URL(`../vendor/netron/${name}`, import.meta.url);
export async function loadNetron() {
    const [onnx, proto, protobuf, text, json, metadata] = await Promise.all([
        import(vendor('onnx.js').href),
        import(vendor('onnx-proto.js').href),
        import(vendor('protobuf.js').href),
        import(vendor('text.js').href),
        import(vendor('json.js').href),
        readFile(vendor('onnx-metadata.json'), 'utf8')
    ]);
    return { onnx, proto, protobuf, text, json, metadata };
}
