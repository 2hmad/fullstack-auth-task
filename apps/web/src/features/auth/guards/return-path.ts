/**
 * The in-app path to return to after sign-in, taken from router state. Only same-site paths
 * are accepted ("/app", not "//evil.example" or "https://evil.example"): never an open redirect.
 */
export function safeReturnPath(state: unknown): string | null {
  const from = state && typeof state === 'object' ? (state as { from?: unknown }).from : undefined;
  if (
    typeof from !== 'string' ||
    !from.startsWith('/') ||
    from.startsWith('//') ||
    from.includes('\\')
  ) {
    return null;
  }
  return from;
}
