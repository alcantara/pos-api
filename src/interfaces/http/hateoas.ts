export const API_PREFIX = "/api/v1";

export interface Link {
  href: string;
  method?: "GET" | "POST" | "PATCH" | "DELETE";
}

export type Links = Record<string, Link>;

export function authLinks(): Links {
  return {
    self: { href: `${API_PREFIX}/auth/me` },
    login: { href: `${API_PREFIX}/auth/login` },
    logout: { href: `${API_PREFIX}/auth/logout`, method: "POST" },
  };
}

export function customerLinks(id: string): Links {
  const href = `${API_PREFIX}/customers/${id}`;
  return {
    self: { href },
    update: { href, method: "PATCH" },
    delete: { href, method: "DELETE" },
  };
}

export function categoryLinks(id: string): Links {
  const href = `${API_PREFIX}/categories/${id}`;
  return {
    self: { href },
    update: { href, method: "PATCH" },
    delete: { href, method: "DELETE" },
  };
}

export function productLinks(id: string): Links {
  const href = `${API_PREFIX}/products/${id}`;
  return {
    self: { href },
    update: { href, method: "PATCH" },
    delete: { href, method: "DELETE" },
  };
}

/** Rewrites the `page` query parameter of the current request URL. */
export function withPage(url: string, page: number): string {
  const parsed = new URL(url, "http://placeholder.invalid");
  parsed.searchParams.set("page", String(page));
  return `${parsed.pathname}${parsed.search}`;
}
