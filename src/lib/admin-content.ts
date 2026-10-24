export type SiteSettings = {
  brand_name: string;
  city: string;
  hero_tagline: string;
  hero_cover_path: string | null;
  hero_cover_crop_x: number;
  hero_cover_crop_y: number;
  hero_cover_crop_zoom: number;
  portfolio_heading: string;
  about_heading: string;
  biography: string;
  portrait_path: string | null;
  portrait_crop_x: number;
  portrait_crop_y: number;
  portrait_crop_zoom: number;
  start_year: number | null;
  service_region: string;
  contact_heading: string;
  contact_email: string;
  whatsapp_url: string;
  instagram_url: string;
  starting_price_label: string;
  is_published: boolean;
};

export type PortfolioPhoto = {
  id: string;
  storage_path: string;
  alt_text: string;
  sort_order: number;
  url?: string | null;
  crop_x: number;
  crop_y: number;
  crop_zoom: number;
  fit_mode: "cover" | "contain";
};

export type PortfolioProject = {
  id: string;
  title: string;
  year: number | null;
  location: string;
  description: string;
  cover_path: string | null;
  sort_order: number;
  is_published: boolean;
  images: PortfolioPhoto[];
};

export type ProcessStep = {
  id: string;
  step_number: number;
  title: string;
  description: string;
  sort_order: number;
  is_published: boolean;
};

export type FaqItem = {
  id: string;
  question: string;
  answer: string;
  sort_order: number;
  is_published: boolean;
};

export type AdminContent = {
  settings: SiteSettings;
  projects: PortfolioProject[];
  steps: ProcessStep[];
  faq: FaqItem[];
};

export const defaultSiteSettings: SiteSettings = {
  brand_name: "Ilyc",
  city: "",
  hero_tagline: "Entre a luz e a sombra, o seu instante.",
  hero_cover_path: null,
  hero_cover_crop_x: 50,
  hero_cover_crop_y: 50,
  hero_cover_crop_zoom: 1,
  portfolio_heading: "Ensaios selecionados",
  about_heading: "Por trás da lente",
  biography: "",
  portrait_path: null,
  portrait_crop_x: 50,
  portrait_crop_y: 50,
  portrait_crop_zoom: 1,
  start_year: null,
  service_region: "",
  contact_heading: "Vamos marcar o seu ensaio?",
  contact_email: "",
  whatsapp_url: "",
  instagram_url: "",
  starting_price_label: "",
  is_published: false,
};
