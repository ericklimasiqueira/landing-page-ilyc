import { Suspense } from "react";
import Link from "next/link";
import { LoginForm } from "@/components/admin/login-form";

export default function AdminLoginPage() {
  return (
    <main className="admin-page">
      <header className="admin-header">
        <Link className="wordmark" href="/"><span className="brand-dot" /> Ilyc</Link>
        <span className="admin-label">Acesso restrito</span>
      </header>
      <section className="admin-card">
        <p className="eyebrow"><span className="brand-dot" /> Área administrativa</p>
        <h1>Entrar no painel.</h1>
        <p>Use a conta autorizada para editar os conteúdos da landing page.</p>
        <Suspense fallback={<p className="login-message">Carregando acesso…</p>}>
          <LoginForm />
        </Suspense>
      </section>
    </main>
  );
}
