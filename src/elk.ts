import { createRequire } from 'node:module';
import type { ELK as Elk, ELKConstructorArguments } from 'elkjs/lib/elk-api.js';

/**
 * ELK's bundled build, which runs in the calling thread. It is CommonJS whose `module.exports` is
 * the constructor, while its typings declare a default export; requiring it keeps both honest.
 */
export const ELK = createRequire(import.meta.url)('elkjs/lib/elk.bundled.js') as new (args?: ELKConstructorArguments) => Elk;
