import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "prompt",
      injectRegister: "auto",
      manifest: {
        name: "코디메이트",
        short_name: "코디메이트",
        theme_color: "#155e59",
        background_color: "#f7f7f0",
        display: "standalone",
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,ttf,svg}"],
        maximumFileSizeToCacheInBytes: 15000000,
        navigateFallbackDenylist: [/^\/api/],
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  server: { proxy: { "/api": "http://127.0.0.1:8787" } },
  build: {
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks: {
          excel: ["exceljs"],
          pdf: ["pdf-lib", "@pdf-lib/fontkit"],
        },
      },
    },
  },
});
