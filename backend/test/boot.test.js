import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import express from "express";

// The routes are CommonJS, and the point of this test is to load them exactly
// as the server does.
const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));

/**
 * Does the server actually start?
 *
 * It did not, once. A route file imported the auth middleware as the whole
 * module instead of destructuring it, so Express 5 got an object where a
 * middleware belongs, decided it must be a path, and threw while parsing
 * "[object Object]" as a route pattern. Nothing caught it: the file parsed,
 * lint was clean, the frontend built, and the failure only appeared when the
 * deployed process tried to boot — which meant the site was down rather than
 * merely missing a feature.
 *
 * This mounts every router the same way the server does. It needs no database:
 * the mistakes it catches are made before a query is ever run.
 */

const ROUTES = path.join(here, "..", "src", "routes");

process.env.DATABASE_URL ||= "postgres://unused:unused@127.0.0.1:5432/unused";
process.env.JWT_SECRET ||= "boot-test-secret-long-enough-to-pass-validation";

describe("every router mounts", () => {
  const files = fs
    .readdirSync(ROUTES)
    .filter((name) => name.endsWith(".js"))
    .sort();

  it("has routers to check", () => {
    expect(files.length).toBeGreaterThan(5);
  });

  for (const file of files) {
    it(file, () => {
      const router = require(path.join(ROUTES, file));
      expect(typeof router, `${file} must export a router`).toBe("function");

      // The real thing: Express resolves paths and middleware at mount time,
      // which is where an object passed as a middleware turns into a crash.
      const app = express();
      expect(() => app.use(`/api/${file.replace(/\.js$/, "")}`, router)).not.toThrow();
    });
  }
});
