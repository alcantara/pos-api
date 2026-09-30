/**
 * Escapes LIKE/ILIKE wildcards so user search input matches literally.
 * The pattern must be used with `escape '\'` in the SQL statement.
 */
export function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

/**
 * Builds a "contains" pattern: input wildcards are escaped first, then the
 * surrounding `%` are added as intentional wildcards, so `search=50%` matches
 * rows containing the literal text `50%` while `search=abc` matches any row
 * containing `abc`.
 */
export function containsPattern(value: string): string {
  return `%${escapeLikePattern(value)}%`;
}
