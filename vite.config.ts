import { defineConfig } from 'vite';
import { resolve } from 'path';
import { viteStaticCopy } from 'vite-plugin-static-copy';

export default defineConfig({
  plugins: [
    viteStaticCopy({
      targets: [
        {
          src: 'extension/public/icons/*',
          dest: 'icons'
        }
      ]
    })
  ],
  build: {
    // Output to extension/dist directory
    outDir: 'extension/dist',
    emptyOutDir: true,

    // Target modern Chrome
    target: 'es2020',

    // Use esbuild minifier (Vite default)
    minify: 'esbuild',

    // Build contentScript as a single IIFE library
    lib: {
      entry: resolve(__dirname, 'extension/src/contentScript.ts'),
      name: 'ZeroRetryIndex',
      formats: ['iife'],
      fileName: () => 'contentScript.js',
    },

    // Source maps for debugging
    sourcemap: true
  }
});
