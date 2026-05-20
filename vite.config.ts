import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

// Electron loads renderer HTML via the file:// scheme. The default Vite output
// adds `crossorigin` attributes to `<script>` and `<link>` tags, which makes
// the browser do a CORS check — file:// URLs always fail that check and the
// resources never load. Strip the attribute from the emitted HTML.
function stripCrossorigin(): Plugin {
  return {
    name: 'strip-crossorigin',
    transformIndexHtml(html) {
      return html.replace(/\s+crossorigin(="[^"]*")?/g, '');
    },
  };
}

export default defineConfig({
  root: resolve(__dirname, 'src/renderer'),
  base: './',
  plugins: [react(), stripCrossorigin()],
  build: {
    outDir: resolve(__dirname, 'dist-electron/renderer'),
    emptyOutDir: true,
    target: 'chrome120',
    rollupOptions: {
      input: {
        history: resolve(__dirname, 'src/renderer/history/index.html'),
        preview: resolve(__dirname, 'src/renderer/preview/index.html'),
        settings: resolve(__dirname, 'src/renderer/settings/index.html'),
      },
    },
  },
});
