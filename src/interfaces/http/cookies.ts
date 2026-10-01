export const SESSION_COOKIE = "pos_session";
export const PENDING_LOGIN_COOKIE = "pos_oauth";

export interface CookieOptions {
  path: string;
  maxAge?: number;
  secure: boolean;
}

/**
 * Serializes an HttpOnly, SameSite=Lax cookie. Our cookie values are
 * base64url (`A-Z a-z 0-9 - _ .`), so no attribute escaping is needed.
 */
export function serializeCookie(
  name: string,
  value: string,
  options: CookieOptions,
): string {
  const parts = [`${name}=${value}`, `Path=${options.path}`];
  if (options.maxAge !== undefined) {
    parts.push(`Max-Age=${Math.floor(options.maxAge)}`);
  }
  parts.push("HttpOnly");
  if (options.secure) parts.push("Secure");
  parts.push("SameSite=Lax");
  return parts.join("; ");
}

/** Expired cookie that makes browsers drop `name` on the given path. */
export function clearCookie(name: string, options: CookieOptions): string {
  return serializeCookie(name, "", { ...options, maxAge: 0 });
}

/** Parses a request `cookie` header; first occurrence of a name wins. */
export function parseCookies(header: string | undefined): Record<string, string> {
  const cookies: Record<string, string> = {};
  if (!header) return cookies;

  for (const pair of header.split(";")) {
    const separator = pair.indexOf("=");
    if (separator <= 0) continue;
    const name = pair.slice(0, separator).trim();
    if (!(name in cookies)) {
      cookies[name] = pair.slice(separator + 1).trim();
    }
  }
  return cookies;
}
