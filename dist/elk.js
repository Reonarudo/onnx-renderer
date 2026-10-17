import { createRequire } from 'node:module';
/**
 * ELK's bundled build, which runs in the calling thread. It is CommonJS whose `module.exports` is
 * the constructor, while its typings declare a default export; requiring it keeps both honest.
 */
export const ELK = createRequire(import.meta.url)('elkjs/lib/elk.bundled.js');
