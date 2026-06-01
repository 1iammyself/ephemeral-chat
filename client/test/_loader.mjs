/**
 * Node module loader hook: prepends a Vite-like `import.meta.env` to any
 * client/src module that references it, so modules written for Vite resolve
 * cleanly under plain Node during tests. Only touches the project's own
 * source (never node_modules) and only when `import.meta.env` is actually used.
 */
export async function load(url, context, nextLoad) {
  const result = await nextLoad(url, context);

  if (result.format === 'module' && result.source && url.includes('/client/src/')) {
    const src = result.source.toString();
    if (src.includes('import.meta.env')) {
      const shim = "import.meta.env ??= { DEV: false, PROD: false, MODE: 'test', SSR: false };\n";
      return { ...result, source: shim + src };
    }
  }

  return result;
}
