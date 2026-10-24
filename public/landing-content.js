(() => {
  const sourceTextByNode = new WeakMap();
  const cropObservers = new WeakMap();

  const textNodes = (root = document.body) => {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    return nodes;
  };

  const replaceAllText = (root, target, value) => {
    for (const node of textNodes(root)) {
      if (!sourceTextByNode.has(node)) sourceTextByNode.set(node, node.nodeValue);
      const sourceText = sourceTextByNode.get(node);
      if (sourceText.trim() === target) node.nodeValue = sourceText.replace(target, value ?? "");
    }
  };

  const safeUrl = (value) => {
    try {
      const url = new URL(value);
      return url.protocol === "https:" || url.protocol === "http:" ? url.href : "";
    } catch {
      return "";
    }
  };

  const formatBrazilPhone = (value) => {
    let digits = String(value ?? "").replace(/\D/g, "");
    if (digits.length > 11 && digits.startsWith("55")) digits = digits.slice(2);
    digits = digits.slice(0, 11);
    if (digits.length <= 2) return digits;
    const ddd = digits.slice(0, 2);
    const number = digits.slice(2);
    const split = number.startsWith("9") ? 5 : 4;
    return `(${ddd}) ${number.slice(0, split)}${number.length > split ? `-${number.slice(split)}` : ""}`;
  };

  const insertImage = (container, url, alt, shape = "cover", crop = {}) => {
    if (!container || !url) return;
    const image = document.createElement("img");
    image.src = url;
    image.alt = alt || "";
    image.loading = "lazy";
    image.style.display = "block";
    container.classList.remove("is-image-loaded", "is-image-error");
    container.classList.add("is-image-loading");
    image.addEventListener("load", () => {
      container.classList.remove("is-image-loading", "is-image-error");
      container.classList.add("is-image-loaded");
    }, { once: true });
    image.addEventListener("error", () => {
      container.classList.remove("is-image-loading", "is-image-loaded");
      container.classList.add("is-image-error");
    }, { once: true });
    // The public API returns the persisted snake_case names; the admin preview
    // uses the shorter x/y/zoom names. Accept both shapes so landing crops match.
    const rawCropX = Number(crop.x ?? crop.crop_x);
    const rawCropY = Number(crop.y ?? crop.crop_y);
    const rawCropZoom = Number(crop.zoom ?? crop.crop_zoom);
    const cropX = Math.min(100, Math.max(0, Number.isFinite(rawCropX) ? rawCropX : 50));
    const cropY = Math.min(100, Math.max(0, Number.isFinite(rawCropY) ? rawCropY : 50));
    const cropZoom = Math.min(2, Math.max(1, Number.isFinite(rawCropZoom) ? rawCropZoom : 1));
    const fitMode = crop.fitMode === "contain" || crop.fit_mode === "contain" ? "contain" : "cover";
    if (shape === "cover" || shape === "fill") {
      container.style.position = "relative";
      container.style.overflow = "hidden";
      image.style.position = "absolute";
      image.style.inset = "0";
      let frame = container;
      if (container.parentElement?.matches("button.tile")) {
        frame = container.parentElement;
        frame.style.overflow = "hidden";
        container.style.borderRadius = getComputedStyle(frame).borderRadius;
        container.style.position = "absolute";
        container.style.inset = "0";
        container.style.width = "100%";
        container.style.height = "100%";
        container.style.zIndex = "0";
        const action = container.parentElement.querySelector(":scope > span:last-child");
        if (action) { action.style.position = "relative"; action.style.zIndex = "1"; }
      }
      const frameRadius = getComputedStyle(frame).borderRadius;
      image.style.borderRadius = frameRadius;
      container.style.borderRadius = frameRadius;
      container.style.clipPath = "none";
      image.style.clipPath = "none";
      const updateCrop = () => {
        if (!image.naturalWidth || !image.naturalHeight) return;
        const frameWidth = container.clientWidth;
        const frameHeight = container.clientHeight;
        if (!frameWidth || !frameHeight) return;
        if (fitMode === "contain") {
          image.style.inset = "0";
          image.style.left = "0";
          image.style.top = "0";
          image.style.width = "100%";
          image.style.height = "100%";
          image.style.maxWidth = "none";
          image.style.maxHeight = "none";
          image.style.objectFit = "contain";
          image.style.objectPosition = "center";
          image.style.transform = "none";
          return;
        }
        const scale = Math.max(frameWidth / image.naturalWidth, frameHeight / image.naturalHeight) * cropZoom;
        const width = image.naturalWidth * scale;
        const height = image.naturalHeight * scale;
        image.style.inset = "auto";
        image.style.left = `${-Math.max(0, width - frameWidth) * cropX / 100}px`;
        image.style.top = `${-Math.max(0, height - frameHeight) * cropY / 100}px`;
        image.style.width = `${width}px`;
        image.style.height = `${height}px`;
        image.style.maxWidth = "none";
        image.style.maxHeight = "none";
        image.style.objectFit = "fill";
        image.style.transform = "none";
      };
      image.addEventListener("load", updateCrop, { once: true });
      cropObservers.get(container)?.disconnect();
      const observer = new ResizeObserver(updateCrop);
      observer.observe(container);
      cropObservers.set(container, observer);
      if (image.complete) updateCrop();
    }
    container.replaceChildren(image);
    if (image.complete) {
      container.classList.remove("is-image-loading");
      container.classList.add(image.naturalWidth ? "is-image-loaded" : "is-image-error");
    }
  };

  const setTextWithin = (root, target, value) => {
    for (const node of textNodes(root)) if (node.nodeValue.trim() === target) node.nodeValue = node.nodeValue.replace(target, value ?? "");
  };

  const portfolioSection = document.getElementById("trabalhos");
  const portfolioGrid = portfolioSection?.querySelector(".works");
  const originalCards = [...(portfolioGrid?.querySelectorAll(":scope > figure") ?? [])].map((node) => node.cloneNode(true));
  const originalDialogs = [...(portfolioSection?.querySelectorAll(":scope > .gal") ?? [])].map((node) => node.cloneNode(true));
  const heroCoverLabel = textNodes(document.body).find((node) => node.nodeValue.trim() === "[FOTO DE CAPA]");
  let heroCoverContainer = heroCoverLabel?.parentElement?.parentElement;
  const originalHeroCoverContainer = heroCoverContainer?.cloneNode(true);
  const portraitLabel = textNodes(document.body).find((node) => node.nodeValue.trim() === "[RETRATO DA FOTÓGRAFA]");
  let portraitContainer = portraitLabel?.parentElement?.parentElement;
  const originalPortraitContainer = portraitContainer?.cloneNode(true);
  const restoreImagePlaceholder = (container, original) => {
    if (!container || !original || !container.querySelector("img")) return container;
    const restored = original.cloneNode(true);
    container.replaceWith(restored);
    return restored;
  };
  const clearImagePlaceholder = (container) => {
    if (!container) return;
    container.querySelector("svg")?.remove();
    for (const span of container.querySelectorAll("span")) {
      if (/^\[[^\]]+\]$/.test(span.textContent.trim())) span.remove();
    }
  };
  const brandHeading = document.querySelector("#topo > section h1");
  const fitBrandHeading = () => {
    if (!brandHeading?.parentElement) return;
    const availableWidth = brandHeading.parentElement.clientWidth;
    if (!availableWidth) return;

    const style = getComputedStyle(brandHeading);
    const baseFontSize = Number(brandHeading.dataset.baseFontSize) || parseFloat(style.fontSize);
    brandHeading.dataset.baseFontSize = String(baseFontSize);
    brandHeading.style.display = "block";
    brandHeading.style.maxWidth = "100%";
    brandHeading.style.minWidth = "0";
    brandHeading.style.overflow = "hidden";
    brandHeading.style.whiteSpace = "nowrap";
    brandHeading.parentElement.style.minWidth = "0";

    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context) return;
    context.font = `${style.fontWeight} ${baseFontSize}px ${style.fontFamily}`;
    const text = brandHeading.textContent || "";
    const letterSpacing = parseFloat(style.letterSpacing) || 0;
    const textWidth = context.measureText(text).width + Math.max(0, text.length - 1) * letterSpacing;
    const fitSize = textWidth > 0 ? baseFontSize * availableWidth / textWidth : baseFontSize;
    brandHeading.style.fontSize = `${Math.max(8, Math.min(baseFontSize, fitSize))}px`;
  };

  if (brandHeading?.parentElement && "ResizeObserver" in window) {
    const brandResizeObserver = new ResizeObserver(fitBrandHeading);
    brandResizeObserver.observe(brandHeading.parentElement);
    document.fonts?.ready.then(fitBrandHeading);
  }

  const applySettings = (settings, heroCoverUrl, portraitUrl) => {
    settings ||= {};
    const brand = settings.brand_name || "Ilyc";
    replaceAllText(document.body, "Ilyc", brand);
    fitBrandHeading();
    const city = settings.city?.trim() || "";
    replaceAllText(document.body, "[CIDADE — UF]", city);
    const heroMetadata = document.querySelector("#topo > section > div:first-child > div:first-child");
    const heroCity = heroMetadata?.querySelector(":scope > span:last-child");
    const citySeparator = heroCity?.previousElementSibling;
    if (heroCity) heroCity.hidden = !city;
    if (citySeparator) citySeparator.hidden = !city;
    replaceAllText(document.body, "Entre a luz e a sombra, o seu instante.", settings.hero_tagline || "Entre a luz e a sombra, o seu instante.");
    replaceAllText(document.body, "Ensaios selecionados", settings.portfolio_heading || "Ensaios selecionados");
    replaceAllText(document.body, "Por trás da lente", settings.about_heading || "Por trás da lente");
    const biography = settings.biography?.trim() || "";
    replaceAllText(document.body, "[BIO: quem é você, como começou a fotografar e como é o seu jeito de trabalhar. Três a quatro linhas, em primeira pessoa.]", biography);
    const biographyNode = document.querySelector("#sobre p");
    if (biographyNode) biographyNode.hidden = !biography;
    replaceAllText(document.body, "[ANO DE INÍCIO]", settings.start_year ? String(settings.start_year) : "");
    replaceAllText(document.body, "[ESTÚDIO / EXTERNO / REGIÃO]", settings.service_region || "");
    const facts = document.querySelectorAll("#sobre > div:nth-of-type(2) > div:last-child > span");
    if (facts[0]) facts[0].hidden = !city;
    if (facts[1]) facts[1].hidden = !settings.start_year;
    if (facts[2]) facts[2].hidden = !settings.service_region;
    replaceAllText(document.body, "Vamos marcar o seu ensaio?", settings.contact_heading || "Vamos marcar o seu ensaio?");
    const pricePlaceholder = textNodes(document.body).find((node) => node.nodeValue.includes("[PREÇO]"));
    pricePlaceholder?.parentElement?.remove();
    for (const path of document.querySelectorAll("textPath")) path.textContent = `ENSAIOS FOTOGRÁFICOS / ${brand.toLocaleUpperCase("pt-BR")} /`;
    document.title = `${brand} — Ensaios fotográficos`;

    if (heroCoverUrl && heroCoverContainer) insertImage(heroCoverContainer, heroCoverUrl, `Foto de capa de ${brand}`, "cover", { x: settings.hero_cover_crop_x, y: settings.hero_cover_crop_y, zoom: settings.hero_cover_crop_zoom });
    else if (!heroCoverUrl) {
      heroCoverContainer = restoreImagePlaceholder(heroCoverContainer, originalHeroCoverContainer);
      clearImagePlaceholder(heroCoverContainer);
    }
    if (portraitUrl && portraitContainer) insertImage(portraitContainer, portraitUrl, `Retrato de ${brand}`, "cover", { x: settings.portrait_crop_x, y: settings.portrait_crop_y, zoom: settings.portrait_crop_zoom });
    else if (!portraitUrl) {
      portraitContainer = restoreImagePlaceholder(portraitContainer, originalPortraitContainer);
      clearImagePlaceholder(portraitContainer);
    }

    const contacts = document.querySelectorAll("#contato .contact-row > div > div");
    for (const contact of contacts) {
      const label = contact.querySelector("span")?.textContent.trim();
      const anchor = contact.querySelector("a");
      if (!anchor) continue;
      if (label === "E-mail") {
        if (settings.contact_email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(settings.contact_email)) {
          contact.hidden = false;
          anchor.textContent = settings.contact_email;
          anchor.href = `mailto:${settings.contact_email}`;
        } else contact.hidden = true;
      }
      if (label === "WhatsApp") {
        const link = safeUrl(settings.whatsapp_url);
        const phone = link ? new URL(link).pathname.replace(/\D/g, "").replace(/^55/, "") : "";
        if (link && phone) { contact.hidden = false; anchor.textContent = formatBrazilPhone(phone); anchor.href = link; anchor.target = "_blank"; anchor.rel = "noreferrer"; }
        else contact.hidden = true;
      }
      if (label === "Instagram") {
        const link = safeUrl(settings.instagram_url);
        const profile = link ? new URL(link) : null;
        const handle = profile && /(^|\.)instagram\.com$/i.test(profile.hostname) ? profile.pathname.split("/").filter(Boolean)[0] : "";
        if (link && handle) { contact.hidden = false; anchor.textContent = `@${handle}`; anchor.href = link; anchor.target = "_blank"; anchor.rel = "noreferrer"; }
        else contact.hidden = true;
      }
    }
  };

  const applyProjects = (projects) => {
    if (!portfolioGrid || !portfolioSection || !originalCards.length || !originalDialogs.length) return;
    portfolioGrid.querySelectorAll(":scope > figure").forEach((node) => node.remove());
    portfolioSection.querySelectorAll(":scope > .gal").forEach((node) => node.remove());
    const displayedCount = projects.length;
    portfolioGrid.hidden = displayedCount === 0;
    for (let index = 0; index < displayedCount; index++) {
      const figure = originalCards[index % originalCards.length].cloneNode(true);
      const dialog = originalDialogs[index % originalDialogs.length].cloneNode(true);
      const number = String(index + 1).padStart(2, "0");
      const dialogId = `ensaio-${number}`;
      dialog.id = dialogId;
      dialog.setAttribute("aria-label", `Ensaio ${number}`);
      dialog.querySelectorAll("[popovertarget]").forEach((target) => target.setAttribute("popovertarget", dialogId));
      const button = figure.querySelector("button.tile");
      if (button) button.setAttribute("popovertarget", dialogId);
      portfolioGrid.append(figure);
      portfolioSection.append(dialog);

      const project = projects[index];
      if (!project) continue;
      if (button) {
        button.setAttribute("aria-label", `Abrir ensaio ${number}: ${project.title}`);
        const coverPlaceholder = button.querySelector(":scope > span");
        if (coverPlaceholder) {
          if (project.coverUrl) insertImage(coverPlaceholder, project.coverUrl, project.title, "cover", project.images?.[0] ?? {});
          else coverPlaceholder.replaceChildren();
        }
      }
      const caption = figure.querySelector("figcaption");
      const captionNumber = caption?.querySelector(":scope > span > span:first-child");
      const captionTitle = caption?.querySelector(":scope > span > span:last-child");
      const captionYear = caption?.querySelector(":scope > span:last-child");
      if (captionNumber) captionNumber.textContent = number;
      if (captionTitle) captionTitle.textContent = project.title || "";
      if (captionYear) captionYear.textContent = project.year ? String(project.year) : "";

      dialog.hidden = false;
      dialog.setAttribute("aria-label", `Ensaio ${number}: ${project.title}`);
      const modalHeader = dialog.firstElementChild;
      const headerValues = modalHeader?.querySelectorAll("span");
      if (headerValues?.[0]) headerValues[0].textContent = number;
      if (headerValues?.[1]) headerValues[1].textContent = project.title || "";
      if (headerValues?.[2]) headerValues[2].textContent = [project.year, project.location].filter(Boolean).join(" / ");
      setTextWithin(dialog, "[TÍTULO DO ENSAIO]", project.title || "");
      setTextWithin(dialog, "[ANO] / [LOCAL]", [project.year, project.location].filter(Boolean).join(" / "));
      const gallery = dialog.querySelector(".g12");
      if (!gallery) continue;
      [...gallery.children].forEach((cell, photoIndex) => {
        const photo = project.images?.[photoIndex];
        const placeholder = textNodes(cell)[0];
        if (!photo) {
          cell.hidden = true;
          return;
        }
        cell.hidden = false;
        if (photo.url && placeholder) insertImage(placeholder.parentElement, photo.url, photo.alt_text || project.title, "fill", photo);
      });
    }
  };

  const applySteps = (steps) => {
    const cards = [...document.querySelectorAll("#servicos > .g12 > div")];
    const grid = cards[0]?.parentElement;
    if (grid) grid.hidden = steps.length === 0;
    cards.forEach((card, index) => {
      const step = steps[index];
      if (!step) { card.hidden = true; return; }
      card.hidden = false;
      const number = card.querySelector("div");
      const title = card.querySelector("h3");
      const description = card.querySelector("p");
      if (number) number.textContent = String(step.step_number).padStart(2, "0");
      if (title) title.textContent = step.title;
      if (description) description.textContent = step.description;
    });
  };

  const previewSection = new URLSearchParams(window.location.search).get("preview");
  const applyContent = (content) => {
    if (!content) return;
    applySettings(content.settings ?? {}, content.settings?.hero_cover_url, content.settings?.portrait_url);
    applyProjects(content.projects || []);
    applySteps(content.steps || []);
    if (previewSection && previewSection !== "full") {
      const root = document.getElementById("topo");
      const children = [...(root?.children ?? [])];
      const keep = previewSection === "home"
        ? new Set([root?.querySelector(":scope > header"), root?.querySelector(":scope > header + section")])
        : new Set([document.getElementById(({ portfolio: "trabalhos", about: "sobre", process: "servicos", contact: "contato" })[previewSection])]);
      children.forEach((child) => { child.hidden = !keep.has(child); });
    }
    document.documentElement.classList.add("landing-content-ready");
  };

  const showLoadError = () => {
    if (document.documentElement.classList.contains("landing-content-ready")) return;
    const loading = document.querySelector("#landing-loading [data-loading-message]");
    if (loading) loading.textContent = "Não foi possível carregar o conteúdo. Tente novamente.";
  };

  if (previewSection) {
    window.addEventListener("message", (event) => {
      if (event.source !== window.parent || event.origin !== window.location.origin || event.data?.type !== "ilyc-landing-preview") return;
      applyContent(event.data.content);
    });
  } else {
    const loadPublicContent = () => fetch("/api/public/landing", { cache: "no-store" })
      .then((response) => {
        if (!response.ok) throw new Error("Conteúdo indisponível.");
        return response.json();
      })
      .then((content) => {
        if (!content) throw new Error("Conteúdo indisponível.");
        if (content.published === false) {
          document.documentElement.classList.add("landing-site-unpublished");
          const loading = document.querySelector("#landing-loading [data-loading-message]");
          if (loading) loading.textContent = "Estamos preparando este site. Volte em breve.";
          return;
        }
        applyContent(content);
      })
      .catch(showLoadError);
    window.addEventListener("storage", (event) => {
      if (event.key === "ilyc-landing-content-updated") loadPublicContent();
    });
    // Load once per document. Focus/visibility changes do not mean content changed;
    // admin edits announce updates through the storage event above.
    loadPublicContent();
  }
})();
