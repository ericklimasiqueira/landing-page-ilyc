import { getAdminAccess } from "@/lib/server/admin-auth";
import { getAuthCallbackUrl } from "@/lib/server/auth-redirect";
import { isSameOriginRequest } from "@/lib/server/request-origin";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const noStore = { "Cache-Control": "no-store" };
type AppRole = "admin" | "editor";

async function requireAdmin(request?: Request) {
  if (request && !isSameOriginRequest(request)) return { response: Response.json({ error: "Origem da requisição não autorizada." }, { status: 403, headers: noStore }) };
  const access = await getAdminAccess();
  if (!access.ok) return { response: Response.json({ error: "Acesso não autorizado." }, { status: access.status, headers: noStore }) };
  if (access.role !== "admin") return { response: Response.json({ error: "Somente administradores podem gerenciar usuários." }, { status: 403, headers: noStore }) };
  return { userId: access.userId };
}

function serializeUser(user: {
  id: string;
  email?: string;
  app_metadata?: Record<string, unknown>;
  email_confirmed_at?: string;
  created_at: string;
  last_sign_in_at?: string;
}) {
  const role = user.app_metadata?.role;
  return {
    id: user.id,
    email: user.email ?? null,
    role: role === "admin" || role === "editor" ? role : null,
    confirmed: Boolean(user.email_confirmed_at),
    createdAt: user.created_at,
    lastSignInAt: user.last_sign_in_at ?? null,
  };
}

function isAppRole(value: unknown): value is AppRole {
  return value === "admin" || value === "editor";
}

export async function GET() {
  const authorization = await requireAdmin();
  if ("response" in authorization) return authorization.response;

  try {
    const admin = createSupabaseAdminClient();
    const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 100 });
    if (error) return Response.json({ error: "Não foi possível carregar os usuários." }, { status: 502, headers: noStore });

    return Response.json({ users: data.users.map(serializeUser) }, { headers: noStore });
  } catch {
    return Response.json({ error: "Configure a chave secreta do Supabase no servidor." }, { status: 503, headers: noStore });
  }
}

export async function POST(request: Request) {
  const authorization = await requireAdmin(request);
  if ("response" in authorization) return authorization.response;

  const body = await request.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const role = body?.role;
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !isAppRole(role)) {
    return Response.json({ error: "Informe um e-mail válido e uma permissão permitida." }, { status: 400, headers: noStore });
  }

  try {
    const admin = createSupabaseAdminClient();
    const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo: getAuthCallbackUrl(request),
    });

    if (error || !data.user) {
      const status = error?.code === "email_exists" || error?.code === "user_already_exists" ? 409 : 502;
      return Response.json({ error: status === 409 ? "Esse e-mail já tem uma conta." : "Não foi possível enviar o convite. Confira a configuração de e-mail do Supabase." }, { status, headers: noStore });
    }

    const { data: updated, error: roleError } = await admin.auth.admin.updateUserById(data.user.id, {
      app_metadata: { ...data.user.app_metadata, role },
    });

    if (roleError || !updated.user) {
      return Response.json({ error: "O convite foi criado, mas não foi possível aplicar a permissão. Peça a um administrador para revisar essa conta." }, { status: 502, headers: noStore });
    }

    return Response.json({ user: serializeUser(updated.user) }, { status: 201, headers: noStore });
  } catch {
    return Response.json({ error: "Não foi possível preparar o convite. Confira as chaves do Supabase, a URL pública e as URLs de redirecionamento permitidas." }, { status: 503, headers: noStore });
  }
}

export async function PATCH(request: Request) {
  const authorization = await requireAdmin(request);
  if ("response" in authorization) return authorization.response;

  const body = await request.json().catch(() => null);
  const userId = typeof body?.userId === "string" ? body.userId : "";
  const role = body?.role;
  if (!userId || !isAppRole(role)) {
    return Response.json({ error: "Informe um usuário e uma permissão válidos." }, { status: 400, headers: noStore });
  }
  if (userId === authorization.userId) {
    return Response.json({ error: "Você não pode alterar a própria permissão por esta tela." }, { status: 409, headers: noStore });
  }

  try {
    const admin = createSupabaseAdminClient();
    const { data: current, error: lookupError } = await admin.auth.admin.getUserById(userId);
    if (lookupError || !current.user) return Response.json({ error: "Usuário não encontrado." }, { status: 404, headers: noStore });

    if (current.user.app_metadata?.role === "admin" && role !== "admin") {
      const { data: users, error: listError } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      if (listError) return Response.json({ error: "Não foi possível validar os administradores atuais." }, { status: 502, headers: noStore });
      const admins = users.users.filter((user) => user.app_metadata?.role === "admin");
      if (admins.length <= 1) return Response.json({ error: "Mantenha ao menos um administrador ativo." }, { status: 409, headers: noStore });
    }

    const { data, error } = await admin.auth.admin.updateUserById(userId, {
      app_metadata: { ...current.user.app_metadata, role },
    });
    if (error || !data.user) return Response.json({ error: "Não foi possível atualizar a permissão." }, { status: 502, headers: noStore });

    return Response.json({ user: serializeUser(data.user) }, { headers: noStore });
  } catch {
    return Response.json({ error: "Configure a chave secreta do Supabase no servidor." }, { status: 503, headers: noStore });
  }
}

export async function DELETE(request: Request) {
  const authorization = await requireAdmin(request);
  if ("response" in authorization) return authorization.response;

  const body = await request.json().catch(() => null);
  const userId = typeof body?.userId === "string" ? body.userId : "";
  if (!/^[0-9a-f-]{36}$/i.test(userId)) {
    return Response.json({ error: "Selecione um usuário válido." }, { status: 400, headers: noStore });
  }
  if (userId === authorization.userId) {
    return Response.json({ error: "Você não pode excluir a própria conta por esta tela." }, { status: 409, headers: noStore });
  }

  try {
    const admin = createSupabaseAdminClient();
    const { data: target, error: lookupError } = await admin.auth.admin.getUserById(userId);
    if (lookupError || !target.user) return Response.json({ error: "Usuário não encontrado." }, { status: 404, headers: noStore });

    if (target.user.app_metadata?.role === "admin") {
      const { data: users, error: listError } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      if (listError) return Response.json({ error: "Não foi possível validar os administradores atuais." }, { status: 502, headers: noStore });
      const admins = users.users.filter((user) => user.app_metadata?.role === "admin");
      if (admins.length <= 1) return Response.json({ error: "Mantenha ao menos um administrador ativo." }, { status: 409, headers: noStore });
    }

    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error) return Response.json({ error: "Não foi possível excluir o usuário." }, { status: 502, headers: noStore });
    return Response.json({ deleted: true, userId }, { headers: noStore });
  } catch {
    return Response.json({ error: "Configure a chave secreta do Supabase no servidor." }, { status: 503, headers: noStore });
  }
}
