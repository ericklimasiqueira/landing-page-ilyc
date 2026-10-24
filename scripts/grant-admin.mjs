import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secretKey = process.env.SUPABASE_SECRET_KEY;
const email = process.argv[2]?.trim().toLowerCase();

if (!supabaseUrl || !secretKey) {
  console.error("Configure NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SECRET_KEY em .env.local.");
  process.exit(1);
}

if (!email || !email.includes("@")) {
  console.error("Uso: npm run admin:grant -- email@exemplo.com");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, secretKey, {
  auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
});

const { data, error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
if (error) {
  console.error("Não foi possível consultar os usuários pelo Auth Admin API.");
  process.exit(1);
}

const user = data.users.find((candidate) => candidate.email?.toLowerCase() === email);
if (!user) {
  console.error("Não encontrei esse usuário na primeira página do Auth.");
  process.exit(1);
}

if (user.app_metadata?.role === "admin") {
  console.log("O usuário já tem a role admin.");
  process.exit(0);
}

const prompt = createInterface({ input: stdin, output: stdout });
const confirmation = await prompt.question("Digite PROMOVER para atribuir a role admin a esse usuário: ");
prompt.close();

if (confirmation !== "PROMOVER") {
  console.log("Operação cancelada.");
  process.exit(0);
}

const { error: updateError } = await supabase.auth.admin.updateUserById(user.id, {
  app_metadata: { ...user.app_metadata, role: "admin" },
});

if (updateError) {
  console.error("Não foi possível atualizar a role administrativa.");
  process.exit(1);
}

console.log("Role admin atribuída. Faça logout e login novamente para renovar o token.");
