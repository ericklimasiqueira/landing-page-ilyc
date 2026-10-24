import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { AdminHeader } from "@/components/admin/admin-header";
import { UserManager, type ManagedUser } from "@/components/admin/user-manager";
import { getAdminAccess } from "@/lib/server/admin-auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const instant = false;

export default async function AdminUsersPage() {
  await connection();
  const access = await getAdminAccess();
  if (!access.ok && access.status !== 403) redirect("/admin/login");
  if (!access.ok || access.role !== "admin") {
    return (
      <main className="admin-page">
        <section className="admin-card">
          <p className="eyebrow">Área restrita</p>
          <h1>Acesso exclusivo para administradores.</h1>
          <p>Sua conta pode editar conteúdo, mas não gerenciar acessos de outras pessoas.</p>
          <Link className="button button-cream" href="/admin">Voltar ao painel</Link>
        </section>
      </main>
    );
  }

  let users: ManagedUser[] = [];
  let loadError = "";
  try {
    const admin = createSupabaseAdminClient();
    const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 100 });
    if (error) loadError = "Não foi possível carregar os usuários do Supabase Auth.";
    else {
      users = data.users.map((user) => {
        const role = user.app_metadata?.role;
        return {
          id: user.id,
          email: user.email ?? null,
          role: role === "admin" || role === "editor" ? role : null,
          confirmed: Boolean(user.email_confirmed_at),
          createdAt: user.created_at,
          lastSignInAt: user.last_sign_in_at ?? null,
        };
      });
    }
  } catch {
    loadError = "Configure a chave secreta do Supabase no ambiente local do servidor.";
  }

  return (
    <main className="admin-page">
      <AdminHeader role={access.role} active="users" />
      <div className="admin-content">
        <div className="admin-page-intro">
          <p className="eyebrow"><span className="brand-dot" /> Equipe Ilyc</p>
          <h1>Quem cuida do portal.</h1>
          <p>Convide pessoas e controle o que cada uma pode fazer na landing page.</p>
        </div>
        {loadError ? <div className="admin-inline-error" role="alert">{loadError}</div> : <UserManager initialUsers={users} />}
      </div>
    </main>
  );
}
