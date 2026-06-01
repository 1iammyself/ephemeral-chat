/**
 * Test setup: registers a loader that shims Vite's `import.meta.env` for
 * client/src modules so they can run under plain Node (the production build
 * gets `import.meta.env` from Vite). Used via `node --import ./client/test/_setup.mjs`.
 *
 * Files starting with `_` are not matched by the `*.test.js` glob, so this is
 * never executed as a test.
 */
import { register } from 'node:module';

register('./_loader.mjs', import.meta.url);
