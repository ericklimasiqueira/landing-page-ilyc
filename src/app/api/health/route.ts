import { getAdminAccess } from "@/lib/server/admin-auth";

export async function GET() {
  const access = await getAdminAccess();

  if (!access.ok) {
    return Response.json(
      { error: "Acesso não autorizado." },
      { status: access.status, headers: { "Cache-Control": "no-store" } },
    );
  }

  return Response.json({ status: "ok" }, { headers: { "Cache-Control": "no-store" } });
}
