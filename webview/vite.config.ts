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
      input: {
        "result-panel": resolve(__dirname, "ResultPanel/main.tsx"),
        sidebar: resolve(__dirname, "Sidebar/main.tsx"),
      },
      output: {
        entryFileNames: "[name].js",
        assetFileNames: "[name][extname]",
      },
    },
  },
});
