"use client";

import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export function SignOutButton() {
  const router = useRouter();

  async function signOut() {
    await createSupabaseBrowserClient().auth.signOut();
    for (const key of Object.keys(sessionStorage)) {
      if (key.startsWith("ilyc-admin-content:")) sessionStorage.removeItem(key);
    }
    router.replace("/admin/login");
    router.refresh();
  }

  return <button className="sign-out-button" onClick={signOut} type="button">Sair</button>;
}
