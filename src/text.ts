export function normalizeEol(source: string): string {
  return source.replace(/\r\n?/g, "\n");
}
