export const TALENT_CATEGORY_OPTIONS = [
  { label: "Ator / Atriz", value: "Ator / Atriz", aliases: ["Actor"] },
  { label: "Modelo", value: "Modelo", aliases: ["Model"] },
  { label: "Influenciador(a)", value: "Influenciador(a)", aliases: ["Influencer"] },
  { label: "Dançarino(a)", value: "Dançarino(a)", aliases: ["Dancer"] },
  { label: "Cantor(a)", value: "Cantor(a)", aliases: ["Singer"] },
  { label: "Comediante", value: "Comediante", aliases: ["Comedian", "Comedy"] },
  { label: "Apresentador(a)", value: "Apresentador(a)", aliases: ["Presenter"] },
  { label: "Criador(a) de Conteúdo", value: "Criador(a) de Conteúdo", aliases: ["Content Creator"] },
  { label: "Fotógrafo(a)", value: "Fotógrafo(a)", aliases: ["Photographer"] },
  { label: "Atleta", value: "Atleta", aliases: ["Athlete", "Sports"] },
  { label: "Lifestyle e Moda", value: "Lifestyle e Moda", aliases: ["Lifestyle & Fashion"] },
  { label: "Tecnologia", value: "Tecnologia", aliases: ["Technology"] },
  { label: "Gastronomia", value: "Gastronomia", aliases: ["Food & Cooking"] },
  { label: "Saúde e Fitness", value: "Saúde e Fitness", aliases: ["Health & Fitness"] },
  { label: "Viagens", value: "Viagens", aliases: ["Travel"] },
  { label: "Beleza", value: "Beleza", aliases: ["Beauty"] },
  { label: "Games", value: "Games", aliases: ["Gaming"] },
  { label: "Música", value: "Música", aliases: ["Music"] },
  { label: "Educação", value: "Educação", aliases: ["Education"] },
  { label: "Produção Audiovisual", value: "Produção Audiovisual", aliases: [] },
  { label: "UGC / Conteúdo para marcas", value: "UGC / Conteúdo para marcas", aliases: [] },
  { label: "Locução / Voz", value: "Locução / Voz", aliases: [] },
  { label: "Outro", value: "Outro", aliases: ["Other"] },
];

export const TALENT_CATEGORY_LABELS = TALENT_CATEGORY_OPTIONS.map((option) => option.label);

function normaliseCategoryKey(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

const CATEGORY_LABEL_BY_VALUE = new Map<string, string>();

for (const option of TALENT_CATEGORY_OPTIONS) {
  for (const key of [option.value, option.label, ...option.aliases]) {
    CATEGORY_LABEL_BY_VALUE.set(key, option.label);
    CATEGORY_LABEL_BY_VALUE.set(normaliseCategoryKey(key), option.label);
  }
}

export function talentCategoryLabel(category: string | null | undefined) {
  if (!category) return "";
  return CATEGORY_LABEL_BY_VALUE.get(category) ?? CATEGORY_LABEL_BY_VALUE.get(normaliseCategoryKey(category)) ?? category.trim();
}

const CATEGORY_EN_BY_PT: Record<string, string> = {
  "Ator / Atriz":             "Actor / Actress",
  "Modelo":                   "Model",
  "Influenciador(a)":         "Influencer",
  "Dançarino(a)":             "Dancer",
  "Cantor(a)":                "Singer",
  "Comediante":               "Comedian",
  "Apresentador(a)":          "Presenter / Host",
  "Criador(a) de Conteúdo":   "Content Creator",
  "Fotógrafo(a)":             "Photographer",
  "Atleta":                   "Athlete",
  "Lifestyle e Moda":         "Lifestyle & Fashion",
  "Tecnologia":               "Technology",
  "Gastronomia":              "Food & Cooking",
  "Saúde e Fitness":          "Health & Fitness",
  "Viagens":                  "Travel",
  "Beleza":                   "Beauty",
  "Games":                    "Gaming",
  "Música":                   "Music",
  "Educação":                 "Education",
  "Produção Audiovisual":     "Audiovisual Production",
  "UGC / Conteúdo para marcas":"UGC / Brand Content",
  "Locução / Voz":            "Voiceover / Voice Acting",
  "Outro":                    "Other",
};

export function talentCategoryLabelForLang(category: string | null | undefined, lang: string): string {
  const ptLabel = talentCategoryLabel(category);
  if (lang === "en" || lang === "en-US") {
    return CATEGORY_EN_BY_PT[ptLabel] ?? ptLabel;
  }
  return ptLabel;
}

export function talentCategoryMatches(category: string, selected: string) {
  const categoryLabel = talentCategoryLabel(category);
  const selectedLabel = talentCategoryLabel(selected);

  return (
    normaliseCategoryKey(category) === normaliseCategoryKey(selected) ||
    normaliseCategoryKey(categoryLabel) === normaliseCategoryKey(selected) ||
    normaliseCategoryKey(categoryLabel) === normaliseCategoryKey(selectedLabel)
  );
}
