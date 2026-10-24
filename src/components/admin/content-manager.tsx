"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type CSSProperties, type PointerEvent, type SyntheticEvent } from "react";
import type { AdminContent, FaqItem, PortfolioProject, ProcessStep, SiteSettings } from "@/lib/admin-content";

type SectionKey = "general" | "portfolio" | "about" | "process" | "contact";
type Message = { text: string; tone: "success" | "error" } | null;
type CropValues = { x: number; y: number; zoom: number; fitMode?: "cover" | "contain" };
type SettingImageKey = "hero_cover_path" | "portrait_path";
type ExtendedSettings = SiteSettings & { hero_cover_url?: string | null; portrait_url?: string | null };
type EditorContent = Omit<AdminContent, "settings"> & { settings: ExtendedSettings };

function PreviewImage({ src, alt, className, style, onLoad, onError }: { src: string; alt: string; className?: string; style?: CSSProperties; onLoad?: (event: SyntheticEvent<HTMLImageElement>) => void; onError?: () => void }) {
  // Browser-native images render local blob URLs directly, without Next's image pipeline.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} className={className} style={style} onLoad={onLoad} onError={onError} />;
}

function notifyLandingUpdate() {
  try { localStorage.setItem("ilyc-landing-content-updated", String(Date.now())); } catch { /* storage may be blocked */ }
}

const sections: { key: SectionKey; number: string; label: string; helper: string }[] = [
  { key: "general", number: "01", label: "Início", helper: "Marca e chamada principal" },
  { key: "portfolio", number: "02", label: "Ensaios", helper: "Portfólio, capas e galerias" },
  { key: "about", number: "03", label: "Sobre", helper: "Apresentação e retrato" },
  { key: "process", number: "04", label: "Como funciona", helper: "Etapas do ensaio" },
  { key: "contact", number: "05", label: "Contato", helper: "Canais e chamada final" },
];

export function ContentManager({ initialContent, onContentSaved }: { initialContent: AdminContent; onContentSaved?: () => void }) {
  const [content, setContent] = useState<EditorContent>(initialContent as EditorContent);
  const [whatsappNumber, setWhatsappNumber] = useState(() => formatBrazilPhone(getWhatsAppNumber(initialContent.settings.whatsapp_url)));
  const [instagramUrl, setInstagramUrl] = useState(initialContent.settings.instagram_url);
  const [active, setActive] = useState<SectionKey>("general");
  const [message, setMessage] = useState<Message>(null);
  const [saving, setSaving] = useState(false);
  const [creatingProject, setCreatingProject] = useState(false);
  const persistedSettingsRef = useRef<ExtendedSettings>(initialContent.settings as ExtendedSettings);
  const activeSection = useMemo(() => sections.find((section) => section.key === active)!, [active]);

  function updateSetting<K extends keyof ExtendedSettings>(key: K, value: ExtendedSettings[K]) {
    setContent((current) => ({ ...current, settings: { ...current.settings, [key]: value } }));
  }

  async function saveSettingImage(setting: SettingImageKey, file: File, crop: CropValues) {
    const prefix = setting === "hero_cover_path" ? "hero_cover" : "portrait";
    const form = new FormData();
    form.set("file", file);
    form.set("setting", setting);
    form.set("cropX", String(crop.x));
    form.set("cropY", String(crop.y));
    form.set("cropZoom", String(crop.zoom));
    const method = content.settings[setting] ? "PATCH" : "POST";
    const response = await fetch("/api/admin/content/media", { method, body: form });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error ?? "Não foi possível salvar a foto.");
    const savedSettings = {
      [setting]: result.path,
      [`${prefix}_url`]: result.url ?? null,
      [`${prefix}_crop_x`]: crop.x,
      [`${prefix}_crop_y`]: crop.y,
      [`${prefix}_crop_zoom`]: crop.zoom,
    };
    setContent((current) => ({ ...current, settings: { ...current.settings, ...savedSettings } }));
    persistedSettingsRef.current = { ...persistedSettingsRef.current, ...savedSettings } as ExtendedSettings;
    notifyLandingUpdate();
    onContentSaved?.();
    setMessage({ text: "Foto salva e publicada na landing.", tone: "success" });
  }

  async function saveSettingCrop(setting: SettingImageKey, crop: CropValues) {
    const prefix = setting === "hero_cover_path" ? "hero_cover" : "portrait";
    const response = await fetch("/api/admin/content/media", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ setting, cropX: crop.x, cropY: crop.y, cropZoom: crop.zoom }) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error ?? "Não foi possível salvar o recorte da foto.");
    const savedSettings = { [`${prefix}_crop_x`]: crop.x, [`${prefix}_crop_y`]: crop.y, [`${prefix}_crop_zoom`]: crop.zoom };
    setContent((current) => ({ ...current, settings: { ...current.settings, ...savedSettings } }));
    persistedSettingsRef.current = { ...persistedSettingsRef.current, ...savedSettings } as ExtendedSettings;
    notifyLandingUpdate();
    onContentSaved?.();
    setMessage({ text: "Enquadramento salvo na landing.", tone: "success" });
  }

  async function removeSettingImage(setting: SettingImageKey) {
    const label = setting === "hero_cover_path" ? "foto de capa" : "retrato";
    if (!window.confirm(`Remover a ${label} da landing?`)) return;
    const response = await fetch(`/api/admin/content/media?setting=${setting}`, { method: "DELETE" });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error ?? "Não foi possível remover a foto.");
    const prefix = setting === "hero_cover_path" ? "hero_cover" : "portrait";
    const savedSettings = { [setting]: null, [`${prefix}_url`]: null };
    setContent((current) => ({ ...current, settings: { ...current.settings, ...savedSettings } }));
    persistedSettingsRef.current = { ...persistedSettingsRef.current, ...savedSettings } as ExtendedSettings;
    notifyLandingUpdate();
    onContentSaved?.();
    setMessage({ text: "Foto removida da landing.", tone: "success" });
  }

  async function saveSettings() {
    setSaving(true);
    setMessage(null);
    try {
      const textFields = active === "general"
        ? ["brand_name", "city", "hero_tagline"]
        : active === "portfolio" ? ["portfolio_heading"]
        : active === "about" ? ["about_heading", "start_year", "biography", "service_region"]
        : active === "contact" ? ["contact_heading", "contact_email", "whatsapp_url", "instagram_url"]
        : [];
      const changedTextFields = textFields.filter((key) => content.settings[key as keyof ExtendedSettings] !== persistedSettingsRef.current[key as keyof ExtendedSettings]);
      const values = Object.fromEntries(changedTextFields.map((key) => [key, content.settings[key as keyof ExtendedSettings]]));
      if (!Object.keys(values).length) {
        setMessage({ text: "Nenhum campo de texto foi alterado.", tone: "success" });
        return;
      }
      const response = await fetch("/api/admin/content", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "settings", values }) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error ?? "Não foi possível salvar os textos.");
      const savedSettings = result.settings ?? values;
      setContent((current) => ({ ...current, settings: { ...current.settings, ...savedSettings } }));
      persistedSettingsRef.current = { ...persistedSettingsRef.current, ...savedSettings } as ExtendedSettings;
      notifyLandingUpdate();
      onContentSaved?.();
      setMessage({ text: "Textos salvos. A landing já está atualizada.", tone: "success" });
    } catch (error) {
      setMessage({ text: error instanceof Error ? error.message : "Não foi possível salvar as alterações.", tone: "error" });
    } finally {
      setSaving(false);
    }
  }

  async function saveItem(kind: "project" | "step", id: string, values: Record<string, unknown>, announce = true) {
    setMessage(null);
    const response = await fetch("/api/admin/content", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, id, values }) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error ?? "Não foi possível salvar este item.");
    if (announce) notifyLandingUpdate();
    onContentSaved?.();
    setMessage({ text: "Item atualizado.", tone: "success" });
    return result.item;
  }

  async function createItem(kind: "project" | "step", values: Record<string, unknown>) {
    setMessage(null);
    const response = await fetch("/api/admin/content", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, ...values }) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error ?? "Não foi possível criar este item.");
    notifyLandingUpdate();
    onContentSaved?.();
    setMessage({
      text: kind === "project"
        ? "Ensaio criado como rascunho. Marque Publicado e salve para exibi-lo na landing."
        : "Item criado como rascunho. Marque Publicado e salve para exibi-lo na landing.",
      tone: "success",
    });
    return result.item;
  }

  async function removeItem(kind: "project" | "step", id: string) {
    if (!window.confirm("Remover este conteúdo da landing page?")) return false;
    setMessage(null);
    const response = await fetch(`/api/admin/content?kind=${kind}&id=${encodeURIComponent(id)}`, { method: "DELETE" });
    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      throw new Error(result.error ?? "Não foi possível remover este item.");
    }
    notifyLandingUpdate();
    onContentSaved?.();
    setMessage({ text: "Conteúdo removido.", tone: "success" });
    return true;
  }

  async function addProject() {
    setCreatingProject(true);
    setMessage(null);
    try {
      const item = await createItem("project", { title: "Novo ensaio", location: "", description: "", year: null });
      setContent((current) => ({ ...current, projects: [...current.projects, item] }));
    } catch (error) {
      reportError(error);
    } finally {
      setCreatingProject(false);
    }
  }

  function updateProject(projectId: string, values: Partial<PortfolioProject>) {
    setContent((current) => ({ ...current, projects: current.projects.map((project) => project.id === projectId ? { ...project, ...values } : project) }));
  }

  async function uploadImage(file: File, target: { setting: "hero_cover_path" | "portrait_path" } | { projectId: string; altText: string; crop: CropValues }, announce = true) {
    const form = new FormData();
    form.set("file", file);
    if ("setting" in target) form.set("setting", target.setting);
    else {
      form.set("projectId", target.projectId);
      form.set("altText", target.altText);
      form.set("cropX", String(target.crop.x));
      form.set("cropY", String(target.crop.y));
      form.set("cropZoom", String(target.crop.zoom));
      form.set("fitMode", target.crop.fitMode ?? "cover");
    }
    const response = await fetch("/api/admin/content/media", { method: "POST", body: form });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error ?? "Não foi possível enviar a imagem.");
    if (announce) notifyLandingUpdate();
    onContentSaved?.();
    if ("setting" in target) {
      updateSetting(target.setting, result.path);
      updateSetting(target.setting === "hero_cover_path" ? "hero_cover_url" : "portrait_url", result.url);
    } else {
      setContent((current) => ({ ...current, projects: current.projects.map((project) => project.id === target.projectId ? { ...project, images: [...project.images, result.photo] } : project) }));
    }
    setMessage({ text: "Imagem enviada com segurança.", tone: "success" });
  }

  async function removePhoto(projectId: string, photoId: string, announce = true) {
    const response = await fetch(`/api/admin/content/media?photoId=${encodeURIComponent(photoId)}`, { method: "DELETE" });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error ?? "Não foi possível remover a foto.");
    setContent((current) => ({ ...current, projects: current.projects.map((project) => project.id === projectId ? { ...project, images: project.images.filter((photo) => photo.id !== photoId) } : project) }));
    if (announce) notifyLandingUpdate();
    onContentSaved?.();
    setMessage({ text: "Foto removida da galeria.", tone: "success" });
  }

  async function replaceProjectPhoto(projectId: string, photoId: string, file: File, crop: CropValues) {
    const form = new FormData();
    form.set("photoId", photoId);
    form.set("file", file);
    form.set("cropX", String(crop.x));
    form.set("cropY", String(crop.y));
    form.set("cropZoom", String(crop.zoom));
    form.set("fitMode", crop.fitMode ?? "cover");
    const response = await fetch("/api/admin/content/media", { method: "PATCH", body: form });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error ?? "Não foi possível substituir a foto do ensaio.");
    setContent((current) => ({ ...current, projects: current.projects.map((project) => project.id === projectId ? { ...project, images: project.images.map((photo) => photo.id === photoId ? result.photo : photo) } : project) }));
    notifyLandingUpdate();
    onContentSaved?.();
    setMessage({ text: "Foto do ensaio substituída e publicada.", tone: "success" });
  }

  async function saveProjectPhotoCrop(projectId: string, photoId: string, crop: CropValues) {
    const response = await fetch("/api/admin/content/media", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ photoId, cropX: crop.x, cropY: crop.y, cropZoom: crop.zoom, fitMode: crop.fitMode ?? "cover" }) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error ?? "Não foi possível salvar o enquadramento da foto.");
    setContent((current) => ({ ...current, projects: current.projects.map((project) => project.id === projectId ? { ...project, images: project.images.map((photo) => photo.id === photoId ? { ...photo, ...result.photo } : photo) } : project) }));
    notifyLandingUpdate();
    onContentSaved?.();
    setMessage({ text: "Enquadramento da foto salvo na landing.", tone: "success" });
  }

  function reportError(error: unknown) {
    setMessage({ text: error instanceof Error ? error.message : "A operação não foi concluída.", tone: "error" });
  }

  return (
    <div className="content-manager">
      <aside className="content-sidebar" aria-label="Seções da landing page">
        <p className="content-sidebar-label">Editar conteúdo</p>
        {sections.map((section) => (
          <button key={section.key} type="button" className={`content-section-link${active === section.key ? " is-active" : ""}`} onClick={() => { setActive(section.key); setMessage(null); }}>
            <span className="content-section-number">{section.number}</span>
            <span><strong>{section.label}</strong><small>{section.helper}</small></span>
            <span className="content-section-arrow" aria-hidden="true">↗</span>
          </button>
        ))}
        <div className="content-sidebar-note"><span className="status-dot" />Textos atualizam ao salvar; fotos ao confirmar.</div>
      </aside>

      <section className="content-workspace" aria-labelledby="content-section-title">
        <div className="content-workspace-heading">
          <div><p className="eyebrow">Seção {activeSection.number} / conteúdo do site</p><h2 id="content-section-title">{activeSection.label}</h2><p>{activeSection.helper}. Textos atualizam ao salvar; fotos ao confirmar no modal.</p></div>
          <a className="content-preview-link" href="/" target="_blank" rel="noreferrer">Abrir landing <span aria-hidden="true">↗</span></a>
        </div>
        {message && <div className={`content-message is-${message.tone}`} role={message.tone === "error" ? "alert" : "status"}>{message.text}</div>}

        {active === "general" && <form className="content-form" onSubmit={(event) => { event.preventDefault(); void saveSettings(); }}>
          <Field label="Nome da marca" value={content.settings.brand_name} onChange={(value) => updateSetting("brand_name", value)} placeholder="Ex.: Ilyc" maxLength={80} />
          <Field label="Cidade ou região" value={content.settings.city} onChange={(value) => updateSetting("city", value)} placeholder="Ex.: São Paulo, SP" maxLength={120} />
          <Field label="Frase principal" value={content.settings.hero_tagline} onChange={(value) => updateSetting("hero_tagline", value)} placeholder="Ex.: Histórias reais, luz natural e afeto." maxLength={240} wide />
          <ImageField label="Foto de capa" imageUrl={content.settings.hero_cover_url} crop={{ x: content.settings.hero_cover_crop_x, y: content.settings.hero_cover_crop_y, zoom: content.settings.hero_cover_crop_zoom }} shape="cover" onFile={(file, crop) => saveSettingImage("hero_cover_path", file, crop)} onCropChange={(crop) => saveSettingCrop("hero_cover_path", crop)} onRemove={() => removeSettingImage("hero_cover_path")} onError={reportError} />
          <SaveButton saving={saving} />
        </form>}

        {active === "portfolio" && <div className="content-list-section">
          <div className="content-section-summary"><span className="eyebrow">Portfólio</span><h3>Título da seção</h3><div className="inline-setting"><input aria-label="Título do portfólio" value={content.settings.portfolio_heading} onChange={(event) => updateSetting("portfolio_heading", event.target.value)} placeholder="Ex.: Ensaios selecionados" maxLength={120} /><button className="button button-yellow" type="button" disabled={saving} onClick={() => void saveSettings()}>Salvar título</button></div></div>
          <div className="content-list-heading"><div><p className="eyebrow">{content.projects.length} de 7 ensaios</p><h3>Ensaios e fotos</h3></div><button className="button button-yellow" type="button" disabled={creatingProject || content.projects.length >= 7} onClick={() => void addProject()}>{creatingProject ? "Criando ensaio…" : "+ Novo ensaio"}</button></div>
          {content.projects.map((project) => <ProjectCard
            key={project.id}
            project={project}
            onChange={(values) => updateProject(project.id, values)}
            onSave={async (values) => {
              const item = await saveItem("project", project.id, values, false);
              updateProject(project.id, item);
              notifyLandingUpdate();
              setMessage({ text: item.is_published ? "Ensaio salvo e publicado na landing." : "Ensaio salvo como rascunho. Marque Publicado para exibi-lo na landing.", tone: "success" });
            }}
            onAddPhoto={(file, crop) => uploadImage(file, { projectId: project.id, altText: project.title, crop })}
            onReplacePhoto={(photoId, file, crop) => replaceProjectPhoto(project.id, photoId, file, crop)}
            onCropPhoto={(photoId, crop) => saveProjectPhotoCrop(project.id, photoId, crop)}
            onRemovePhoto={(photoId) => removePhoto(project.id, photoId)}
            onDelete={async () => { if (await removeItem("project", project.id)) setContent((current) => ({ ...current, projects: current.projects.filter((entry) => entry.id !== project.id) })); }}
            onError={reportError}
          />)}
          {content.projects.length === 0 && <EmptyState title="Sua galeria começa aqui" copy="Adicione um ensaio, coloque uma foto e publique quando estiver pronto." />}
        </div>}

        {active === "about" && <form className="content-form" onSubmit={(event) => { event.preventDefault(); void saveSettings(); }}>
          <Field label="Título da seção" value={content.settings.about_heading} onChange={(value) => updateSetting("about_heading", value)} placeholder="Ex.: Por trás da lente" maxLength={120} />
          <Field label="Ano de início" value={content.settings.start_year?.toString() ?? ""} onChange={(value) => updateSetting("start_year", value ? Number(value) : null)} placeholder="Ex.: 2022" type="number" min={1900} max={2200} />
          <Field label="Texto de apresentação" value={content.settings.biography} onChange={(value) => updateSetting("biography", value)} placeholder="Escreva em primeira pessoa. Ex.: Acredito que cada ensaio merece contar uma história única..." maxLength={4000} wide multiline />
          <Field label="Região atendida" value={content.settings.service_region} onChange={(value) => updateSetting("service_region", value)} placeholder="Ex.: São Paulo e região metropolitana" maxLength={240} />
          <ImageField label="Retrato" imageUrl={content.settings.portrait_url} crop={{ x: content.settings.portrait_crop_x, y: content.settings.portrait_crop_y, zoom: content.settings.portrait_crop_zoom }} shape="circle" onFile={(file, crop) => saveSettingImage("portrait_path", file, crop)} onCropChange={(crop) => saveSettingCrop("portrait_path", crop)} onRemove={() => removeSettingImage("portrait_path")} onError={reportError} />
          <SaveButton saving={saving} />
        </form>}

        {active === "process" && <CollectionEditor
          title="Como funciona"
          eyebrow="Etapas do ensaio"
          items={content.steps}
          kind="step"
          onDraftChange={(item, values) => setContent((current) => ({ ...current, steps: current.steps.map((step) => step.id === item.id ? { ...step, ...values } : step) }))}
          onCreate={async () => { const item = await createItem("step", { step_number: Math.max(0, ...content.steps.map((step) => step.step_number)) + 1, title: "Nova etapa", description: "", sort_order: content.steps.length, is_published: false }); setContent((current) => ({ ...current, steps: [...current.steps, item] })); }}
          onSave={async (item, values) => { const updated = await saveItem("step", item.id, values); setContent((current) => ({ ...current, steps: current.steps.map((step) => step.id === item.id ? { ...step, ...updated } : step) })); }}
          onDelete={async (item) => { if (await removeItem("step", item.id)) setContent((current) => ({ ...current, steps: current.steps.filter((step) => step.id !== item.id) })); }}
          onError={reportError}
        />}

        {active === "contact" && <form className="content-form" onSubmit={(event) => { event.preventDefault(); void saveSettings(); }}>
          <Field label="Chamada da seção" value={content.settings.contact_heading} onChange={(value) => updateSetting("contact_heading", value)} placeholder="Ex.: Vamos conversar sobre seu ensaio?" maxLength={240} wide />
          <Field label="E-mail" value={content.settings.contact_email} onChange={(value) => updateSetting("contact_email", value)} placeholder="contato@seudominio.com" type="email" maxLength={254} />
          <Field label="WhatsApp · número com DDD" value={whatsappNumber} onChange={(value) => { const formatted = formatBrazilPhone(value); setWhatsappNumber(formatted); updateSetting("whatsapp_url", makeWhatsAppUrl(formatted)); }} placeholder="(11) 99999-9999" type="tel" maxLength={15} />
          <p className="contact-field-hint">Digite o número com DDD. O link do WhatsApp será criado automaticamente com o código do Brasil (+55).</p>
          <Field label="Link do Instagram" value={instagramUrl} onChange={(value) => { setInstagramUrl(value); updateSetting("instagram_url", value.trim()); }} placeholder="https://www.instagram.com/seuusuario/" type="url" maxLength={500} />
          <p className="contact-field-hint">Cole o link do perfil. Na landing, o cliente verá o @ e poderá abrir o Instagram.</p>
          <SaveButton saving={saving} />
        </form>}
        <TemplatePreview content={content} />
      </section>
    </div>
  );
}

function Field({ label, value, onChange, type = "text", maxLength, min, max, wide, multiline, placeholder }: { label: string; value: string; onChange: (value: string) => void; type?: string; maxLength?: number; min?: number; max?: number; wide?: boolean; multiline?: boolean; placeholder?: string }) {
  return <label className={`content-field${wide ? " is-wide" : ""}`}>{label}{multiline ? <textarea value={value} onChange={(event) => onChange(event.target.value)} maxLength={maxLength} rows={6} placeholder={placeholder} /> : <input type={type} value={value} onChange={(event) => onChange(event.target.value)} maxLength={maxLength} min={min} max={max} placeholder={placeholder} />}</label>;
}

function SaveButton({ saving }: { saving: boolean }) {
  return <div className="content-form-actions"><span>Este botão salva os campos de texto. Fotos são publicadas ao confirmar no modal.</span><button className="button button-yellow" type="submit" disabled={saving}>{saving ? "Salvando…" : "Salvar alterações"}</button></div>;
}

function PreviewHeading() {
  return <div className="section-preview-heading"><span className="preview-live-dot" />PRÉVIA COMPLETA DA LANDING<span>acompanha os rascunhos</span></div>;
}

function TemplatePreview({ content }: { content: EditorContent }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const previewContent = useMemo(() => ({
    settings: content.settings,
    heroCoverUrl: content.settings.hero_cover_url ?? null,
    portraitUrl: content.settings.portrait_url ?? null,
    projects: content.projects.map((project) => ({
      ...project,
      coverUrl: project.images.find((image) => image.storage_path === project.cover_path && image.url)?.url ?? project.images.find((image) => image.url)?.url ?? null,
    })),
    steps: content.steps,
  }), [content]);

  const sendPreview = useCallback(() => {
    if (frame.current?.contentWindow) {
      frame.current.contentWindow.postMessage({ type: "ilyc-landing-preview", content: previewContent }, window.location.origin);
    }
  }, [previewContent]);

  useEffect(() => { sendPreview(); }, [sendPreview]);

  return <div className="section-preview full-landing-preview"><PreviewHeading /><iframe ref={frame} className="landing-section-frame" src="/ilyc-landing-page-select-ensaio.html?preview=full" title="Prévia compacta da landing page" onLoad={sendPreview} /></div>;
}

function PublishToggle({ checked, onChange, label }: { checked: boolean; onChange: (value: boolean) => void; label: string }) {
  return <label className="publish-toggle"><span><strong>{label}</strong><small>{checked ? "A landing exibe o conteúdo publicado." : "A landing mantém o conteúdo fora do ar até você publicar."}</small></span><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} /></label>;
}

function ImageField({ label, imageUrl, crop, shape = "rectangle", onFile, onCropChange, onRemove, onError }: { label: string; imageUrl?: string | null; crop: CropValues; shape?: "rectangle" | "cover" | "circle"; onFile: (file: File, crop: CropValues) => Promise<void>; onCropChange: (crop: CropValues) => Promise<void>; onRemove?: () => Promise<void>; onError: (error: unknown) => void }) {
  const [uploading, setUploading] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [cropOpen, setCropOpen] = useState(false);
  async function change(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setCropFile(file);
    setCropOpen(true);
    event.target.value = "";
  }
  async function applyCrop(next: CropValues) {
    setUploading(true);
    try {
      if (cropFile) await onFile(cropFile, next);
      else await onCropChange(next);
      setCropFile(null);
      setCropOpen(false);
    } catch (error) { onError(error); }
    finally { setUploading(false); }
  }
  async function remove() {
    if (!onRemove) return;
    setRemoving(true);
    try { await onRemove(); } catch (error) { onError(error); } finally { setRemoving(false); }
  }
  return <div className={`image-field image-field-${shape}`}><span className="content-field-label">{label}</span><div className="image-field-preview-wrap"><div className={`image-field-preview-frame is-${shape}`}>{imageUrl ? <CropPreviewImage className="image-field-preview" src={imageUrl} alt={`${label} atual`} crop={crop} /> : <div className="image-field-empty">Nenhuma foto enviada</div>}</div></div><div className="image-field-actions"><label className="button button-outline image-upload-button">{uploading ? "Salvando foto…" : imageUrl ? "Trocar foto" : "Adicionar foto"}<input type="file" accept="image/jpeg,image/png,image/webp,image/avif" onChange={change} disabled={uploading || removing} /></label><button className="button button-outline image-remove-action" type="button" onClick={() => void remove()} disabled={!imageUrl || removing || uploading} aria-label={`Remover ${label.toLocaleLowerCase("pt-BR")}`} title={imageUrl ? `Excluir ${label.toLocaleLowerCase("pt-BR")}` : "Nenhuma foto para remover"}>{removing ? "Removendo…" : "× Remover foto"}</button>{imageUrl && <button className="button button-outline" type="button" onClick={() => { setCropFile(null); setCropOpen(true); }} disabled={uploading || removing}>Ajustar enquadramento</button>}</div><small>JPG, PNG, WebP ou AVIF · até 4 MB (limite da Vercel)</small>{cropOpen && <CropDialog key={cropFile ? `file-${cropFile.name}-${cropFile.size}-${cropFile.lastModified}` : `url-${imageUrl ?? "empty"}`} label={label} src={cropFile ? undefined : imageUrl ?? undefined} file={cropFile ?? undefined} shape={shape} initial={crop} onCancel={() => { setCropFile(null); setCropOpen(false); }} onApply={applyCrop} />}</div>;
}

function FullPhotoPreview({ src, alt }: { src: string; alt: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} loading="lazy" />;
}

function CropPreviewImage({ src, alt, className, crop }: { src: string; alt: string; className?: string; crop: CropValues }) {
  const imageRef = useRef<HTMLImageElement>(null);
  const [imageSize, setImageSize] = useState<{ width: number; height: number } | null>(null);
  const [frameSize, setFrameSize] = useState<{ width: number; height: number } | null>(null);
  useEffect(() => {
    const frame = imageRef.current?.parentElement;
    if (!frame) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setFrameSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(frame);
    return () => observer.disconnect();
  }, []);
  const scale = imageSize && frameSize ? Math.max(frameSize.width / imageSize.width, frameSize.height / imageSize.height) * crop.zoom : 0;
  const width = imageSize ? imageSize.width * scale : 0;
  const height = imageSize ? imageSize.height * scale : 0;
  const style: CSSProperties = scale > 0
    ? { position: "absolute", left: -Math.max(0, width - (frameSize?.width ?? 0)) * crop.x / 100, top: -Math.max(0, height - (frameSize?.height ?? 0)) * crop.y / 100, width, height, maxWidth: "none", maxHeight: "none", objectFit: "fill" }
    : { position: "absolute", inset: 0, width: "100%", height: "100%", maxWidth: "none", objectFit: "cover" };
  // eslint-disable-next-line @next/next/no-img-element
  return <img ref={imageRef} className={className} src={src} alt={alt} style={style} onLoad={(event) => setImageSize({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })} />;
}

function CropDialog({ label, src, file, shape, frameAspectRatio, allowFitMode = false, initial, onCancel, onApply }: { label: string; src?: string; file?: File; shape: "rectangle" | "cover" | "circle"; frameAspectRatio?: number; allowFitMode?: boolean; initial: CropValues; onCancel: () => void; onApply: (crop: CropValues) => void | Promise<void> }) {
  const [values, setValues] = useState(initial);
  const [applying, setApplying] = useState(false);
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState("");
  const [imageSize, setImageSize] = useState<{ width: number; height: number } | null>(null);
  const [frameSize, setFrameSize] = useState<{ width: number; height: number } | null>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const dragOrigin = useRef<{ pointerX: number; pointerY: number; cropX: number; cropY: number } | null>(null);
  const effectiveFrameAspectRatio = frameAspectRatio ?? (shape === "circle" ? 1 : shape === "cover" ? 3 / 4.3 : 4 / 3);
  useEffect(() => {
    if (!file) return;
    const objectUrl = URL.createObjectURL(file);
    const ready = window.setTimeout(() => setFileUrl(objectUrl), 0);
    return () => {
      window.clearTimeout(ready);
      URL.revokeObjectURL(objectUrl);
    };
  }, [file]);
  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      setFrameSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(frame);
    return () => observer.disconnect();
  }, []);
  const previewUrl = src ?? fileUrl;
  const cropTargetLabel = label.toLocaleLowerCase("pt-BR") === "ensaio" ? "a foto do ensaio" : label.toLocaleLowerCase("pt-BR");
  const borderRadius = shape === "circle" ? "50%" : shape === "cover" ? "999px 999px 0 0" : "0";
  const imageScale = imageSize && frameSize ? Math.max(frameSize.width / imageSize.width, frameSize.height / imageSize.height) * values.zoom : 0;
  const renderedWidth = imageSize ? imageSize.width * imageScale : 0;
  const renderedHeight = imageSize ? imageSize.height * imageScale : 0;
  const overflowX = frameSize ? Math.max(0, renderedWidth - frameSize.width) : 0;
  const overflowY = frameSize ? Math.max(0, renderedHeight - frameSize.height) : 0;
  const imageStyle: CSSProperties = (values.fitMode ?? "cover") === "contain"
    ? { position: "absolute", inset: 0, width: "100%", height: "100%", maxWidth: "none", maxHeight: "none", objectFit: "contain", objectPosition: "center", pointerEvents: "none" }
    : imageSize && frameSize && imageScale > 0
      ? { position: "absolute", left: -(overflowX * values.x / 100), top: -(overflowY * values.y / 100), width: renderedWidth, height: renderedHeight, maxWidth: "none", maxHeight: "none", objectFit: "fill", pointerEvents: "none" }
      : { position: "absolute", inset: 0, width: "100%", height: "100%", maxWidth: "none", objectFit: "cover", objectPosition: `${values.x}% ${values.y}%`, transform: `scale(${values.zoom})`, pointerEvents: "none" };
  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    if ((values.fitMode ?? "cover") === "contain") return;
    event.preventDefault();
    dragOrigin.current = { pointerX: event.clientX, pointerY: event.clientY, cropX: values.x, cropY: values.y };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    if ((values.fitMode ?? "cover") === "contain") return;
    const origin = dragOrigin.current;
    if (!origin || !frameSize || !imageSize) return;
    const scale = Math.max(frameSize.width / imageSize.width, frameSize.height / imageSize.height) * values.zoom;
    const availableX = Math.max(0, imageSize.width * scale - frameSize.width);
    const availableY = Math.max(0, imageSize.height * scale - frameSize.height);
    const deltaX = event.clientX - origin.pointerX;
    const deltaY = event.clientY - origin.pointerY;
    setValues((current) => ({
      ...current,
      x: availableX > 0 ? Math.max(0, Math.min(100, origin.cropX - (deltaX / availableX) * 100)) : current.x,
      y: availableY > 0 ? Math.max(0, Math.min(100, origin.cropY - (deltaY / availableY) * 100)) : current.y,
    }));
  }
  async function apply() {
    if (applying) return;
    setApplying(true);
    try { await onApply(values); }
    finally { setApplying(false); }
  }
  return (
    <div className="crop-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !applying) onCancel(); }}>
      <section className="crop-dialog crop-dialog--photo" role="dialog" aria-modal="true" aria-labelledby="crop-dialog-title">
        <div className="crop-dialog-header">
          <div><p className="eyebrow">Enquadramento da landing</p><h3 id="crop-dialog-title">Posicione {cropTargetLabel}</h3></div>
          <button type="button" className="crop-dialog-close" onClick={onCancel} disabled={applying} aria-label="Fechar enquadramento">×</button>
        </div>
        <div className="crop-dialog-stage">
          <div ref={frameRef} className={`crop-dialog-frame is-${shape}`} style={{ borderRadius, aspectRatio: String(effectiveFrameAspectRatio), touchAction: "none", cursor: (values.fitMode ?? "cover") === "contain" ? "default" : "grab", "--frame-aspect-ratio": effectiveFrameAspectRatio } as CSSProperties} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={() => { dragOrigin.current = null; }} onPointerCancel={() => { dragOrigin.current = null; }} onLostPointerCapture={() => { dragOrigin.current = null; }}>
            {previewUrl && <PreviewImage key={previewUrl} src={previewUrl} alt={`Prévia do recorte de ${label}`} onLoad={(event) => { setImageSize({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight }); setPreviewError(""); }} onError={() => setPreviewError("A foto foi selecionada, mas o navegador não conseguiu decodificá-la. Tente salvar uma cópia em JPG ou PNG.")} style={imageStyle} />}
            {!previewUrl && !previewError && <span className="crop-dialog-preview-loading">Lendo arquivo…</span>}
          </div>
        </div>
        {previewError && <p className="crop-dialog-preview-error" role="alert">{previewError}{file && <small> · {file.name} ({file.type || "tipo não identificado"})</small>}</p>}
        <aside className="crop-dialog-panel">
          {allowFitMode && <fieldset className="crop-fit-options"><legend>Exibição da foto</legend><button type="button" className={(values.fitMode ?? "cover") === "cover" ? "is-selected" : ""} aria-pressed={(values.fitMode ?? "cover") === "cover"} onClick={() => setValues((current) => ({ ...current, fitMode: "cover" }))}><strong>Preencher moldura</strong><small>Recorta o que não couber.</small></button><button type="button" className={(values.fitMode ?? "cover") === "contain" ? "is-selected" : ""} aria-pressed={(values.fitMode ?? "cover") === "contain"} onClick={() => setValues((current) => ({ ...current, fitMode: "contain" }))}><strong>Mostrar foto inteira</strong><small>Mantém toda a imagem visível.</small></button></fieldset>}
          {(values.fitMode ?? "cover") === "cover" ? <><div className="crop-dialog-controls"><label>Zoom <input type="range" min="1" max="2" step="0.01" value={values.zoom} onChange={(event) => setValues((current) => ({ ...current, zoom: Number(event.target.value) }))} /></label></div><p className="crop-dialog-help">Arraste a foto na moldura para ajustar o enquadramento.</p></> : <p className="crop-dialog-help">A proporção original será preservada. Se sobrar espaço, o fundo da moldura continuará visível.</p>}
        </aside>
        <div className="crop-dialog-actions"><button type="button" className="button button-outline" onClick={onCancel} disabled={applying}>Cancelar</button><button type="button" className="button button-yellow" onClick={() => void apply()} disabled={!!previewError || !previewUrl || applying}>{applying ? "Salvando…" : "Confirmar foto"}</button></div>
      </section>
    </div>
  );
}

function projectPhotoAspectRatio(index: number) {
  // These ratios mirror the seven fixed gallery slots in the reference HTML.
  return index === 0 || index >= 5 ? 3 / 2 : 1;
}

function ProjectCard({ project, onChange, onSave, onAddPhoto, onReplacePhoto, onCropPhoto, onRemovePhoto, onDelete, onError }: { project: PortfolioProject; onChange: (values: Partial<PortfolioProject>) => void; onSave: (values: Record<string, unknown>) => Promise<void>; onAddPhoto: (file: File, crop: CropValues) => Promise<void>; onReplacePhoto: (photoId: string, file: File, crop: CropValues) => Promise<void>; onCropPhoto: (photoId: string, crop: CropValues) => Promise<void>; onRemovePhoto: (photoId: string) => Promise<void>; onDelete: () => Promise<void>; onError: (error: unknown) => void }) {
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [cropQueue, setCropQueue] = useState<Array<{ file: File; replacePhotoId?: string }>>([]);
  const [editingPhoto, setEditingPhoto] = useState<PortfolioProject["images"][number] | null>(null);

  async function save() {
    setBusy(true);
    try {
      await onSave({ title: project.title, year: project.year, location: project.location, description: project.description, sort_order: project.sort_order, is_published: project.is_published });
    } catch (error) { onError(error); }
    finally { setBusy(false); }
  }

  function upload(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []).slice(0, Math.max(0, 7 - project.images.length - cropQueue.length));
    if (files.length) setCropQueue(files.map((file) => ({ file })));
    event.target.value = "";
  }

  function replacePhoto(photoId: string, event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) setCropQueue((current) => [...current, { file, replacePhotoId: photoId }]);
    event.target.value = "";
  }

  async function applyPhotoCrop(crop: CropValues) {
    setBusy(true);
    try {
      if (editingPhoto) {
        await onCropPhoto(editingPhoto.id, crop);
        setEditingPhoto(null);
        return;
      }
      const queued = cropQueue[0];
      if (!queued) return;
      if (queued.replacePhotoId) await onReplacePhoto(queued.replacePhotoId, queued.file, crop);
      else await onAddPhoto(queued.file, crop);
      setCropQueue((current) => current.slice(1));
    } catch (error) { onError(error); }
    finally { setBusy(false); }
  }

  async function remove() {
    setDeleting(true);
    try { await onDelete(); }
    catch (error) { onError(error); }
    finally { setDeleting(false); }
  }

  async function removePhoto(photoId: string) {
    if (!window.confirm("Remover esta foto da landing?")) return;
    setBusy(true);
    try { await onRemovePhoto(photoId); }
    catch (error) { onError(error); }
    finally { setBusy(false); }
  }

  return <article className="content-item-card">
    <div className="content-item-top"><div><p className="eyebrow">Ensaio · {String(project.sort_order + 1).padStart(2, "0")}</p><h4>{project.title || "Novo ensaio"}</h4></div><PublishToggle checked={project.is_published} label={project.is_published ? "Publicado" : "Rascunho"} onChange={(value) => onChange({ is_published: value })} /></div>
    <div className="content-form content-form-compact">
      <Field label="Nome do ensaio" value={project.title} onChange={(title) => onChange({ title })} placeholder="Ex.: Ensaio de gestante da Ana" maxLength={160} />
      <Field label="Ano" value={project.year?.toString() ?? ""} onChange={(value) => onChange({ year: value ? Number(value) : null })} placeholder="Ex.: 2025" type="number" min={1900} max={2200} />
      <Field label="Local" value={project.location} onChange={(location) => onChange({ location })} placeholder="Ex.: Parque Ibirapuera, São Paulo" maxLength={160} />
      <Field label="Ordem de exibição" value={String(project.sort_order)} onChange={(value) => onChange({ sort_order: Number(value) || 0 })} placeholder="Ex.: 1" type="number" min={0} />
      <Field label="Descrição" value={project.description} onChange={(description) => onChange({ description })} placeholder="Conte em poucas linhas a história deste ensaio." maxLength={4000} wide multiline />
    </div>
    <div className="project-photos"><div className="content-list-heading"><div><p className="eyebrow">Fotos do ensaio · {project.images.length}/7</p><h5>{project.images.length} {project.images.length === 1 ? "foto" : "fotos"}</h5></div><label className={`button button-outline image-upload-button${project.images.length >= 7 ? " is-disabled" : ""}`}>{project.images.length >= 7 ? "Limite de 7 fotos" : "Adicionar fotos"}<input type="file" multiple accept="image/jpeg,image/png,image/webp,image/avif" onChange={upload} disabled={busy || project.images.length >= 7} /></label></div><p className="project-gallery-note">Galeria independente da foto de capa principal. O HTML mantém o formato fixo: fotos 1, 6 e 7 em 3:2; fotos 2 a 5 quadradas.</p>
      {project.images.length > 0 ? <div className="project-photo-grid">{project.images.map((photo, photoIndex) => <div key={photo.id} className="project-photo-card"><div className="project-photo">{photo.url && <FullPhotoPreview src={photo.url} alt={photo.alt_text || project.title} />}</div><div className="project-photo-actions"><button className="project-photo-remove-button" type="button" onClick={() => void removePhoto(photo.id)} disabled={busy} aria-label={`Remover foto de ${project.title}`} title="Excluir foto">×</button><label className="button button-outline photo-replace-button">Trocar<input type="file" accept="image/jpeg,image/png,image/webp,image/avif" onChange={(event) => replacePhoto(photo.id, event)} disabled={busy} /></label><button className="button button-outline photo-crop-button" type="button" onClick={() => setEditingPhoto(photo)} disabled={busy} aria-label={`Ajustar enquadramento de ${photo.alt_text || project.title}`}>Ajustar</button></div><small>Foto {photoIndex + 1} · {photoIndex === 0 || photoIndex >= 5 ? "3:2" : "1:1"} na landing</small></div>)}</div> : <p className="empty-photo-note">Adicione fotos para montar a galeria desse ensaio.</p>}
    </div>
    <div className="content-item-actions"><button className="button button-yellow" type="button" onClick={() => void save()} disabled={busy || deleting}>{busy ? "Salvando…" : project.is_published ? "Salvar e publicar ensaio" : "Salvar como rascunho"}</button><button className="danger-text-button" type="button" onClick={() => void remove()} disabled={busy || deleting}>{deleting ? "Removendo…" : "Remover ensaio"}</button></div>
    {cropQueue.length > 0 && <CropDialog key={`${cropQueue[0].file.name}-${cropQueue[0].file.lastModified}`} label="ensaio" file={cropQueue[0].file} shape="rectangle" allowFitMode frameAspectRatio={projectPhotoAspectRatio(cropQueue[0].replacePhotoId ? project.images.findIndex((photo) => photo.id === cropQueue[0].replacePhotoId) : project.images.length)} initial={cropQueue[0].replacePhotoId ? (() => { const photo = project.images.find((entry) => entry.id === cropQueue[0].replacePhotoId); return { x: photo?.crop_x ?? 50, y: photo?.crop_y ?? 50, zoom: photo?.crop_zoom ?? 1, fitMode: photo?.fit_mode ?? "cover" }; })() : { x: 50, y: 50, zoom: 1, fitMode: "cover" }} onCancel={() => setCropQueue([])} onApply={applyPhotoCrop} />}
    {editingPhoto && <CropDialog label="ensaio" src={editingPhoto.url ?? undefined} shape="rectangle" allowFitMode frameAspectRatio={projectPhotoAspectRatio(project.images.findIndex((photo) => photo.id === editingPhoto.id))} initial={{ x: editingPhoto.crop_x ?? 50, y: editingPhoto.crop_y ?? 50, zoom: editingPhoto.crop_zoom ?? 1, fitMode: editingPhoto.fit_mode ?? "cover" }} onCancel={() => setEditingPhoto(null)} onApply={applyPhotoCrop} />}
  </article>;
}

function CollectionEditor<T extends ProcessStep | FaqItem>({ title, eyebrow, items, kind, onDraftChange, onCreate, onSave, onDelete, onError }: { title: string; eyebrow: string; items: T[]; kind: "step" | "faq"; onDraftChange: (item: T, values: Record<string, unknown>) => void; onCreate: () => Promise<void>; onSave: (item: T, values: Record<string, unknown>) => Promise<void>; onDelete: (item: T) => Promise<void>; onError: (error: unknown) => void }) {
  return <div className="content-list-section"><div className="content-list-heading"><div><p className="eyebrow">{eyebrow}</p><h3>{title}</h3></div><button className="button button-yellow" type="button" disabled={kind === "step" && items.length >= 3} onClick={() => void onCreate().catch(onError)}>+ Adicionar</button></div>{items.map((item) => <CollectionItem key={item.id} item={item} kind={kind} onDraftChange={onDraftChange} onSave={onSave} onDelete={onDelete} onError={onError} />)}{items.length === 0 && <EmptyState title="Nada cadastrado ainda" copy="Adicione o primeiro item e escolha quando ele deve aparecer na landing." />}</div>;
}

function CollectionItem<T extends ProcessStep | FaqItem>({ item, kind, onDraftChange, onSave, onDelete, onError }: { item: T; kind: "step" | "faq"; onDraftChange: (item: T, values: Record<string, unknown>) => void; onSave: (item: T, values: Record<string, unknown>) => Promise<void>; onDelete: (item: T) => Promise<void>; onError: (error: unknown) => void }) {
  const [title, setTitle] = useState(kind === "faq" ? (item as FaqItem).question : (item as ProcessStep).title);
  const [description, setDescription] = useState(kind === "faq" ? (item as FaqItem).answer : (item as ProcessStep).description);
  const [sortOrder, setSortOrder] = useState(item.sort_order);
  const [published, setPublished] = useState(item.is_published);
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);
  async function save() { setBusy(true); try { await onSave(item, { ...(kind === "faq" ? { question: title, answer: description } : { title, description }), sort_order: sortOrder, is_published: published }); } catch (error) { onError(error); } finally { setBusy(false); } }
  async function remove() { setDeleting(true); try { await onDelete(item); } catch (error) { onError(error); } finally { setDeleting(false); } }
  function updateTitle(value: string) { setTitle(value); onDraftChange(item, kind === "faq" ? { question: value } : { title: value }); }
  function updateDescription(value: string) { setDescription(value); onDraftChange(item, kind === "faq" ? { answer: value } : { description: value }); }
  function updateSortOrder(value: string) { const next = Number(value) || 0; setSortOrder(next); onDraftChange(item, { sort_order: next }); }
  function updatePublished(value: boolean) { setPublished(value); onDraftChange(item, { is_published: value }); }
  return <article className="content-item-card collection-item"><div className="content-item-top"><div><p className="eyebrow">{kind === "faq" ? "Pergunta" : `Etapa ${String((item as ProcessStep).step_number).padStart(2, "0")}`}</p><h4>{title}</h4></div><PublishToggle checked={published} label={published ? "Publicado" : "Rascunho"} onChange={updatePublished} /></div><div className="content-form content-form-compact"><Field label={kind === "faq" ? "Pergunta" : "Nome da etapa"} value={title} onChange={updateTitle} placeholder={kind === "faq" ? "Ex.: Como funciona o pagamento?" : "Ex.: Primeiro contato"} maxLength={kind === "faq" ? 400 : 160} /><Field label="Ordem de exibição" value={String(sortOrder)} onChange={updateSortOrder} type="number" min={0} /><Field label={kind === "faq" ? "Resposta" : "Descrição"} value={description} onChange={updateDescription} placeholder={kind === "faq" ? "Escreva uma resposta objetiva." : "Ex.: Conversamos sobre sua ideia, local e data."} maxLength={4000} wide multiline /></div><div className="content-item-actions"><button className="button button-yellow" type="button" onClick={() => void save()} disabled={busy || deleting}>{busy ? "Salvando…" : "Salvar"}</button><button className="danger-text-button" type="button" onClick={() => void remove()} disabled={busy || deleting}>{deleting ? "Removendo…" : "Remover"}</button></div></article>;
}

function EmptyState({ title, copy }: { title: string; copy: string }) {
  return <div className="content-empty-state"><span aria-hidden="true">✳</span><h4>{title}</h4><p>{copy}</p></div>;
}

function makeWhatsAppUrl(value: string) {
  let digits = value.replace(/\D/g, "");
  if (digits.length === 13 && digits.startsWith("55")) digits = digits.slice(2);
  if (digits.length !== 10 && digits.length !== 11) return "";
  const internationalNumber = `55${digits}`;
  return `https://wa.me/${internationalNumber}`;
}

function formatBrazilPhone(value: string) {
  let digits = value.replace(/\D/g, "");
  if (digits.length > 11 && digits.startsWith("55")) digits = digits.slice(2);
  digits = digits.slice(0, 11);
  if (digits.length <= 2) return digits ? `(${digits}` : "";
  const areaCode = digits.slice(0, 2);
  const number = digits.slice(2);
  if (!number) return `(${areaCode})`;
  const firstPartLength = number.startsWith("9") ? 5 : 4;
  const firstPart = number.slice(0, firstPartLength);
  const secondPart = number.slice(firstPartLength);
  return `(${areaCode}) ${firstPart}${secondPart ? `-${secondPart}` : ""}`;
}

function getWhatsAppNumber(value: string) {
  try {
    const digits = new URL(value).pathname.replace(/\D/g, "");
    return digits.startsWith("55") ? digits.slice(2) : digits;
  } catch {
    return value.replace(/\D/g, "").replace(/^55/, "");
  }
}
