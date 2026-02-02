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

    // Library mode for content script
    lib: {
      entry: resolve(__dirname, 'extension/src/contentScript.ts'),
      name: 'ContentScript',
      formats: ['iife'],
      fileName: () => 'contentScript.js'
    },

    // Target modern Chrome
    target: 'es2020',

    // Use esbuild minifier (Vite default)
    minify: 'esbuild',

    rollupOptions: {
      output: {
        // No code splitting - Chrome extensions need single files
        inlineDynamicImports: true,
        // Ensure IIFE format with no external dependencies
        format: 'iife',
        // No hash in filename
        entryFileNames: 'contentScript.js'
      }
    },

    // Source maps for debugging
    sourcemap: true
  }
});
