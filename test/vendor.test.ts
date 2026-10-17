import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const directory = 'vendor/netron';

test('every vendored Netron file matches SHA256SUMS, and the provenance names the commit', () => {
  const sums = readFileSync(join(directory, 'SHA256SUMS'), 'utf8').trim().split('\n');
  assert.equal(sums.length, 7);
  for (const line of sums) {
    const [hash, name] = line.split(/\s+/) as [string, string];
    const actual = createHash('sha256').update(readFileSync(join(directory, name))).digest('hex');
    assert.equal(actual, hash, name);
  }
  const provenance = JSON.parse(readFileSync(join(directory, 'provenance.json'), 'utf8')) as { commit: string; license: string; sources: Record<string, string> };
  assert.match(provenance.commit, /^[0-9a-f]{40}$/);
  assert.equal(provenance.license, 'MIT');
  assert.deepEqual(Object.keys(provenance.sources).sort(), ['LICENSE', 'source/json.js', 'source/onnx-metadata.json', 'source/onnx-proto.js', 'source/onnx.js', 'source/protobuf.js', 'source/text.js']);
});

test('the trimmed metadata keeps what the reader uses and nothing else', () => {
  const metadata = JSON.parse(readFileSync(join(directory, 'onnx-metadata.json'), 'utf8')) as Record<string, unknown>[];
  assert.ok(metadata.length > 500);
  const keys = new Set(metadata.flatMap((type) => Object.keys(type)));
  assert.deepEqual([...keys].sort(), ['attributes', 'category', 'inputs', 'module', 'name', 'outputs', 'version']);
  const conv = metadata.find((type) => type.name === 'Conv' && type.version === 1)!;
  assert.equal(conv.category, 'Layer');
  assert.deepEqual((conv.inputs as unknown[])[0], { name: 'X' });
  assert.deepEqual((conv.attributes as { name: string; default?: unknown }[]).find((a) => a.name === 'group'), { name: 'group', type: 'int64', default: 1 });
});
