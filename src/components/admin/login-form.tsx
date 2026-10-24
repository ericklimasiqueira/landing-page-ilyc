"use client";

import { useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

const isConfigured = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
);

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState(searchParams.get("error") === "link" ? "Esse link expirou ou já foi usado. Peça um novo convite ou link de redefinição." : "");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setIsSubmitting(true);

    try {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setMessage("Não foi possível entrar com essas credenciais.");
        return;
      }
      router.replace("/admin");
      router.refresh();
    } catch {
      setMessage("O Supabase ainda não está configurado neste ambiente.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="login-form" onSubmit={handleSubmit}>
      {!isConfigured && <p className="login-config-note">Configure as variáveis Supabase em .env.local para habilitar o login.</p>}
      <label htmlFor="email">E-mail</label>
      <input autoComplete="username" id="email" name="email" onChange={(event) => setEmail(event.target.value)} required type="email" value={email} />
      <label htmlFor="password">Senha</label>
      <input autoComplete="current-password" id="password" name="password" onChange={(event) => setPassword(event.target.value)} required type="password" value={password} />
      {message && <p aria-live="polite" className="login-message">{message}</p>}
      <button className="button button-yellow" disabled={!isConfigured || isSubmitting} type="submit">
        {isSubmitting ? "Entrando…" : "Entrar no painel"}
      </button>
    </form>
  );
}
