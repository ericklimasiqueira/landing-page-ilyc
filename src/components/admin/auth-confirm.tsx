"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

const supportedTypes = new Set<EmailOtpType>(["invite", "recovery", "signup", "email"]);
const passwordSetupPath = "/admin/definir-senha";
const pendingConfirmations = new Map<string, Promise<void>>();

async function consumeAuthCallback(url: URL) {
  const urlParams = url.searchParams;
  const hashParams = new URLSearchParams(url.hash.slice(1));
  if (urlParams.has("error") || hashParams.has("error")) {
    throw new Error("link inválido ou expirado");
  }

  const supabase = createSupabaseBrowserClient();
  const tokenHash = urlParams.get("token_hash");
  const type = urlParams.get("type") as EmailOtpType | null;

  if (tokenHash && type && supportedTypes.has(type)) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    if (error) throw error;
  }

  // Supabase email invitations may return the access token in the URL fragment.
  // The fragment never reaches the server, so the browser client must persist it first.
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw error ?? new Error("link inválido ou expirado");
}

export function AuthConfirm() {
  const router = useRouter();
  const [message, setMessage] = useState("Validando o convite e preparando a criação da senha…");
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    const urlString = window.location.href;
    let confirmation = pendingConfirmations.get(urlString);
    if (!confirmation) {
      confirmation = consumeAuthCallback(new URL(urlString));
      pendingConfirmations.set(urlString, confirmation);
      void confirmation.then(
        () => pendingConfirmations.delete(urlString),
        () => pendingConfirmations.delete(urlString),
      );
    }

    void confirmation.then(() => {
      if (!active) return;
      window.history.replaceState({}, document.title, window.location.pathname);
      router.replace(passwordSetupPath);
    }).catch(() => {
      if (!active) return;
      setMessage("Este convite expirou ou já foi utilizado. Peça ao administrador um novo convite.");
      setFailed(true);
      window.history.replaceState({}, document.title, window.location.pathname);
    });

    return () => { active = false; };
  }, [router]);

  if (!failed) return <p aria-live="polite" className="login-message" role="status">{message}</p>;

  return (
    <div>
      <p aria-live="polite" className="login-message" role="alert">{message}</p>
      <Link className="button button-yellow" href="/admin/login">Voltar para entrar</Link>
    </div>
  );
}
