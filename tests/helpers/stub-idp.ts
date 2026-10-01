import { randomUUID } from "node:crypto";
import { createServer, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { exportJWK, generateKeyPair, SignJWT } from "jose";

export interface StubIdP {
  /** Issuer/base URL, e.g. `http://127.0.0.1:41234`. */
  baseUrl: string;
  /** Mutable claims written into the next issued ID token. */
  token: { nonce: string; email: string; name: string | null };
  /** Form parameters of the last token-endpoint call made by the app. */
  lastTokenRequest: Record<string, string>;
  close(): Promise<void>;
}

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  response.writeHead(status, {
    "content-type": "application/json",
    "content-length": Buffer.byteLength(payload),
  });
  response.end(payload);
}

/**
 * Minimal in-process OIDC provider for tests: discovery, JWKS and a token
 * endpoint that issues RS256 ID tokens. No network access required — it
 * listens on an ephemeral loopback port.
 */
export async function startStubIdp(clientId: string): Promise<StubIdP> {
  const { publicKey, privateKey } = await generateKeyPair("RS256", {
    extractable: true,
  });
  const jwk = {
    ...(await exportJWK(publicKey)),
    kid: "stub-key",
    alg: "RS256",
    use: "sig",
  };

  let baseUrl = "";
  const token = { nonce: "", email: "ada@example.com", name: "Ada Lovelace" };
  let lastTokenRequest: Record<string, string> = {};

  const server = createServer((request, response) => {
    const path = (request.url ?? "").split("?")[0];

    if (path === "/.well-known/openid-configuration") {
      sendJson(response, 200, {
        issuer: baseUrl,
        authorization_endpoint: `${baseUrl}/authorize`,
        token_endpoint: `${baseUrl}/token`,
        jwks_uri: `${baseUrl}/jwks`,
      });
      return;
    }

    if (path === "/jwks") {
      sendJson(response, 200, { keys: [jwk] });
      return;
    }

    if (path === "/token" && request.method === "POST") {
      const chunks: Buffer[] = [];
      request.on("data", (chunk: Buffer) => chunks.push(chunk));
      request.on("end", () => {
        void (async () => {
          lastTokenRequest = Object.fromEntries(
            new URLSearchParams(Buffer.concat(chunks).toString("utf8")),
          );
          if (
            lastTokenRequest.code !== "valid-code" ||
            lastTokenRequest.client_id !== clientId
          ) {
            sendJson(response, 400, { error: "invalid_grant" });
            return;
          }

          const idToken = await new SignJWT({
            nonce: token.nonce,
            email: token.email,
            ...(token.name ? { name: token.name } : {}),
          })
            .setProtectedHeader({ alg: "RS256", kid: "stub-key" })
            .setIssuer(baseUrl)
            .setAudience(clientId)
            .setSubject(randomUUID())
            .setIssuedAt()
            .setExpirationTime("5m")
            .sign(privateKey);

          sendJson(response, 200, {
            access_token: "stub-access-token",
            token_type: "Bearer",
            id_token: idToken,
          });
        })().catch(() => {
          sendJson(response, 500, { error: "server_error" });
        });
      });
      return;
    }

    sendJson(response, 404, { error: "not_found" });
  });

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${address.port}`;

  return {
    baseUrl,
    token,
    get lastTokenRequest() {
      return lastTokenRequest;
    },
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}
