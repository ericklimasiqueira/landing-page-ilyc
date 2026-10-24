import Link from "next/link";
import { AuthConfirm } from "@/components/admin/auth-confirm";

export default function AuthConfirmPage() {
  return (
    <main className="admin-page">
      <header className="admin-header">
        <Link className="wordmark" href="/"><span className="brand-dot" /> Ilyc</Link>
        <span className="admin-label">Acesso seguro</span>
      </header>
      <section className="admin-card">
        <p className="eyebrow"><span className="brand-dot" /> Conta da equipe</p>
        <h1>Confirmando seu acesso.</h1>
        <AuthConfirm />
      </section>
    </main>
  );
}
