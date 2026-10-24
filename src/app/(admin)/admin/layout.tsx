import { Suspense, type ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { getAdminAccess } from "@/lib/server/admin-auth";

export const instant = false;

export default function ProtectedAdminLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <Suspense fallback={<main className="admin-page" aria-busy="true"><p className="admin-loading">Verificando acesso…</p></main>}>
      <AdminAccessGate>{children}</AdminAccessGate>
    </Suspense>
  );
}

async function AdminAccessGate({ children }: Readonly<{ children: ReactNode }>) {
  await connection();
  const access = await getAdminAccess();

  if (!access.ok && access.status !== 403) {
    redirect("/admin/login");
  }

  if (!access.ok) {
    return (
      <main className="admin-page">
        <section className="admin-card" aria-labelledby="admin-access-title">
          <p className="eyebrow"><span className="brand-dot" /> Portal Ilyc</p>
          <h1 id="admin-access-title">Acesso não autorizado</h1>
          <p>Sua conta está autenticada, mas não tem a permissão necessária para acessar esta área.</p>
          <Link className="button button-cream" href="/">Voltar para a landing page</Link>
        </section>
      </main>
    );
  }

  return <>{children}</>;
}
