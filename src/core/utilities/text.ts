/**
 * Normalizes any line endings (CRLF, CR, or LF) to LF.
 *
 * Used when comparing local file content against the remote snapshot so that
 * line-ending differences alone do not make a service look "dirty".
 */
export function normalizeEol(source: string): string {
  return source.replace(/\r\n?/g, "\n");
}
