import { getAdminAccess } from "@/lib/server/admin-auth";
import { isSameOriginRequest } from "@/lib/server/request-origin";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const noStore = { "Cache-Control": "no-store" };
const textLimits: Record<string, number> = {
  brand_name: 80, city: 120, hero_tagline: 240, portfolio_heading: 120,
  about_heading: 120, biography: 4000, service_region: 240,
  contact_heading: 240, contact_email: 254, whatsapp_url: 500,
  instagram_url: 500, starting_price_label: 120,
  hero_cover_path: 128, portrait_path: 128,
};

async function requireEditor(request?: Request) {
  if (request && !isSameOriginRequest(request)) return { response: Response.json({ error: "Origem da requisição não autorizada." }, { status: 403, headers: noStore }) };
  const access = await getAdminAccess();
  if (!access.ok) return { response: Response.json({ error: "Acesso não autorizado." }, { status: access.status, headers: noStore }) };
  return { userId: access.userId };
}

function cleanTextFields(body: unknown, allowed: string[]) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const input = body as Record<string, unknown>;
  const result: Record<string, string | null> = {};
  for (const key of allowed) {
    if (!(key in input)) continue;
    const value = input[key];
    if (value !== null && typeof value !== "string") return null;
    if (typeof value === "string" && value.length > (textLimits[key] ?? 4000)) return null;
    result[key] = typeof value === "string" ? value.trim() : null;
  }
  return result;
}

function validId(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f-]{36}$/i.test(value);
}

function validYear(value: unknown) {
  return value === null || (Number.isInteger(value) && Number(value) >= 1900 && Number(value) <= 2200);
}

function validContactLinks(values: Record<string, string | null>) {
  const email = values.contact_email;
  const whatsapp = values.whatsapp_url;
  const instagram = values.instagram_url;
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return false;
  if (whatsapp) {
    try {
      const url = new URL(whatsapp);
      if (url.protocol !== "https:" || url.hostname !== "wa.me" || !/^\d{8,15}$/.test(url.pathname.slice(1)) || url.search || url.hash) return false;
    } catch { return false; }
  }
  if (instagram) {
    try {
      const url = new URL(instagram);
      if (url.protocol !== "https:" || !["instagram.com", "www.instagram.com"].includes(url.hostname) || !/^\/[A-Za-z0-9._]{1,30}\/?$/.test(url.pathname) || url.search || url.hash) return false;
    } catch { return false; }
  }
  return true;
}

function validImagePaths(values: Record<string, string | null>) {
  return [values.hero_cover_path, values.portrait_path].every((path) =>
    path === undefined || path === null || /^site\/[0-9a-f-]{36}\.(?:jpg|png|webp|avif)$/i.test(path),
  );
}

const cropFields = ["hero_cover_crop_x", "hero_cover_crop_y", "portrait_crop_x", "portrait_crop_y"] as const;
const zoomFields = ["hero_cover_crop_zoom", "portrait_crop_zoom"] as const;

function validCropSettings(input: Record<string, unknown>) {
  return cropFields.every((key) => input[key] === undefined || (typeof input[key] === "number" && Number.isFinite(input[key]) && input[key] >= 0 && input[key] <= 100))
    && zoomFields.every((key) => input[key] === undefined || (typeof input[key] === "number" && Number.isFinite(input[key]) && input[key] >= 1 && input[key] <= 2));
}

function normalizedCropSettings(input: Record<string, unknown>) {
  return Object.fromEntries([...cropFields, ...zoomFields]
    .filter((key) => input[key] !== undefined)
    .map((key) => [key, key.endsWith("_x") || key.endsWith("_y") ? Math.round(Number(input[key])) : Number(input[key])]));
}

export async function GET() {
  const auth = await requireEditor();
  if ("response" in auth) return auth.response;
  try {
    const admin = createSupabaseAdminClient();
    const [settingsResult, projectsResult, imagesResult, stepsResult, faqResult] = await Promise.all([
      admin.from("site_settings").select("*").eq("id", true).maybeSingle(),
      admin.from("portfolio_projects").select("*").order("sort_order").order("created_at"),
      admin.from("portfolio_images").select("*").order("sort_order"),
      admin.from("process_steps").select("*").order("sort_order"),
      admin.from("faq_items").select("*").order("sort_order"),
    ]);
    const failed = [settingsResult, projectsResult, imagesResult, stepsResult, faqResult].some((result) => result.error);
    if (failed) return Response.json({ error: "Não foi possível carregar o conteúdo. Confira se a migration está aplicada." }, { status: 502, headers: noStore });

    const imageRows = imagesResult.data ?? [];
    const settings = settingsResult.data;
    const paths = [
      ...(settings?.hero_cover_path ? [settings.hero_cover_path] : []),
      ...(settings?.portrait_path ? [settings.portrait_path] : []),
      ...imageRows.map((photo) => photo.storage_path),
    ];
    const signedUrls = new Map<string, string>();
    if (paths.length) {
      const { data, error } = await admin.storage.from("ilyc-portfolio").createSignedUrls(paths, 3600);
      if (error || !data) return Response.json({ error: "Não foi possível preparar as fotos do conteúdo." }, { status: 502, headers: noStore });
      for (const item of data) if (item.path && item.signedUrl && !item.error) signedUrls.set(item.path, item.signedUrl);
    }
    const photosByProject = new Map<string, typeof imageRows>();
    for (const photo of imageRows) photosByProject.set(photo.project_id, [...(photosByProject.get(photo.project_id) ?? []), photo]);
    const projects = await Promise.all((projectsResult.data ?? []).map(async (project) => ({
      ...project,
      images: (photosByProject.get(project.id) ?? []).map((photo) => ({
        ...photo,
        fit_mode: photo.fit_mode ?? "cover",
        url: signedUrls.get(photo.storage_path) ?? null,
      })),
    })));

    return Response.json({
      settings: settings ? { ...settings, hero_cover_url: settings.hero_cover_path ? signedUrls.get(settings.hero_cover_path) ?? null : null, portrait_url: settings.portrait_path ? signedUrls.get(settings.portrait_path) ?? null : null } : null,
      projects,
      steps: stepsResult.data ?? [],
      faq: faqResult.data ?? [],
    }, { headers: noStore });
  } catch {
    return Response.json({ error: "Configure a chave secreta do Supabase no servidor." }, { status: 503, headers: noStore });
  }
}

export async function PUT(request: Request) {
  const auth = await requireEditor(request);
  if ("response" in auth) return auth.response;
  const body = await request.json().catch(() => null);
  const values = cleanTextFields(body, Object.keys(textLimits));
  if (!values || !Object.keys(values).length || !validContactLinks(values) || !validImagePaths(values) || !validCropSettings(body as Record<string, unknown>) || (body as Record<string, unknown>)?.is_published !== undefined && typeof (body as Record<string, unknown>).is_published !== "boolean" || (body as Record<string, unknown>)?.start_year !== undefined && !validYear((body as Record<string, unknown>).start_year)) {
    return Response.json({ error: "Revise os campos do conteúdo antes de salvar." }, { status: 400, headers: noStore });
  }
  const input = body as Record<string, unknown>;
  try {
    const admin = createSupabaseAdminClient();
    const { data, error } = await admin.from("site_settings").upsert({
      id: true,
      ...values,
      ...(input.is_published !== undefined ? { is_published: input.is_published } : {}),
      ...(input.start_year !== undefined ? { start_year: input.start_year } : {}),
      ...normalizedCropSettings(input),
    }).select().single();
    if (error) return Response.json({ error: "Não foi possível salvar. Confira se a migration de enquadramento das fotos foi aplicada no Supabase." }, { status: 502, headers: noStore });
    return Response.json({ settings: data }, { headers: noStore });
  } catch {
    return Response.json({ error: "Configure a chave secreta do Supabase no servidor." }, { status: 503, headers: noStore });
  }
}

export async function POST(request: Request) {
  const auth = await requireEditor(request);
  if ("response" in auth) return auth.response;
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || typeof body !== "object" || Array.isArray(body)) return Response.json({ error: "Conteúdo inválido." }, { status: 400, headers: noStore });
  const kind = body?.kind;
  let admin;
  try { admin = createSupabaseAdminClient(); } catch { return Response.json({ error: "Configure a chave secreta do Supabase no servidor." }, { status: 503, headers: noStore }); }
  if (kind === "project" || kind === "step" || kind === "faq") {
    const allowed = kind === "project"
      ? ["title", "location", "description"]
      : kind === "step" ? ["title", "description"] : ["question", "answer"];
    const values = cleanTextFields(body, allowed);
    const requiredFields = kind === "project" ? ["title"] : kind === "step" ? ["title"] : ["question", "answer"];
    if (!values || requiredFields.some((field) => !values[field]) || !Object.keys(values).length) return Response.json({ error: "Preencha os campos obrigatórios." }, { status: 400, headers: noStore });
    const sortOrder = Number.isInteger(body?.sort_order) ? Number(body.sort_order) : 0;
    const isPublished = typeof body?.is_published === "boolean" ? body.is_published : false;
    if (kind === "project" && !validYear(body?.year ?? null)) return Response.json({ error: "Informe um ano entre 1900 e 2200." }, { status: 400, headers: noStore });
    if (kind === "step") {
      const stepNumber = Number(body?.step_number);
      if (!Number.isInteger(stepNumber) || stepNumber < 1 || stepNumber > 99) return Response.json({ error: "Informe o número da etapa." }, { status: 400, headers: noStore });
      const { count, error: countError } = await admin.from("process_steps").select("id", { count: "exact", head: true });
      if (countError) return Response.json({ error: "Não foi possível conferir a quantidade de etapas." }, { status: 502, headers: noStore });
      if ((count ?? 0) >= 3) return Response.json({ error: "A seção Como funciona mantém as 3 etapas do HTML original." }, { status: 409, headers: noStore });
      const { data, error } = await admin.from("process_steps").insert({ ...values, step_number: stepNumber, sort_order: sortOrder, is_published: isPublished }).select().single();
      if (error) return Response.json({ error: "Não foi possível criar a etapa. Verifique se o número já está em uso." }, { status: 502, headers: noStore });
      return Response.json({ item: data }, { status: 201, headers: noStore });
    }
    if (kind === "faq") {
      const { data, error } = await admin.from("faq_items").insert({ ...values, sort_order: sortOrder, is_published: isPublished }).select().single();
      if (error) return Response.json({ error: "Não foi possível criar a pergunta." }, { status: 502, headers: noStore });
      return Response.json({ item: data }, { status: 201, headers: noStore });
    }
    const { count, error: countError } = await admin.from("portfolio_projects").select("id", { count: "exact", head: true });
    if (countError) return Response.json({ error: "Não foi possível conferir a quantidade de ensaios." }, { status: 502, headers: noStore });
    if ((count ?? 0) >= 7) return Response.json({ error: "O portfólio pode ter até 7 ensaios no MVP." }, { status: 409, headers: noStore });
    const { data, error } = await admin.from("portfolio_projects").insert({ ...values, year: body?.year ?? null, sort_order: sortOrder, is_published: isPublished }).select().single();
    if (error) return Response.json({ error: "Não foi possível criar o ensaio." }, { status: 502, headers: noStore });
    return Response.json({ item: { ...data, images: [] } }, { status: 201, headers: noStore });
  }
  return Response.json({ error: "Tipo de conteúdo inválido." }, { status: 400, headers: noStore });
}

export async function PATCH(request: Request) {
  const auth = await requireEditor(request);
  if ("response" in auth) return auth.response;
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const kind = body?.kind;
  if (kind === "settings") {
    const input = body?.values as Record<string, unknown> | undefined;
    const mediaFields = [...cropFields, ...zoomFields, "hero_cover_path", "portrait_path"];
    if (input && mediaFields.some((field) => field in input)) {
      return Response.json({ error: "Fotos e recortes devem ser alterados pela rota /api/admin/content/media." }, { status: 400, headers: noStore });
    }
    const values = cleanTextFields(input, Object.keys(textLimits));
    const hasNonTextSetting = Boolean(input && (input.is_published !== undefined || input.start_year !== undefined));
    if (!input || !values || (!Object.keys(values).length && !hasNonTextSetting) || !validContactLinks(values)
      || input.is_published !== undefined && typeof input.is_published !== "boolean"
      || input.start_year !== undefined && !validYear(input.start_year)) {
      return Response.json({ error: "Revise os campos do conteúdo antes de salvar." }, { status: 400, headers: noStore });
    }
    try {
      const admin = createSupabaseAdminClient();
      const { data, error } = await admin.from("site_settings").update({
        ...values,
        ...(input.is_published !== undefined ? { is_published: input.is_published } : {}),
        ...(input.start_year !== undefined ? { start_year: input.start_year } : {}),
      }).eq("id", true).select().single();
      if (error) return Response.json({ error: "Não foi possível salvar as alterações de conteúdo." }, { status: 502, headers: noStore });
      return Response.json({ settings: data }, { headers: noStore });
    } catch {
      return Response.json({ error: "Configure a chave secreta do Supabase no servidor." }, { status: 503, headers: noStore });
    }
  }
  const id = body?.id;
  const table = kind === "project" ? "portfolio_projects" : kind === "step" ? "process_steps" : kind === "faq" ? "faq_items" : null;
  const allowed = kind === "project" ? ["title", "location", "description"] : kind === "step" ? ["title", "description"] : kind === "faq" ? ["question", "answer"] : [];
  const values = cleanTextFields(body?.values, allowed);
  if (!table || !validId(id) || !values) return Response.json({ error: "Conteúdo inválido." }, { status: 400, headers: noStore });
  const inputValues = body?.values as Record<string, unknown>;
  const update: Record<string, unknown> = { ...values };
  if (inputValues.year !== undefined && kind === "project") {
    if (!validYear(inputValues.year)) return Response.json({ error: "Informe um ano entre 1900 e 2200." }, { status: 400, headers: noStore });
    update.year = inputValues.year;
  }
  if (inputValues.sort_order !== undefined) {
    if (!Number.isInteger(inputValues.sort_order) || Number(inputValues.sort_order) < 0) {
      return Response.json({ error: "A ordem de exibição precisa ser um número inteiro igual ou maior que zero." }, { status: 400, headers: noStore });
    }
    update.sort_order = inputValues.sort_order;
  }
  if (inputValues.is_published !== undefined) {
    if (typeof inputValues.is_published !== "boolean") {
      return Response.json({ error: "Informe se este conteúdo deve ficar publicado ou como rascunho." }, { status: 400, headers: noStore });
    }
    update.is_published = inputValues.is_published;
  }
  if (!Object.keys(update).length) return Response.json({ error: "Nenhuma alteração informada." }, { status: 400, headers: noStore });
  try {
    const admin = createSupabaseAdminClient();
    const { data, error } = await admin.from(table).update(update).eq("id", id).select().maybeSingle();
    if (error || !data) return Response.json({ error: "Não foi possível atualizar este conteúdo." }, { status: 502, headers: noStore });
    return Response.json({ item: data }, { headers: noStore });
  } catch {
    return Response.json({ error: "Configure a chave secreta do Supabase no servidor." }, { status: 503, headers: noStore });
  }
}

export async function DELETE(request: Request) {
  const auth = await requireEditor(request);
  if ("response" in auth) return auth.response;
  const { searchParams } = new URL(request.url);
  const kind = searchParams.get("kind");
  const id = searchParams.get("id");
  const table = kind === "project" ? "portfolio_projects" : kind === "step" ? "process_steps" : kind === "faq" ? "faq_items" : null;
  if (!table || !validId(id)) return Response.json({ error: "Conteúdo inválido." }, { status: 400, headers: noStore });
  try {
    const admin = createSupabaseAdminClient();
    let photoPaths: string[] = [];
    if (kind === "project") {
      const { data: photos } = await admin.from("portfolio_images").select("storage_path").eq("project_id", id);
      photoPaths = photos?.map((photo) => photo.storage_path) ?? [];
    }
    const { error } = await admin.from(table).delete().eq("id", id);
    if (error) return Response.json({ error: "Não foi possível remover este conteúdo." }, { status: 502, headers: noStore });
    if (photoPaths.length) await admin.storage.from("ilyc-portfolio").remove(photoPaths);
    return new Response(null, { status: 204, headers: noStore });
  } catch {
    return Response.json({ error: "Configure a chave secreta do Supabase no servidor." }, { status: 503, headers: noStore });
  }
}
