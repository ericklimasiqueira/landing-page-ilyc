import "server-only";

/** Resolve the app origin by deployment environment without hardcoding localhost. */
export function getAuthCallbackUrl(request: Request) {
  const configuredUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  let origin: string;

  if (configuredUrl) {
    const configured = new URL(configuredUrl);
    if (process.env.NODE_ENV === "production" && configured.protocol !== "https:") {
      throw new Error("NEXT_PUBLIC_SITE_URL deve usar HTTPS em produção.");
    }
    origin = configured.origin;
  } else if (process.env.NODE_ENV !== "production") {
    origin = new URL(request.url).origin;
  } else if (process.env.VERCEL_URL) {
    origin = `https://${process.env.VERCEL_URL}`;
  } else {
    throw new Error("Configure NEXT_PUBLIC_SITE_URL para autenticação em produção.");
  }

  const callback = new URL("/auth/confirm", origin);
  callback.searchParams.set("next", "/admin/definir-senha");
  return callback.toString();
}
