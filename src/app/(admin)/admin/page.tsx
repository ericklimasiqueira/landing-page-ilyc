import { redirect } from "next/navigation";
import { connection } from "next/server";
import { AdminHeader } from "@/components/admin/admin-header";
import { AdminContentLoader } from "@/components/admin/admin-content-loader";
import { getAdminAccess } from "@/lib/server/admin-auth";

export const instant = false;

export default async function AdminPage() {
  await connection();
  const access = await getAdminAccess();
  if (!access.ok && access.status !== 403) redirect("/admin/login");
  if (!access.ok) redirect("/admin/login?error=forbidden");

  return (
    <main className="admin-page">
      <AdminHeader role={access.role} active="content" />
      <div className="admin-content admin-editor-content">
        <section className="admin-page-intro admin-editor-intro">
          <p className="eyebrow"><span className="brand-dot" /> Portal de edição</p>
          <h1>Controle a landing page.</h1>
          <p>Edite textos, fotos, ensaios e etapas em um só lugar. Salve cada seção para atualizar a landing page.</p>
        </section>
        <AdminContentLoader userId={access.userId} sessionId={access.sessionId} />
      </div>
    </main>
  );
}
