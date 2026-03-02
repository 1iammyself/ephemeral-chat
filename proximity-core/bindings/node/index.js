/**
 * proximity-native Node.js addon loader
 *
 * Simple, direct loader for the Rust napi-rs addon.
 * No platform detection magic — just loads the .node binary.
 */
const path = require('path');

const addonPath = path.join(__dirname, 'proximity-native.node');

let nativeBinding;
try {
  nativeBinding = require(addonPath);
} catch (err) {
  throw new Error(
    `Failed to load proximity-native addon from ${addonPath}: ${err.message}\n` +
    `Make sure the addon is built: cd proximity-core && cargo build --release -p proximity-node && node bindings/node/scripts/copy-addon.js`
  );
}

module.exports = nativeBinding;
