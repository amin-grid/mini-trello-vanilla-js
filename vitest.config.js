import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // The DOM tests need a browser-like environment.
    environment: 'jsdom',
  },
});
