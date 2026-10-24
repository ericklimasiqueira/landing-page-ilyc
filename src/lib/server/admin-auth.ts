import "server-only";
import { cookies } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type AdminRole = "admin" | "editor";

export type AdminAccessResult =
  | { ok: true; userId: string; sessionId: string; role: AdminRole }
  | { ok: false; status: 401 | 403 | 503; reason: "unauthenticated" | "forbidden" | "not-configured" };

function isAdminRole(value: unknown): value is AdminRole {
  return value === "admin" || value === "editor";
}

/**
 * Verifies the current user with Supabase Auth on every privileged request.
 * The fresh user record is authoritative for app_metadata.role; a JWT can keep
 * an old role claim after an administrator changes permissions.
 */
export async function getAdminAccess(): Promise<AdminAccessResult> {
  // Keep authorization request-bound even when the project keys are not configured yet.
  await cookies();

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) {
    return { ok: false, status: 503, reason: "not-configured" };
  }

  const supabase = await createSupabaseServerClient();
  const [{ data: userData, error: userError }, { data: claimsData }] = await Promise.all([
    supabase.auth.getUser(),
    supabase.auth.getClaims(),
  ]);
  const user = userData.user;

  if (userError || !user) {
    return { ok: false, status: 401, reason: "unauthenticated" };
  }

  const role = user.app_metadata?.role;

  if (!isAdminRole(role)) {
    return { ok: false, status: 403, reason: "forbidden" };
  }

  const claims = claimsData?.claims;
  const sessionId = claims?.sub === user.id && typeof claims.session_id === "string"
    ? claims.session_id
    : user.id;
  return { ok: true, userId: user.id, sessionId, role };
}
