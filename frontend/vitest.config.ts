import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config';

// Tests run in the node environment: Phase 9A covers transport + pure adapters
// only, so no DOM/rendering setup is required.
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: 'node',
      globals: false,
      include: ['src/**/*.test.ts'],
    },
  }),
);
