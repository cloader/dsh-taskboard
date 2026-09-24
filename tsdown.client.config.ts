import { defineConfig } from 'tsdown'

/**
 * Client-half build, step 1/2: CJS bundle with every host-provided module
 * (react, @deepseek-ai/*) left as `require(...)` calls. scripts/wrap-client.mjs
 * then wraps this into the web shell's lazy-CJS registration format:
 *
 *   window.__ModuleLoader__.load({ id, factory: (require) => { ...body...; return module.exports } })
 */
export default defineConfig({
  entry: { client: 'src/client/index.ts' },
  format: 'cjs',
  outDir: 'lib',
  clean: false,
  sourcemap: false,
  external: [/^@deepseek-ai\//, /^react(-dom)?(\/.*)?$/, /^schemastery$/],
  target: 'chrome120',
  minify: true,
  outExtensions: () => ({ js: '.cjs' }),
})
