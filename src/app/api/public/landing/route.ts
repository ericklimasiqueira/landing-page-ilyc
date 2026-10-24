import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const noStore = { "Cache-Control": "no-store" };

function fitModeColumnMissing(error: { code?: string; message?: string } | null) {
  return !!error && (error.code === "42703" || error.code === "PGRST204" || error.message?.includes("fit_mode") === true);
}

export async function GET() {
  try {
    const supabase = createSupabaseAdminClient();
    const [settingsResult, projectsResult, stepsResult] = await Promise.all([
      supabase.from("site_settings").select("*").eq("id", true).maybeSingle(),
      supabase.from("portfolio_projects").select("id, title, year, location, description, sort_order, is_published").eq("is_published", true).order("sort_order").order("created_at").limit(7),
      supabase.from("process_steps").select("id, step_number, title, description, sort_order, is_published").eq("is_published", true).order("sort_order").limit(3),
    ]);
    if (settingsResult.error || projectsResult.error || stepsResult.error) return Response.json({ error: "Conteúdo indisponível." }, { status: 503, headers: noStore });

    const settings = settingsResult.data;
    // Local preview remains useful while editing drafts. Production never exposes
    // unpublished text or signed URLs, even though this route uses the service key.
    if (!settings || (process.env.NODE_ENV === "production" && !settings.is_published)) {
      return Response.json({ published: false, settings: null, projects: [], steps: [] }, { headers: noStore });
    }

    const projects = projectsResult.data ?? [];
    const projectIds = projects.map((project) => project.id);
    let photos: Array<{
      id: string;
      project_id: string;
      storage_path: string;
      alt_text: string | null;
      sort_order: number;
      crop_x: number | null;
      crop_y: number | null;
      crop_zoom: number | null;
      fit_mode?: string | null;
    }> = [];

    if (projectIds.length) {
      const photoQuery = await supabase.from("portfolio_images")
        .select("id, project_id, storage_path, alt_text, sort_order, crop_x, crop_y, crop_zoom, fit_mode")
        .in("project_id", projectIds)
        .order("sort_order");
      if (fitModeColumnMissing(photoQuery.error)) {
        const legacyQuery = await supabase.from("portfolio_images")
          .select("id, project_id, storage_path, alt_text, sort_order, crop_x, crop_y, crop_zoom")
          .in("project_id", projectIds)
          .order("sort_order");
        if (legacyQuery.error) throw new Error("Não foi possível carregar as fotos do ensaio.");
        photos = (legacyQuery.data ?? []).map((photo) => ({ ...photo, fit_mode: "cover" }));
      } else if (photoQuery.error) {
        throw new Error("Não foi possível carregar as fotos do ensaio.");
      } else {
        photos = photoQuery.data ?? [];
      }
    }

    const imageRows = photos.slice(0, 49);
    const paths = [
      ...(settings?.hero_cover_path ? [settings.hero_cover_path] : []),
      ...(settings?.portrait_path ? [settings.portrait_path] : []),
      ...imageRows.map((photo) => photo.storage_path),
    ];
    const signedUrls = new Map<string, string>();
    if (paths.length) {
      const { data, error } = await supabase.storage.from("ilyc-portfolio").createSignedUrls(paths, 7200);
      if (error || !data) throw new Error("Não foi possível preparar as imagens publicadas.");
      for (const item of data) {
        if (item.path && item.signedUrl && !item.error) signedUrls.set(item.path, item.signedUrl);
      }
    }

    const photosByProject = new Map<string, typeof imageRows>();
    for (const photo of imageRows) {
      photosByProject.set(photo.project_id, [...(photosByProject.get(photo.project_id) ?? []), photo]);
    }
    const publicProjects = projects.map((project) => {
      const images = (photosByProject.get(project.id) ?? []).map((photo) => ({
        id: photo.id,
        alt_text: photo.alt_text,
        sort_order: photo.sort_order,
        crop_x: photo.crop_x,
        crop_y: photo.crop_y,
        crop_zoom: photo.crop_zoom,
        fit_mode: photo.fit_mode ?? "cover",
        url: signedUrls.get(photo.storage_path) ?? null,
      }));
      return {
        id: project.id,
        title: project.title,
        year: project.year,
        location: project.location,
        description: project.description,
        sort_order: project.sort_order,
        coverUrl: images[0]?.url ?? null,
        images,
      };
    });

    const publicSettings = settings ? {
      brand_name: settings.brand_name,
      city: settings.city,
      hero_tagline: settings.hero_tagline,
      hero_cover_url: settings.hero_cover_path ? signedUrls.get(settings.hero_cover_path) ?? null : null,
      hero_cover_crop_x: settings.hero_cover_crop_x,
      hero_cover_crop_y: settings.hero_cover_crop_y,
      hero_cover_crop_zoom: settings.hero_cover_crop_zoom,
      portfolio_heading: settings.portfolio_heading,
      about_heading: settings.about_heading,
      biography: settings.biography,
      portrait_url: settings.portrait_path ? signedUrls.get(settings.portrait_path) ?? null : null,
      portrait_crop_x: settings.portrait_crop_x,
      portrait_crop_y: settings.portrait_crop_y,
      portrait_crop_zoom: settings.portrait_crop_zoom,
      start_year: settings.start_year,
      service_region: settings.service_region,
      contact_heading: settings.contact_heading,
      contact_email: settings.contact_email,
      whatsapp_url: settings.whatsapp_url,
      instagram_url: settings.instagram_url,
    } : null;
    // Draft preview is available only on the local development server.
    return Response.json({ published: true, settings: publicSettings, projects: publicProjects, steps: stepsResult.data ?? [] }, { headers: noStore });
  } catch {
    return Response.json({ error: "Conteúdo indisponível." }, { status: 503, headers: noStore });
  }
}
