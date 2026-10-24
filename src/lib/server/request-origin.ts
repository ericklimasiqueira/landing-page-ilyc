/** Validate browser write requests against the app origin and its configured canonical URL. */
export function isSameOriginRequest(request: Request) {
  const source = request.headers.get("origin") ?? request.headers.get("referer");
  if (!source || source === "null") return false;

  try {
    const sourceUrl = new URL(source);
    const expectedOrigins = new Set<string>([new URL(request.url).origin]);
    if (process.env.NEXT_PUBLIC_SITE_URL) expectedOrigins.add(new URL(process.env.NEXT_PUBLIC_SITE_URL).origin);

    if (expectedOrigins.has(sourceUrl.origin)) return true;

    // Browsers can reach the same local Next server through either loopback hostname.
    const localHosts = new Set(["localhost", "127.0.0.1", "[::1]"]);
    for (const expectedOrigin of expectedOrigins) {
      const expectedUrl = new URL(expectedOrigin);
      if (sourceUrl.protocol === expectedUrl.protocol && sourceUrl.port === expectedUrl.port && localHosts.has(sourceUrl.hostname) && localHosts.has(expectedUrl.hostname)) return true;
    }
    return false;
  } catch {
    return false;
  }
}
