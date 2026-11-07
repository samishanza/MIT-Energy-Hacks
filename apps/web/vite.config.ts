import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// The engineer API has no login, so it stays on loopback behind this proxy.
export default defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    proxy: {
      "/api": "http://127.0.0.1:8787",
      "^/capture/": "http://127.0.0.1:8788",
    },
  },
});
