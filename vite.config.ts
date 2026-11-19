import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";
import { TanStackRouterVite } from "@tanstack/router-plugin/vite";

export default defineConfig({
  plugins: [
    TanStackRouterVite({
      autoCodeSplitting: true,
    }),
    react(),
    tailwindcss(),
    tsConfigPaths(),
  ],
  server: {
    proxy: {
      // Same-origin API so Sanctum's session cookie needs no CORS setup.
      // `changeOrigin` stays false: Laravel reads the Host to match
      // SANCTUM_STATEFUL_DOMAINS, and 127.0.0.1:5173 is the listed one.
      "/api": "http://127.0.0.1:8000",
      "/sanctum": "http://127.0.0.1:8000",
    },
  },
});
