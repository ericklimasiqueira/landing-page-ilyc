import Link from "next/link";
import { PasswordSetupForm } from "@/components/admin/password-setup-form";

export default function SetPasswordPage() {
  return (
    <main className="admin-page">
      <header className="admin-header">
        <Link className="wordmark" href="/"><span className="brand-dot" /> Ilyc</Link>
        <span className="admin-label">Acesso seguro</span>
      </header>
      <section className="admin-card">
        <p className="eyebrow"><span className="brand-dot" /> Conta da equipe</p>
        <h1>Crie sua senha.</h1>
        <p>Escolha uma senha para concluir seu acesso ao painel ou atualizar sua senha atual.</p>
        <PasswordSetupForm />
      </section>
    </main>
  );
}
