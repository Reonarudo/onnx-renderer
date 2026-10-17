// Fetch the Netron modules this library reads ONNX with, pinned to one commit, and record what
// was fetched. `onnx-metadata.json` is kept only for what the reader uses — operator names,
// categories, input and output names, attribute defaults — since its documentation strings are
// 5 MB a drawing never shows. Run `npm run vendor` to re-pin; test/vendor.test.ts checks the result.
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const COMMIT = process.env.NETRON_COMMIT ?? 'aa75482bcf0bcf75565c51126eba40de447c476f';
const VERSION = '9.3.1';
const MODULES = ['onnx.js', 'onnx-proto.js', 'protobuf.js', 'text.js', 'json.js'];
const directory = 'vendor/netron';
await mkdir(directory, { recursive: true });

const fetchText = async (path) => {
  const response = await fetch(`https://raw.githubusercontent.com/lutzroeder/netron/${COMMIT}/${path}`);
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
  return response.text();
};
const sha256 = (text) => createHash('sha256').update(text).digest('hex');

const sources = {};
const written = {};
for (const name of MODULES) {
  const text = await fetchText(`source/${name}`);
  sources[`source/${name}`] = sha256(text);
  await writeFile(join(directory, name), text);
  written[name] = sha256(text);
}
const license = await fetchText('LICENSE');
sources.LICENSE = sha256(license);
await writeFile(join(directory, 'LICENSE'), license);
written.LICENSE = sha256(license);

const metadata = await fetchText('source/onnx-metadata.json');
sources['source/onnx-metadata.json'] = sha256(metadata);
const trimmed = JSON.stringify(JSON.parse(metadata).map((type) => {
  const port = ({ name, list, option }) => ({ name, ...(list ? { list } : {}), ...(option ? { option } : {}) });
  const attribute = ({ name, type, default: value }) => ({ name, type, ...(value !== undefined ? { default: value } : {}) });
  return {
    name: type.name,
    module: type.module,
    version: type.version,
    ...(type.category ? { category: type.category } : {}),
    ...(type.inputs ? { inputs: type.inputs.map(port) } : {}),
    ...(type.outputs ? { outputs: type.outputs.map(port) } : {}),
    ...(type.attributes ? { attributes: type.attributes.map(attribute) } : {})
  };
}));
await writeFile(join(directory, 'onnx-metadata.json'), trimmed);
written['onnx-metadata.json'] = sha256(trimmed);

await writeFile(join(directory, 'SHA256SUMS'), Object.entries(written).map(([name, hash]) => `${hash}  ${name}\n`).join(''));
await writeFile(join(directory, 'provenance.json'), `${JSON.stringify({
  repository: 'https://github.com/lutzroeder/netron',
  commit: COMMIT,
  version: VERSION,
  license: 'MIT',
  sources,
  'onnx-metadata.json': 'source/onnx-metadata.json with every field but name, module, version, category, inputs, outputs and attributes removed by scripts/vendor.mjs'
}, null, 2)}\n`);
console.log(`vendored Netron ${VERSION} (${COMMIT.slice(0, 7)}) into ${directory}`);
