import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

// Landing page: reaproveita os componentes e o tema do app (src/).
export default defineConfig({
  root: import.meta.dirname,
  base: "./",
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, "../src") },
  },
  build: { outDir: "../dist-site", emptyOutDir: true },
});
