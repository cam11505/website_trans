import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@site-rescue/content-schema': resolve(process.cwd(), 'packages/content-schema/src/index.ts'),
      '@site-rescue/crawler': resolve(process.cwd(), 'packages/crawler/src/index.ts'),
      '@site-rescue/asset-pipeline': resolve(
        process.cwd(),
        'packages/asset-pipeline/src/index.ts',
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
