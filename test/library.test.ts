import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const notices = readFileSync('THIRD_PARTY_NOTICES.md', 'utf8');
const locked = JSON.parse(readFileSync('package-lock.json', 'utf8')) as { packages: Record<string, { version: string; integrity: string }> };

for (const [name, heading, licence, installedLicence] of [
  ['elkjs', 'elkjs', 'licenses/ELKJS-EPL-2.0.md', 'node_modules/elkjs/LICENSE.md'],
  ['@xmldom/xmldom', '`@xmldom/xmldom`', 'licenses/XMLDOM-LICENSE', 'node_modules/@xmldom/xmldom/LICENSE']
] as const) {
  test(`${name}: the installed version, its integrity and its licence text match the notices`, () => {
    const lock = locked.packages[`node_modules/${name}`]!;
    const installed = JSON.parse(readFileSync(`node_modules/${name}/package.json`, 'utf8')) as { version: string };
    assert.equal(installed.version, lock.version);
    assert.ok(notices.includes(`${heading} ${lock.version}`), `notices name ${name} ${lock.version}`);
    assert.ok(notices.includes(lock.integrity), `notices carry ${name}'s integrity`);
    assert.equal(readFileSync(licence, 'utf8'), readFileSync(installedLicence, 'utf8'));
  });
}

test('Netron is credited at the vendored commit, with its own licence text', () => {
  const provenance = JSON.parse(readFileSync('vendor/netron/provenance.json', 'utf8')) as { commit: string; version: string };
  assert.ok(notices.includes(`Netron ${provenance.version}`));
  assert.ok(notices.includes(provenance.commit));
  assert.equal(readFileSync('licenses/NETRON-LICENSE', 'utf8'), readFileSync('vendor/netron/LICENSE', 'utf8'));
});

test('every runtime dependency is declared, pinned exactly, and nothing else is', () => {
  const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { dependencies: Record<string, string> };
  assert.deepEqual(Object.keys(pkg.dependencies).sort(), ['@xmldom/xmldom', 'elkjs']);
  for (const version of Object.values(pkg.dependencies)) assert.match(version, /^\d+\.\d+\.\d+$/);
});
