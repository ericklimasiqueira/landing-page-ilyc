export type PortfolioItem = {
  number: string;
  title: string;
  year: string;
  shape: "wide" | "arch" | "circle";
};

export const siteContent = {
  brand: "Ilyc",
  city: "[CIDADE — UF]",
  tagline: "Entre a luz e a sombra, o seu instante.",
  portfolioTitle: "Ensaios selecionados",
  portfolio: [
    { number: "01", title: "[TÍTULO DO ENSAIO]", year: "[ANO]", shape: "wide" },
    { number: "02", title: "[TÍTULO DO ENSAIO]", year: "[ANO]", shape: "arch" },
    { number: "03", title: "[TÍTULO DO ENSAIO]", year: "[ANO]", shape: "circle" },
  ] satisfies PortfolioItem[],
  aboutTitle: "Por trás da lente",
  biography: "[BIO: conte quem você é, como começou a fotografar e como é o seu jeito de trabalhar.]",
  contactEmail: "[SEU E-MAIL]",
  instagram: "[@SEU_INSTAGRAM]",
};
