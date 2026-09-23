// webview/vite.config.ts
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: __dirname,
  plugins: [react()],
  build: {
    outDir: resolve(__dirname, "../dist/webview"),
    emptyOutDir: true,
    rollupOptions: {
      input: resolve(__dirname, "main.tsx"),
      output: {
        entryFileNames: "main.js",
        assetFileNames: "main[extname]",
      },
    },
  },
});
