import type { ELK as Elk, ELKConstructorArguments } from 'elkjs/lib/elk-api.js';
/**
 * ELK's bundled build, which runs in the calling thread. It is CommonJS whose `module.exports` is
 * the constructor, while its typings declare a default export; requiring it keeps both honest.
 */
export declare const ELK: new (args?: ELKConstructorArguments) => Elk;
