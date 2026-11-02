import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export type AdminEmailAction = "invite" | "password_reset";
export type AdminEmailOutcome = "attempted" | "sent" | "failed" | "rate_limited" | "role_assignment_failed";

export async function recordAdminEmailAction(
  admin: SupabaseClient,
  event: {
    adminUserId: string;
    targetUserId?: string | null;
    action: AdminEmailAction;
    outcome: AdminEmailOutcome;
  },
) {
  const { error } = await admin.from("admin_email_action_audit").insert({
    admin_user_id: event.adminUserId,
    target_user_id: event.targetUserId ?? null,
    action: event.action,
    outcome: event.outcome,
  });

  return !error;
}

export async function consumeAdminEmailRateLimit(
  admin: SupabaseClient,
  adminUserId: string,
  action: AdminEmailAction,
) {
  const { data, error } = await admin.rpc("consume_admin_email_rate_limit", {
    p_admin_user_id: adminUserId,
    p_action: action,
  });

  if (error || !data) return null;

  const result = Array.isArray(data) ? data[0] : data;
  if (
    !result ||
    typeof result.allowed !== "boolean" ||
    typeof result.retry_after_seconds !== "number"
  ) {
    return null;
  }

  return {
    allowed: result.allowed,
    retryAfterSeconds: Math.max(0, Math.ceil(result.retry_after_seconds)),
  };
}
