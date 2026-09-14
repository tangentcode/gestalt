import { defineConfig } from 'vite'
import { resolve } from 'node:path'

export default defineConfig({
  resolve: {
    // Platform sources import .mjs for .mts companions
    extensions: ['.mts', '.ts', '.mjs', '.js', '.json'],
  },
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'Gestalt',
      formats: ['es'],
      fileName: () => 'gestalt.js',
    },
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
    minify: false,
    target: 'esnext',
    rollupOptions: {
      output: {
        // Keep single ESM bundle for the player
        inlineDynamicImports: true,
      },
    },
  },
  server: {
    open: '/demos/smoke.html',
  },
})
