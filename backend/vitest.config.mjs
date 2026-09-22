import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // The schema goes on once, before any file runs. See test/global-setup.js
    // for why applying it per file deadlocked.
    globalSetup: ["./test/global-setup.js"],
    hookTimeout: 60_000,
    // The security suite boots the server; it runs on its own (npm run test:security).
    exclude: [...configDefaults.exclude, "security/**"],
  },
});
