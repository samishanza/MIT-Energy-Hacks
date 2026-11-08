import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// The capture listener is the only thing a tunnel can reach, and it serves this folder.
// A separate build keeps engineer screens and routes out of what it serves.
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist-capture",
    emptyOutDir: true,
    rollupOptions: { input: ["capture.html", "portal.html"] },
  },
});
