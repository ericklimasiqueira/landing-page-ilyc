import { createClient } from "@supabase/supabase-js";
import { getAdminAccess } from "@/lib/server/admin-auth";
import { getAuthCallbackUrl } from "@/lib/server/auth-redirect";
import { isSameOriginRequest } from "@/lib/server/request-origin";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const noStore = { "Cache-Control": "no-store" };

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) return Response.json({ error: "Origem da requisição não autorizada." }, { status: 403, headers: noStore });
  const access = await getAdminAccess();
  if (!access.ok) return Response.json({ error: "Acesso não autorizado." }, { status: access.status, headers: noStore });
  if (access.role !== "admin") return Response.json({ error: "Somente administradores podem enviar redefinições de senha." }, { status: 403, headers: noStore });

  const body = await request.json().catch(() => null);
  const userId = typeof body?.userId === "string" ? body.userId : "";
  if (!/^[0-9a-f-]{36}$/i.test(userId)) return Response.json({ error: "Selecione um usuário válido." }, { status: 400, headers: noStore });

  try {
    const admin = createSupabaseAdminClient();
    const { data, error: lookupError } = await admin.auth.admin.getUserById(userId);
    if (lookupError || !data.user?.email) return Response.json({ error: "Não foi possível localizar o e-mail desse usuário." }, { status: 404, headers: noStore });

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if (!url || !publishableKey) return Response.json({ error: "Configure a conexão pública do Supabase no servidor." }, { status: 503, headers: noStore });
    const authClient = createClient(url, publishableKey, {
      auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    });
    const { error } = await authClient.auth.resetPasswordForEmail(data.user.email, {
      redirectTo: getAuthCallbackUrl(request),
    });
    if (error) return Response.json({ error: "Não foi possível enviar o e-mail. Confira o SMTP e os limites de envio do Supabase." }, { status: 502, headers: noStore });

    return Response.json({ sent: true }, { headers: noStore });
  } catch {
    return Response.json({ error: "Não foi possível preparar o link de redefinição. Confira a URL pública do ambiente." }, { status: 503, headers: noStore });
  }
}
