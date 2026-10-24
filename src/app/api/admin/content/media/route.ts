import { randomUUID } from "node:crypto";
import { getAdminAccess } from "@/lib/server/admin-auth";
import { isSameOriginRequest } from "@/lib/server/request-origin";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const noStore = { "Cache-Control": "no-store" };
const maxFileBytes = 4 * 1024 * 1024;
// Vercel Functions cap request/response bodies at 4.5 MB, including multipart overhead.
const maxRequestBytes = 4_500_000;
const allowedTypes = new Map([
  ["image/jpeg", "jpg"], ["image/png", "png"], ["image/webp", "webp"], ["image/avif", "avif"],
]);

function rejectOversizedRequest(request: Request) {
  const length = Number(request.headers.get("content-length"));
  return Number.isFinite(length) && length > maxRequestBytes
    ? Response.json({ error: "O envio ultrapassa o limite aceito pela hospedagem. Use uma imagem de até 4 MB." }, { status: 413, headers: noStore })
    : null;
}

async function hasExpectedImageSignature(file: File, extension: string) {
  const bytes = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  if (extension === "jpg") return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (extension === "png") return [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((value, index) => bytes[index] === value);
  if (extension === "webp") return String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
  if (extension === "avif") return String.fromCharCode(...bytes.slice(4, 8)) === "ftyp" && ["avif", "avis"].includes(String.fromCharCode(...bytes.slice(8, 12)));
  return false;
}

function fitModeColumnMissing(error: { code?: string; message?: string } | null) {
  return !!error && (error.code === "42703" || error.code === "PGRST204" || error.message?.includes("fit_mode") === true);
}

async function requireEditor(request: Request) {
  if (!isSameOriginRequest(request)) return Response.json({ error: "Origem da requisição não autorizada." }, { status: 403, headers: noStore });
  const access = await getAdminAccess();
  if (!access.ok) return Response.json({ error: "Acesso não autorizado." }, { status: access.status, headers: noStore });
  return null;
}

export async function POST(request: Request) {
  const denied = await requireEditor(request);
  if (denied) return denied;
  const tooLarge = rejectOversizedRequest(request);
  if (tooLarge) return tooLarge;
  try {
    const form = await request.formData();
    const file = form.get("file");
    const projectId = form.get("projectId");
    const setting = form.get("setting");
    const altText = form.get("altText");
    const cropX = Number(form.get("cropX") ?? 50);
    const cropY = Number(form.get("cropY") ?? 50);
    const cropZoom = Number(form.get("cropZoom") ?? 1);
    const fitMode = form.get("fitMode");
    if (!(file instanceof File)) return Response.json({ error: "Selecione uma imagem." }, { status: 400, headers: noStore });
    if (!Number.isFinite(cropX) || cropX < 0 || cropX > 100 || !Number.isFinite(cropY) || cropY < 0 || cropY > 100 || !Number.isFinite(cropZoom) || cropZoom < 1 || cropZoom > 2) return Response.json({ error: "Ajuste de recorte inválido." }, { status: 400, headers: noStore });
    const extension = allowedTypes.get(file.type);
    if (!extension || file.size === 0 || file.size > maxFileBytes) {
      return Response.json({ error: "Use JPG, PNG, WebP ou AVIF de até 4 MB." }, { status: 400, headers: noStore });
    }
    if (!await hasExpectedImageSignature(file, extension)) return Response.json({ error: "O conteúdo do arquivo não corresponde a uma imagem válida do formato informado." }, { status: 400, headers: noStore });
    if (setting === "hero_cover_path" || setting === "portrait_path") {
      const admin = createSupabaseAdminClient();
      const { data: settings, error: lookupError } = await admin.from("site_settings").select("hero_cover_path, portrait_path").eq("id", true).maybeSingle();
      if (lookupError || !settings) return Response.json({ error: "Não foi possível localizar as configurações da landing." }, { status: 502, headers: noStore });
      const currentPath = setting === "hero_cover_path" ? settings.hero_cover_path : settings.portrait_path;
      if (currentPath) return Response.json({ error: "Essa foto já existe. Use PATCH para substituí-la." }, { status: 409, headers: noStore });
      const path = `site/${randomUUID()}.${extension}`;
      const { error } = await admin.storage.from("ilyc-portfolio").upload(path, file, { contentType: file.type, upsert: false });
      if (error) return Response.json({ error: "Não foi possível enviar a imagem." }, { status: 502, headers: noStore });
      const prefix = setting === "hero_cover_path" ? "hero_cover" : "portrait";
      const { error: updateError } = await admin.from("site_settings").update({
        [setting]: path,
        [`${prefix}_crop_x`]: cropX,
        [`${prefix}_crop_y`]: cropY,
        [`${prefix}_crop_zoom`]: cropZoom,
      }).eq("id", true);
      if (updateError) {
        await admin.storage.from("ilyc-portfolio").remove([path]);
        return Response.json({ error: "Não foi possível salvar a foto na landing." }, { status: 502, headers: noStore });
      }
      const { data } = await admin.storage.from("ilyc-portfolio").createSignedUrl(path, 3600);
      if (!data?.signedUrl) {
        return Response.json({ error: "Não foi possível preparar a prévia da foto." }, { status: 502, headers: noStore });
      }
      return Response.json({ path, url: data.signedUrl }, { status: 201, headers: noStore });
    }
    if (fitMode !== null && fitMode !== "cover" && fitMode !== "contain") return Response.json({ error: "Escolha como a foto do ensaio deve caber no espaço." }, { status: 400, headers: noStore });
    if (typeof projectId !== "string" || !/^[0-9a-f-]{36}$/i.test(projectId) || setting) return Response.json({ error: "POST é usado para criar uma nova foto." }, { status: 400, headers: noStore });
    const admin = createSupabaseAdminClient();
    const { count, error: countError } = await admin.from("portfolio_images").select("id", { count: "exact", head: true }).eq("project_id", projectId);
    if (countError) return Response.json({ error: "Não foi possível conferir a quantidade de fotos deste ensaio." }, { status: 502, headers: noStore });
    if ((count ?? 0) >= 7) return Response.json({ error: "Cada ensaio pode ter até 7 fotos." }, { status: 409, headers: noStore });
    const path = `${projectId}/${randomUUID()}.${extension}`;
    const { error: uploadError } = await admin.storage.from("ilyc-portfolio").upload(path, file, { contentType: file.type, upsert: false });
    if (uploadError) return Response.json({ error: "Não foi possível enviar a imagem." }, { status: 502, headers: noStore });

    {
      const { data: latestPhoto } = await admin.from("portfolio_images").select("sort_order").eq("project_id", projectId).order("sort_order", { ascending: false }).limit(1).maybeSingle();
      const photoValues = {
        project_id: projectId,
        storage_path: path,
        alt_text: typeof altText === "string" ? altText.slice(0, 240) : "",
        sort_order: (latestPhoto?.sort_order ?? -1) + 1,
        crop_x: cropX,
        crop_y: cropY,
        crop_zoom: cropZoom,
        fit_mode: fitMode === "contain" ? "contain" : "cover",
      };
      let { data: photo, error: photoError } = await admin.from("portfolio_images").insert(photoValues).select().single();
      if (fitModeColumnMissing(photoError) && photoValues.fit_mode === "cover") {
        const legacyValues = { ...photoValues };
        Reflect.deleteProperty(legacyValues, "fit_mode");
        ({ data: photo, error: photoError } = await admin.from("portfolio_images").insert(legacyValues).select().single());
      }
      if (photoError || !photo) {
        await admin.storage.from("ilyc-portfolio").remove([path]);
        if (fitModeColumnMissing(photoError) && fitMode === "contain") return Response.json({ error: "Para mostrar a foto inteira, aplique a migration 20261024210000_portfolio_image_fit_mode.sql no Supabase." }, { status: 409, headers: noStore });
        return Response.json({ error: "Não foi possível salvar o recorte. Confira se a migration de enquadramento das fotos foi aplicada." }, { status: 502, headers: noStore });
      }
      const { data } = await admin.storage.from("ilyc-portfolio").createSignedUrl(path, 3600);
      return Response.json({ photo: { ...photo, fit_mode: photo.fit_mode ?? photoValues.fit_mode, url: data?.signedUrl ?? null } }, { status: 201, headers: noStore });
    }

  } catch {
    return Response.json({ error: "Não foi possível processar a imagem." }, { status: 503, headers: noStore });
  }
}

export async function PATCH(request: Request) {
  const denied = await requireEditor(request);
  if (denied) return denied;
  if (request.headers.get("content-type")?.includes("multipart/form-data")) {
    const tooLarge = rejectOversizedRequest(request);
    if (tooLarge) return tooLarge;
    try {
      const form = await request.formData();
      const file = form.get("file");
      const setting = form.get("setting");
      const photoId = form.get("photoId");
      const cropX = Number(form.get("cropX") ?? 50);
      const cropY = Number(form.get("cropY") ?? 50);
      const cropZoom = Number(form.get("cropZoom") ?? 1);
      const fitMode = form.get("fitMode");
      const extension = file instanceof File ? allowedTypes.get(file.type) : undefined;
      if (!(file instanceof File) || !extension || file.size === 0 || file.size > maxFileBytes) {
        return Response.json({ error: "Use JPG, PNG, WebP ou AVIF de até 4 MB." }, { status: 400, headers: noStore });
      }
      if (!await hasExpectedImageSignature(file, extension)) return Response.json({ error: "O conteúdo do arquivo não corresponde a uma imagem válida do formato informado." }, { status: 400, headers: noStore });
      if (!Number.isFinite(cropX) || cropX < 0 || cropX > 100 || !Number.isFinite(cropY) || cropY < 0 || cropY > 100 || !Number.isFinite(cropZoom) || cropZoom < 1 || cropZoom > 2) {
        return Response.json({ error: "Ajuste de recorte inválido." }, { status: 400, headers: noStore });
      }
      const admin = createSupabaseAdminClient();
      if (setting === "hero_cover_path" || setting === "portrait_path") {
        const { data: settings, error: lookupError } = await admin.from("site_settings").select("hero_cover_path, portrait_path").eq("id", true).maybeSingle();
        if (lookupError || !settings) return Response.json({ error: "Não foi possível localizar as configurações da landing." }, { status: 502, headers: noStore });
        const currentPath = setting === "hero_cover_path" ? settings.hero_cover_path : settings.portrait_path;
        if (!currentPath) return Response.json({ error: "Essa foto ainda não existe. Use POST para adicioná-la." }, { status: 404, headers: noStore });
        const path = `site/${randomUUID()}.${extension}`;
        const { error } = await admin.storage.from("ilyc-portfolio").upload(path, file, { contentType: file.type, upsert: false });
        if (error) return Response.json({ error: "Não foi possível enviar a imagem." }, { status: 502, headers: noStore });
        const prefix = setting === "hero_cover_path" ? "hero_cover" : "portrait";
        const { error: updateError } = await admin.from("site_settings").update({
          [setting]: path,
          [`${prefix}_crop_x`]: cropX,
          [`${prefix}_crop_y`]: cropY,
          [`${prefix}_crop_zoom`]: cropZoom,
        }).eq("id", true);
        if (updateError) {
          await admin.storage.from("ilyc-portfolio").remove([path]);
          return Response.json({ error: "Não foi possível salvar a nova foto na landing." }, { status: 502, headers: noStore });
        }
        if (currentPath !== path) await admin.storage.from("ilyc-portfolio").remove([currentPath]);
        const { data } = await admin.storage.from("ilyc-portfolio").createSignedUrl(path, 3600);
        if (!data?.signedUrl) {
          return Response.json({ error: "Não foi possível preparar a prévia da foto." }, { status: 502, headers: noStore });
        }
        return Response.json({ path, url: data.signedUrl }, { status: 200, headers: noStore });
      }
      if (fitMode !== "cover" && fitMode !== "contain") return Response.json({ error: "Escolha como a foto do ensaio deve caber no espaço." }, { status: 400, headers: noStore });
      if (typeof photoId !== "string" || !/^[0-9a-f-]{36}$/i.test(photoId)) return Response.json({ error: "Informe a foto do ensaio que será substituída." }, { status: 400, headers: noStore });
      const { data: currentPhoto, error: lookupError } = await admin.from("portfolio_images").select("id, project_id, storage_path").eq("id", photoId).maybeSingle();
      if (lookupError || !currentPhoto) return Response.json({ error: "Foto do ensaio não encontrada." }, { status: 404, headers: noStore });
      const path = `${currentPhoto.project_id}/${randomUUID()}.${extension}`;
      const { error: uploadError } = await admin.storage.from("ilyc-portfolio").upload(path, file, { contentType: file.type, upsert: false });
      if (uploadError) return Response.json({ error: "Não foi possível enviar a imagem." }, { status: 502, headers: noStore });
      const photoValues = { storage_path: path, crop_x: cropX, crop_y: cropY, crop_zoom: cropZoom, fit_mode: fitMode };
      let { data: photo, error: updateError } = await admin.from("portfolio_images").update(photoValues).eq("id", photoId).select().single();
      if (fitModeColumnMissing(updateError) && fitMode === "cover") {
        const legacyValues = { ...photoValues };
        Reflect.deleteProperty(legacyValues, "fit_mode");
        ({ data: photo, error: updateError } = await admin.from("portfolio_images").update(legacyValues).eq("id", photoId).select().single());
      }
      if (updateError || !photo) {
        await admin.storage.from("ilyc-portfolio").remove([path]);
        if (fitModeColumnMissing(updateError) && fitMode === "contain") return Response.json({ error: "Para mostrar a foto inteira, aplique a migration 20261024210000_portfolio_image_fit_mode.sql no Supabase." }, { status: 409, headers: noStore });
        return Response.json({ error: "Não foi possível substituir a foto do ensaio." }, { status: 502, headers: noStore });
      }
      await admin.storage.from("ilyc-portfolio").remove([currentPhoto.storage_path]);
      const { data } = await admin.storage.from("ilyc-portfolio").createSignedUrl(path, 3600);
      return Response.json({ photo: { ...photo, fit_mode: photo.fit_mode ?? fitMode, url: data?.signedUrl ?? null } }, { headers: noStore });
    } catch {
      return Response.json({ error: "Não foi possível substituir a imagem." }, { status: 503, headers: noStore });
    }
  }
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const setting = body?.setting;
  const photoId = body?.photoId;
  const cropX = body?.cropX;
  const cropY = body?.cropY;
  const cropZoom = body?.cropZoom;
  const fitMode = body?.fitMode;
  if ((setting !== "hero_cover_path" && setting !== "portrait_path" && (typeof photoId !== "string" || !/^[0-9a-f-]{36}$/i.test(photoId) || (fitMode !== "cover" && fitMode !== "contain"))) || typeof cropX !== "number" || !Number.isFinite(cropX) || cropX < 0 || cropX > 100 || typeof cropY !== "number" || !Number.isFinite(cropY) || cropY < 0 || cropY > 100 || typeof cropZoom !== "number" || !Number.isFinite(cropZoom) || cropZoom < 1 || cropZoom > 2) {
    return Response.json({ error: "Ajuste de recorte inválido." }, { status: 400, headers: noStore });
  }
  try {
    const admin = createSupabaseAdminClient();
    if (setting === "hero_cover_path" || setting === "portrait_path") {
      const prefix = setting === "hero_cover_path" ? "hero_cover" : "portrait";
      const { data, error } = await admin.from("site_settings").update({
        [`${prefix}_crop_x`]: cropX,
        [`${prefix}_crop_y`]: cropY,
        [`${prefix}_crop_zoom`]: cropZoom,
      }).eq("id", true).select("hero_cover_path, portrait_path, hero_cover_crop_x, hero_cover_crop_y, hero_cover_crop_zoom, portrait_crop_x, portrait_crop_y, portrait_crop_zoom").maybeSingle();
      if (error || !data) return Response.json({ error: "Não foi possível salvar o recorte da foto." }, { status: 502, headers: noStore });
      return Response.json({ settings: data }, { headers: noStore });
    }
    const photoValues = { crop_x: cropX, crop_y: cropY, crop_zoom: cropZoom, fit_mode: fitMode };
    let { data, error } = await admin.from("portfolio_images").update(photoValues).eq("id", photoId).select("id,crop_x,crop_y,crop_zoom,fit_mode").maybeSingle();
    if (fitModeColumnMissing(error) && fitMode === "cover") {
      const legacyValues = { ...photoValues };
      Reflect.deleteProperty(legacyValues, "fit_mode");
      ({ data, error } = await admin.from("portfolio_images").update(legacyValues).eq("id", photoId).select("id,crop_x,crop_y,crop_zoom").maybeSingle());
      if (data) data.fit_mode = "cover";
    }
    if (fitModeColumnMissing(error) && fitMode === "contain") return Response.json({ error: "Para mostrar a foto inteira, aplique a migration 20261024210000_portfolio_image_fit_mode.sql no Supabase." }, { status: 409, headers: noStore });
    if (error || !data) return Response.json({ error: "Não foi possível salvar o recorte da foto." }, { status: 502, headers: noStore });
    return Response.json({ photo: data }, { headers: noStore });
  } catch {
    return Response.json({ error: "Não foi possível salvar o recorte da foto." }, { status: 503, headers: noStore });
  }
}

export async function DELETE(request: Request) {
  const denied = await requireEditor(request);
  if (denied) return denied;
  const { searchParams } = new URL(request.url);
  const storagePath = searchParams.get("storagePath");
  if (storagePath) {
    if (!/^site\/[0-9a-f-]{36}\.(?:jpg|png|webp|avif)$/i.test(storagePath)) {
      return Response.json({ error: "Caminho de foto inválido." }, { status: 400, headers: noStore });
    }
    try {
      const admin = createSupabaseAdminClient();
      const { data: settings, error: lookupError } = await admin.from("site_settings").select("hero_cover_path, portrait_path").eq("id", true).maybeSingle();
      if (lookupError) return Response.json({ error: "Não foi possível conferir o uso da foto." }, { status: 502, headers: noStore });
      if (settings?.hero_cover_path === storagePath || settings?.portrait_path === storagePath) {
        return Response.json({ error: "A foto ainda está vinculada ao conteúdo publicado." }, { status: 409, headers: noStore });
      }
      const { error: storageError } = await admin.storage.from("ilyc-portfolio").remove([storagePath]);
      if (storageError) return Response.json({ error: "Não foi possível apagar o arquivo da foto." }, { status: 502, headers: noStore });
      return Response.json({ storageCleaned: true }, { headers: noStore });
    } catch {
      return Response.json({ error: "Não foi possível apagar o arquivo da foto." }, { status: 503, headers: noStore });
    }
  }
  const setting = searchParams.get("setting");
  if (setting === "hero_cover_path" || setting === "portrait_path") {
    try {
      const admin = createSupabaseAdminClient();
      const { data: settings, error: lookupError } = await admin.from("site_settings").select("hero_cover_path, portrait_path").eq("id", true).maybeSingle();
      if (lookupError) return Response.json({ error: "Não foi possível localizar a foto atual." }, { status: 502, headers: noStore });
      const path = setting === "hero_cover_path" ? settings?.hero_cover_path : settings?.portrait_path;
      if (!path) return Response.json({ error: "Não há foto para remover." }, { status: 404, headers: noStore });

      const values = setting === "hero_cover_path" ? { hero_cover_path: null } : { portrait_path: null };
      const { error: updateError } = await admin.from("site_settings").update(values).eq("id", true);
      if (updateError) return Response.json({ error: "Não foi possível remover a foto da landing." }, { status: 502, headers: noStore });
      const { error: storageError } = await admin.storage.from("ilyc-portfolio").remove([path]);
      return Response.json({ removed: true, storageCleaned: !storageError }, { headers: noStore });
    } catch {
      return Response.json({ error: "Não foi possível remover a foto." }, { status: 503, headers: noStore });
    }
  }
  const photoId = searchParams.get("photoId");
  if (!photoId || !/^[0-9a-f-]{36}$/i.test(photoId)) return Response.json({ error: "Foto inválida." }, { status: 400, headers: noStore });
  try {
    const admin = createSupabaseAdminClient();
    const { data: photo, error: lookupError } = await admin.from("portfolio_images").select("id, project_id, storage_path").eq("id", photoId).maybeSingle();
    if (lookupError || !photo) return Response.json({ error: "Foto não encontrada." }, { status: 404, headers: noStore });
    const { error: deleteError } = await admin.from("portfolio_images").delete().eq("id", photoId);
    if (deleteError) return Response.json({ error: "Não foi possível remover a foto." }, { status: 502, headers: noStore });
    await admin.storage.from("ilyc-portfolio").remove([photo.storage_path]);
    return Response.json({ removed: true }, { headers: noStore });
  } catch {
    return Response.json({ error: "Não foi possível remover a foto." }, { status: 503, headers: noStore });
  }
}
