export function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

export function containsPattern(value: string): string {
  return `%${escapeLikePattern(value)}%`;
}
