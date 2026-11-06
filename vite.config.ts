import { defineConfig } from 'vite';

export default defineConfig({
  base: '/Skyfall-Royale/',
  build: {
    target: 'es2022',
    // The compatibility physics module includes its WebAssembly payload.
    chunkSizeWarningLimit: 2500,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('@dimforge/rapier3d-compat')) return 'physics';
          if (id.includes('/node_modules/three/')) return 'three';
        },
      },
    },
  },
});
