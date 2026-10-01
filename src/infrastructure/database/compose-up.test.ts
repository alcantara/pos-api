import { createServer } from "node:net";
import { describe, expect, it } from "vitest";
import { findFreePort } from "./compose-up.js";

function listen(port: number): Promise<() => Promise<void>> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => {
      resolve(
        () =>
          new Promise<void>((done) => {
            server.close(() => done());
          }),
      );
    });
  });
}

describe("findFreePort", () => {
  it("returns the preferred port when it is free", async () => {
    const port = await findFreePort(54_320);

    expect(port).toBe(54_320);
  });

  it("skips occupied ports", async () => {
    const release = await listen(54_321);

    try {
      const port = await findFreePort(54_321);

      expect(port).toBeGreaterThan(54_321);
    } finally {
      await release();
    }
  });

  it("finds the next free port after a run of busy ones", async () => {
    const base = 54_330;
    const releases: Array<() => Promise<void>> = [];
    const ports = [base, base + 1, base + 2];

    try {
      for (const port of ports) {
        releases.push(await listen(port));
      }

      expect(await findFreePort(base)).toBe(base + ports.length);
    } finally {
      for (const release of releases) {
        await release();
      }
    }
  });

  it("gives up with an actionable message when the range is exhausted", async () => {
    const base = 54_340;
    const release = await listen(base);

    try {
      await expect(findFreePort(base, 1)).rejects.toThrow(/No free port found/);
    } finally {
      await release();
    }
  });
});
