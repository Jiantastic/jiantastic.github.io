import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    include: [
      'matrix-evolution/tests/**/*.test.js',
      'alphafold/**/*.test.js',
      'poddy-summaries/**/*.test.js',
    ],
  },
});
