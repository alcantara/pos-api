import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import type { FastifyInstance } from "fastify";
import { fastifySwagger } from "@fastify/swagger";
import { fastifySwaggerUi } from "@fastify/swagger-ui";
import { parse } from "yaml";

/**
 * Serves the hand-maintained OpenAPI document (docs/openapi.yaml) as Swagger UI.
 *
 * The document is the same file that `pnpm test:spec` lints and that
 * `tests/docs/openapi.test.ts` checks against the registered routes, so the UI
 * cannot advertise an API that differs from the served one. It is read once at
 * startup: the contract does not change while the process runs.
 */

/** Path of the document, relative to the project root. */
export const SPEC_RELATIVE_PATH = join("docs", "openapi.yaml");

/**
 * Marker that identifies the project root while walking up. `package.json`
 * exists in the repository and in the published image root; the document sits
 * next to it in both layouts.
 */
const ROOT_MARKER = "package.json";

const MAX_WALK_DEPTH = 8;

/**
 * Walks up from `start` looking for the project root instead of hard-coding a
 * `../../../` chain. The compiled layout (dist/interfaces/http/docs.js) and the
 * source layout (src/interfaces/http/docs.ts) sit at different depths, and a
 * relative guess silently breaks when a file moves — walking up is correct for
 * every layout and needs no bundler alias to work at runtime.
 */
function findProjectRoot(start: string): string | null {
  let current = resolve(start);

  for (let depth = 0; depth <= MAX_WALK_DEPTH; depth += 1) {
    if (existsSync(join(current, ROOT_MARKER))) return current;

    const parent = dirname(current);
    // Reached the filesystem root without finding the marker.
    if (parent === current) return null;
    current = parent;
  }

  return null;
}

export function locateSpecFile(specPath?: string): string | null {
  if (specPath) {
    // Explicit override: lets a container point at a mounted contract without
    // reproducing the repository layout.
    return existsSync(specPath) ? specPath : null;
  }

  const root = findProjectRoot(import.meta.dirname);
  if (!root) return null;

  const candidate = join(root, SPEC_RELATIVE_PATH);
  return existsSync(candidate) ? candidate : null;
}

export function loadOpenApiDocument(specPath?: string): Record<string, unknown> | null {
  const path = locateSpecFile(specPath);
  if (!path) return null;

  return parse(readFileSync(path, "utf8")) as Record<string, unknown>;
}

export interface DocsOptions {
  /** Route prefix; defaults to `/docs`. */
  routePrefix?: string;
  /**
   * Absolute path of the document. Defaults to `<project root>/docs/openapi.yaml`.
   */
  specPath?: string;
}

/**
 * Registers Swagger UI plus the raw contract (`<prefix>/json`, `<prefix>/yaml`).
 * Returns false, without throwing, when the document is missing — an image
 * built without `docs/` must still boot.
 */
export async function registerDocs(
  app: FastifyInstance,
  options: DocsOptions = {},
): Promise<boolean> {
  const document = loadOpenApiDocument(options.specPath);
  if (!document) {
    app.log.warn(`${SPEC_RELATIVE_PATH} not found — /docs will not be served`);
    return false;
  }

  const routePrefix = options.routePrefix ?? "/docs";

  // The plugin types describe OpenAPI 3.0 while our document is 3.1, so the
  // options are cast once, here. The document itself is parsed YAML, linted by
  // `pnpm test:spec` and asserted against the routes by the docs suite.
  await app.register(fastifySwagger, {
    mode: "static",
    specification: { document },
  } as unknown as NonNullable<Parameters<typeof fastifySwagger>[1]>);

  await app.register(fastifySwaggerUi, {
    routePrefix,
    uiConfig: {
      // Explicit absolute route rather than the plugin's default `./json`
      // relative resolution: it survives being mounted behind a sub-path and
      // makes the contract's location greppable in the UI.
      url: `${routePrefix}/json`,
      // Static assets ship inside the plugin: no CDN, so it works offline and
      // behind a restrictive egress policy.
      docExpansion: "list",
      deepLinking: true,
      displayRequestDuration: true,
      tryItOutEnabled: true,
      persistAuthorization: true,
    },
  });

  app.log.info({ routePrefix, spec: `${routePrefix}/json` }, "OpenAPI docs available");
  return true;
}
