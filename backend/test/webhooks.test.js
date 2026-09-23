/**
 * Webhooks: never to a private address, and signed so the receiver can tell.
 */
import { describe, it, expect } from "vitest";
import { isPrivate, sign, checkUrl } from "../src/services/webhooks";

describe("webhooks", () => {
  it("refuses private, loopback and link-local addresses", () => {
    for (const ip of ["10.0.0.5", "127.0.0.1", "192.168.1.1", "172.16.4.2", "169.254.169.254", "100.64.0.1", "::1", "fd00::1"]) expect(isPrivate(ip)).toBe(true);
    for (const ip of ["8.8.8.8", "1.1.1.1", "203.0.113.9"]) expect(isPrivate(ip)).toBe(false);
  });

  it("takes https only, and no passwords in the address", async () => {
    await expect(checkUrl("http://example.com/hook")).rejects.toThrow(/https/);
    await expect(checkUrl("https://user:pw@example.com/hook")).rejects.toThrow(/passwords/);
    await expect(checkUrl("https://localhost/hook")).rejects.toThrow();
  });

  it("signs the time and the body together", () => {
    const a = sign("whsec_x", 1700000000, '{"a":1}');
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(sign("whsec_x", 1700000001, '{"a":1}')).not.toBe(a);
    expect(sign("whsec_y", 1700000000, '{"a":1}')).not.toBe(a);
  });
});
