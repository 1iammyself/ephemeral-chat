/**
 * Copy the compiled Rust cdylib (.dll/.so/.dylib) to proximity-native.node
 * in the bindings/node directory.
 *
 * Usage:
 *   node scripts/copy-addon.js          # copies from target/release
 *   node scripts/copy-addon.js --debug  # copies from target/debug
 */
const fs = require('fs');
const path = require('path');

const isDebug = process.argv.includes('--debug');
const profile = isDebug ? 'debug' : 'release';
const crateRoot = path.resolve(__dirname, '..', '..', '..');  // proximity-core/
const outDir = path.resolve(__dirname, '..');                  // bindings/node/

// The cdylib name comes from the crate name with hyphens replaced by underscores
const crateName = 'proximity_node';

// Platform-specific library naming
let srcFile;
if (process.platform === 'win32') {
  srcFile = path.join(crateRoot, 'target', profile, `${crateName}.dll`);
} else if (process.platform === 'darwin') {
  srcFile = path.join(crateRoot, 'target', profile, `lib${crateName}.dylib`);
} else {
  srcFile = path.join(crateRoot, 'target', profile, `lib${crateName}.so`);
}

const destFile = path.join(outDir, 'proximity-native.node');

if (!fs.existsSync(srcFile)) {
  console.error(`ERROR: Compiled addon not found at ${srcFile}`);
  console.error(`Run: cargo build ${isDebug ? '' : '--release'} -p proximity-node`);
  process.exit(1);
}

fs.copyFileSync(srcFile, destFile);
const stats = fs.statSync(destFile);
console.log(`Copied ${srcFile} -> ${destFile} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);
