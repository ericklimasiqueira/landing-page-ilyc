"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export function PasswordSetupForm() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [authorized, setAuthorized] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    void createSupabaseBrowserClient().auth.getUser().then(({ data, error }) => {
      if (!active) return;
      setAuthorized(!error && Boolean(data.user));
      setReady(true);
    }).catch(() => {
      if (active) setReady(true);
    });
    return () => { active = false; };
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    if (password.length < 12) {
      setMessage("Use uma senha com pelo menos 12 caracteres.");
      return;
    }
    if (password !== confirmPassword) {
      setMessage("As senhas não coincidem.");
      return;
    }

    setSaving(true);
    try {
      const { error } = await createSupabaseBrowserClient().auth.updateUser({ password });
      if (error) {
        setMessage("Não foi possível atualizar a senha. Solicite um novo link e tente novamente.");
        return;
      }
      router.replace("/admin");
      router.refresh();
    } catch {
      setMessage("Não foi possível conectar ao servidor de autenticação.");
    } finally {
      setSaving(false);
    }
  }

  if (!ready) return <p className="login-message" role="status">Validando o link de acesso…</p>;
  if (!authorized) return <p className="login-message" role="alert">Este link expirou ou já foi utilizado. Solicite um novo convite ou redefinição de senha.</p>;

  return (
    <form className="login-form" onSubmit={submit}>
      <label htmlFor="new-password">Nova senha</label>
      <input autoComplete="new-password" id="new-password" minLength={12} onChange={(event) => setPassword(event.target.value)} required type="password" value={password} />
      <label htmlFor="confirm-password">Confirme a senha</label>
      <input autoComplete="new-password" id="confirm-password" minLength={12} onChange={(event) => setConfirmPassword(event.target.value)} required type="password" value={confirmPassword} />
      <p className="password-hint">Use pelo menos 12 caracteres.</p>
      {message && <p aria-live="polite" className="login-message">{message}</p>}
      <button className="button button-yellow" disabled={saving} type="submit">{saving ? "Salvando…" : "Salvar senha e entrar"}</button>
    </form>
  );
}
