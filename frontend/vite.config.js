import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),

    /**
     * The app has to open with no signal.
     *
     * Holding a bill on the phone is only half the promise. The other half is
     * that somebody standing on a site with no bars can open the app at all —
     * and without this, closing the tab means the next attempt is the
     * browser's "no internet" page, with the paper still in their hand.
     *
     * The shell is cached; the API is not. Money is never served from a
     * cache: a figure that is quietly three days old is worse than no figure,
     * because nobody can tell which they are looking at. Requests to /api
     * fail honestly when there is no signal, and the screens already say so.
     */
    VitePWA({
      // The app decides when to take an update, in lib/updates.js: it is
      // applied while the phone is in a pocket rather than while somebody is
      // halfway through typing a bill.
      registerType: "prompt",
      injectRegister: null,
      includeAssets: ["favicon.svg", "icons.svg", "push-sw.js"],
      manifest: {
        name: "Sentryfi",
        short_name: "Sentryfi",
        description: "Your books, kept as the paper arrives.",
        start_url: "/",
        scope: "/",
        display: "standalone",
        background_color: "#F4F5F6",
        theme_color: "#F4F5F6",
        icons: [
          { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
          {
            src: "/icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        // Every navigation falls back to the shell, so a deep link opened with
        // no signal lands in the app rather than on an error page.
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/api\//],
        globPatterns: ["**/*.{js,css,html,svg,woff2}"],
        // Never cache the books.
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith("/api/"),
            handler: "NetworkOnly",
          },
        ],
        cleanupOutdatedCaches: true,
        // Push and taps on notifications: public/push-sw.js.
        importScripts: ["push-sw.js"],
      },
      devOptions: { enabled: false },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(here, "./src"),
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:8000",
        changeOrigin: true,
      },
    },
  },
});
