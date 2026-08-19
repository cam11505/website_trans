import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@site-rescue/content-schema': resolve(process.cwd(), 'packages/content-schema/src/index.ts'),
      '@site-rescue/core': resolve(process.cwd(), 'packages/core/src/index.ts'),
      '@site-rescue/crawler': resolve(process.cwd(), 'packages/crawler/src/index.ts'),
      '@site-rescue/css-references': resolve(
        process.cwd(),
        'packages/css-references/src/index.ts',
      ),
      '@site-rescue/asset-pipeline': resolve(
        process.cwd(),
        'packages/asset-pipeline/src/index.ts',
      ),
      '@site-rescue/exporter-static-html': resolve(
        process.cwd(),
        'packages/exporters/static-html/src/index.ts',
      ),
      '@site-rescue/report': resolve(process.cwd(), 'packages/report/src/index.ts'),
      '@site-rescue/static-verifier': resolve(
        process.cwd(),
        'packages/static-verifier/src/index.ts',
      ),
      '@site-rescue/preview-server': resolve(
        process.cwd(),
        'packages/preview-server/src/index.ts',
      ),
      '@site-rescue/adapter-generic-html': resolve(
        process.cwd(),
        'packages/adapters/generic-html/src/index.ts',
      ),
      '@site-rescue/adapter-weebly': resolve(
        process.cwd(),
        'packages/adapters/weebly/src/index.ts',
      ),
    },
  },
  test: {
    coverage: { reporter: ['text', 'html'] },
    include: ['apps/**/test/**/*.test.ts', 'packages/**/test/**/*.test.ts'],
  },
});
