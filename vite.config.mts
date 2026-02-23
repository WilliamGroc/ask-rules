import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [sveltekit()],
  ssr: {
    // Ces packages CJS ne sont pas bundlés : Node.js les charge directement.
    external: ['natural', 'pg', 'pdf-parse'],
  },
});
