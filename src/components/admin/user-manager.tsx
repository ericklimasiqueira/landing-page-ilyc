"use client";

import { useEffect, useLayoutEffect, useRef, useState, type FormEvent, type MouseEvent } from "react";
import { createPortal } from "react-dom";

export type ManagedUser = {
  id: string;
  email: string | null;
  role: "admin" | "editor" | null;
  confirmed: boolean;
  createdAt: string;
  lastSignInAt: string | null;
};

export function UserManager({ initialUsers }: { initialUsers: ManagedUser[] }) {
  const [users, setUsers] = useState(initialUsers);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"editor" | "admin">("editor");
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pendingUserId, setPendingUserId] = useState<string | null>(null);
  const [openActions, setOpenActions] = useState<{ userId: string; top: number; left: number } | null>(null);
  const actionsMenuRef = useRef<HTMLDivElement>(null);

  function positionActionsMenu(userId: string) {
    const trigger = document.querySelector<HTMLButtonElement>(
      `[data-user-action-trigger][data-user-id="${userId}"]`,
    );
    const menu = actionsMenuRef.current;
    if (!trigger || !menu) return;

    const bounds = trigger.getBoundingClientRect();
    const menuBounds = menu.getBoundingClientRect();
    const menuWidth = menuBounds.width || Math.min(250, window.innerWidth - 24);
    const menuHeight = menuBounds.height || 96;
    const left = Math.max(12, Math.min(bounds.right - menuWidth, window.innerWidth - menuWidth - 12));
    const below = bounds.bottom + 6;
    const top = below + menuHeight <= window.innerHeight - 12
      ? below
      : Math.max(12, bounds.top - menuHeight - 6);

    setOpenActions((current) => current?.userId === userId && (current.top !== top || current.left !== left)
      ? { userId, top, left }
      : current);
  }

  useLayoutEffect(() => {
    if (openActions) positionActionsMenu(openActions.userId);
  }, [openActions]);

  useEffect(() => {
    if (!openActions) return;
    const closeOnOutsideClick = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Element && (target.closest("[data-user-action-trigger]") || target.closest("[data-user-action-popover]"))) return;
      setOpenActions(null);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpenActions(null);
    };
    const repositionMenu = () => positionActionsMenu(openActions.userId);
    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    window.addEventListener("resize", repositionMenu);
    window.addEventListener("scroll", repositionMenu, true);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
      window.removeEventListener("resize", repositionMenu);
      window.removeEventListener("scroll", repositionMenu, true);
    };
  }, [openActions]);

  function toggleActions(event: MouseEvent<HTMLButtonElement>, userId: string) {
    if (openActions?.userId === userId) {
      setOpenActions(null);
      return;
    }
    const bounds = event.currentTarget.getBoundingClientRect();
    const menuWidth = Math.min(250, window.innerWidth - 24);
    const menuHeight = 104;
    const left = Math.max(12, Math.min(bounds.right - menuWidth, window.innerWidth - menuWidth - 12));
    const below = bounds.bottom + 6;
    const top = below + menuHeight <= window.innerHeight - 12
      ? below
      : Math.max(12, bounds.top - menuHeight - 6);
    setOpenActions({ userId, top, left });
  }

  async function inviteUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, role }),
      });
      const result = await response.json();

      if (!response.ok) {
        setMessage(result.error ?? "Não foi possível enviar o convite.");
        return;
      }

      setUsers((current) => [result.user, ...current.filter((user) => user.id !== result.user.id)]);
      setEmail("");
      setMessage("Convite enviado. A pessoa define a própria senha pelo link recebido.");
    } catch {
      setMessage("Não foi possível conectar ao servidor. Tente novamente.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function changeRole(userId: string, nextRole: "editor" | "admin") {
    setMessage("");
    setPendingUserId(userId);

    try {
      const response = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, role: nextRole }),
      });
      const result = await response.json();

      if (!response.ok) {
        setMessage(result.error ?? "Não foi possível alterar a permissão.");
        return;
      }

      setUsers((current) => current.map((user) => user.id === userId ? { ...user, role: nextRole } : user));
      setMessage("Permissão atualizada e válida nas próximas requisições.");
    } catch {
      setMessage("Não foi possível conectar ao servidor. Tente novamente.");
    } finally {
      setPendingUserId(null);
    }
  }

  async function sendPasswordReset(user: ManagedUser) {
    if (!user.email || !window.confirm(`Enviar um link para redefinir a senha de ${user.email}?`)) return;
    setMessage("");
    setPendingUserId(user.id);
    try {
      const response = await fetch("/api/admin/users/password-reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id }),
      });
      const result = await response.json();
      setMessage(response.ok ? `E-mail de redefinição enviado para ${user.email}.` : result.error ?? "Não foi possível enviar o e-mail.");
    } catch {
      setMessage("Não foi possível conectar ao servidor. Tente novamente.");
    } finally {
      setPendingUserId(null);
    }
  }

  async function deleteUser(user: ManagedUser) {
    if (!window.confirm(`Excluir permanentemente o acesso de ${user.email ?? "este usuário"}? Esta ação não pode ser desfeita.`)) return;
    setMessage("");
    setPendingUserId(user.id);
    try {
      const response = await fetch("/api/admin/users", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id }),
      });
      const result = await response.json();
      if (!response.ok) {
        setMessage(result.error ?? "Não foi possível excluir o usuário.");
        return;
      }
      setUsers((current) => current.filter((item) => item.id !== user.id));
      setMessage(`Acesso de ${user.email ?? "usuário"} excluído.`);
    } catch {
      setMessage("Não foi possível conectar ao servidor. Tente novamente.");
    } finally {
      setPendingUserId(null);
    }
  }

  return (
    <div className="user-manager">
      <section className="admin-panel invite-panel" aria-labelledby="invite-heading">
        <div>
          <p className="eyebrow">Novo acesso</p>
          <h2 id="invite-heading">Convide alguém para a equipe.</h2>
          <p className="panel-copy">A pessoa recebe um link para confirmar o e-mail e definir a própria senha.</p>
        </div>
        <form className="invite-form" onSubmit={inviteUser}>
          <label htmlFor="invite-email">E-mail</label>
          <input id="invite-email" autoComplete="email" maxLength={254} onChange={(event) => setEmail(event.target.value)} required type="email" value={email} />
          <label htmlFor="invite-role">Permissão</label>
          <select id="invite-role" onChange={(event) => setRole(event.target.value as "editor" | "admin")} value={role}>
            <option value="editor">Editor — altera conteúdo</option>
            <option value="admin">Administrador — conteúdo e usuários</option>
          </select>
          <button className="button button-yellow" disabled={isSubmitting} type="submit">
            {isSubmitting ? "Enviando convite…" : "Enviar convite"}
          </button>
        </form>
      </section>

      <section className="admin-panel users-panel" aria-labelledby="users-heading">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Acessos do portal</p>
            <h2 id="users-heading">Usuários</h2>
          </div>
          <span className="user-count">{users.length} {users.length === 1 ? "pessoa" : "pessoas"}</span>
        </div>
        {users.length === 0 ? (
          <p className="empty-users">Nenhum usuário foi encontrado.</p>
        ) : (
          <div className="user-table-wrap">
            <table className="user-table">
              <thead>
                <tr><th scope="col">Pessoa</th><th scope="col">Acesso</th><th scope="col">Status</th><th scope="col">Último acesso</th><th scope="col">Ações</th></tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id}>
                    <td><strong>{user.email ?? "E-mail não informado"}</strong><span className="user-created">Desde {formatDate(user.createdAt)}</span></td>
                    <td>
                      <select
                        aria-label={`Permissão de ${user.email ?? "usuário"}`}
                        disabled={pendingUserId === user.id || !user.role}
                        onChange={(event) => void changeRole(user.id, event.target.value as "editor" | "admin")}
                        value={user.role ?? ""}
                      >
                        {!user.role && <option value="">Sem acesso ao painel</option>}
                        <option value="editor">Editor</option>
                        <option value="admin">Administrador</option>
                      </select>
                    </td>
                    <td><span className={user.confirmed ? "user-status is-confirmed" : "user-status"}>{user.confirmed ? "Ativo" : "Convite pendente"}</span></td>
                    <td>{user.lastSignInAt ? formatDate(user.lastSignInAt) : "Ainda não entrou"}</td>
                    <td className="user-actions-cell">
                      <button className="user-action-trigger" type="button" data-user-action-trigger data-user-id={user.id} aria-haspopup="menu" aria-label={`Ações para ${user.email ?? "usuário"}`} aria-expanded={openActions?.userId === user.id} onClick={(event) => toggleActions(event, user.id)} title="Ações">⋮</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {message && <p aria-live="polite" className="user-manager-message">{message}</p>}

      <p className="user-manager-footnote">O cadastro público está desativado. Somente administradores podem convidar, redefinir senhas, alterar permissões ou excluir usuários.</p>
      {openActions && createPortal(
        <div ref={actionsMenuRef} className="user-action-options" data-user-action-popover role="menu" style={{ position: "fixed", top: openActions.top, left: openActions.left, zIndex: 2147483647, display: "grid", visibility: "visible", opacity: 1, pointerEvents: "auto" }}>
          {(() => {
            const user = users.find((item) => item.id === openActions.userId);
            if (!user) return null;
            return <>
              <button className="user-menu-item" type="button" role="menuitem" disabled={pendingUserId === user.id || !user.email} onClick={() => { setOpenActions(null); void sendPasswordReset(user); }}>{pendingUserId === user.id ? "Aguarde…" : "Enviar redefinição de senha"}</button>
              <button className="user-menu-item is-danger" type="button" role="menuitem" disabled={pendingUserId === user.id} onClick={() => { setOpenActions(null); void deleteUser(user); }}>Excluir usuário</button>
            </>;
          })()}
        </div>,
        document.body,
      )}
    </div>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium", timeZone: "America/Sao_Paulo" }).format(new Date(value));
}
