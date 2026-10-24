import Link from "next/link";
import { SignOutButton } from "@/components/admin/sign-out-button";
import type { AdminRole } from "@/lib/server/admin-auth";

export function AdminHeader({ role, active }: { role: AdminRole; active: "content" | "users" }) {
  return (
    <header className="admin-topbar">
      <Link className="wordmark" href="/"><span className="brand-dot" /> Ilyc</Link>
      <nav className="admin-nav" aria-label="Navegação administrativa">
        <Link className={active === "content" ? "admin-nav-link is-active" : "admin-nav-link"} href="/admin">Conteúdo</Link>
        {role === "admin" && (
          <Link className={active === "users" ? "admin-nav-link is-active" : "admin-nav-link"} href="/admin/usuarios">Usuários</Link>
        )}
        <Link className="admin-nav-link" href="/">Ver landing</Link>
      </nav>
      <div className="admin-header-actions">
        <span className="admin-role-badge">{role === "admin" ? "Administrador" : "Editor"}</span>
        <SignOutButton />
      </div>
    </header>
  );
}
