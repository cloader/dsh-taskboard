import { defineConfig } from 'tsdown'

/**
 * Host-half build: plain ESM consumed by the Node loader (exports ".").
 *
 * The host half has ZERO runtime @deepseek-ai imports: the three it used to
 * take (dsh-home-paths, dsh-llm/brand, dsh-tools defineTool) are replaced by
 * the structure-compatible pure functions in src/host/sdk.ts. A published
 * copy must never resolve an npm-mirror dsh-tools from the profile's
 * node_modules — it would shadow the CLI-internal build the agent loop
 * talks to (private scheduler symbol mismatch). Remaining @deepseek-ai
 * imports are type-only and vanish at compile time.
 */
export default defineConfig([
  {
    entry: ['src/index.ts'],
    format: 'esm',
    outDir: 'lib',
    outFile: 'index.js',
    clean: false,
    sourcemap: true,
    external: [/^@deepseek-ai\//, /^schemastery$/],
    unbundle: true,
    target: 'node24',
    outExtensions: () => ({ js: '.js' }),
  },
  {
    entry: ['src/invariant.ts'],
    format: 'esm',
    outDir: 'lib',
    outFile: 'invariant.js',
    clean: false,
    sourcemap: true,
    external: [/^@deepseek-ai\//],
    unbundle: true,
    target: 'node24',
    outExtensions: () => ({ js: '.js' }),
  },
])
