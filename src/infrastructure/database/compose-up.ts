import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";

/**
 * Picks a host port for the compose database that is actually free.
 *
 * The conventional 5432 is often taken by a local PostgreSQL, and failing with
 * `address already in use` tells the developer nothing about what to do. The
 * first free port at or after 5432 wins, so `pnpm docker:up` just works.
 */
export function findFreePort(preferred: number, limit = 50): Promise<number> {
  return new Promise((resolve, reject) => {
    let candidate = preferred;

    const tryNext = (): void => {
      if (candidate >= preferred + limit) {
        reject(
          new Error(
            `No free port found between ${preferred} and ${preferred + limit - 1}`,
          ),
        );
        return;
      }

      const probe = createServer();
      probe.unref();
      probe.once("error", () => {
        candidate += 1;
        tryNext();
      });
      probe.listen(candidate, "127.0.0.1", () => {
        probe.close(() => resolve(candidate));
      });
    };

    tryNext();
  });
}

async function main(): Promise<void> {
  const preferred = Number.parseInt(process.env.POSTGRES_HOST_PORT ?? "5432", 10);
  const port = await findFreePort(Number.isNaN(preferred) ? 5432 : preferred);

  if (port !== preferred) {
    console.log(`port ${preferred} is busy — using ${port} instead`);
    console.log(
      `set TEST_POSTGRES_URL=postgresql://postgres:postgres@127.0.0.1:${port}/pos_test`,
    );
  }

  const child = spawn("docker", ["compose", "up", "-d", "--wait", "db"], {
    stdio: "inherit",
    env: { ...process.env, POSTGRES_HOST_PORT: String(port) },
  });

  child.on("exit", (code) => {
    process.exit(code ?? 0);
  });
}

const isMain =
  process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1];

if (isMain) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}
