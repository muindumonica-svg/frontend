export type ProductImageKey =
  | "avocado"
  | "broiler-whole-chicken"
  | "chicken-back"
  | "chicken-breast"
  | "chicken-cubes"
  | "chicken-cutlet"
  | "chicken-feet"
  | "chicken-gizzards-portions"
  | "chicken-gizzards"
  | "chicken-hearts"
  | "chicken-legs"
  | "chicken-liver-portions"
  | "chicken-liver"
  | "chicken-mid-wings"
  | "chicken-neck"
  | "chicken-offal"
  | "chicken-skin"
  | "chicken-soup"
  | "chicken-stock"
  | "chicken-strips"
  | "chicken-tenders"
  | "chicken-thighs"
  | "chicken-wings"
  | "cracked-eggs"
  | "drumsticks"
  | "egg-tray"
  | "eggs"
  | "kienyeji-whole-chicken"
  | "minced-chicken"
  | "poultry-mix"
  | "roasted-chicken"
  | "whole-chicken";

export const PRODUCT_IMAGE_ASSETS: Record<ProductImageKey, string> = {
  avocado: "/assets/products/avocado.png",
  "broiler-whole-chicken": "/assets/products/broiler-whole-chicken.webp",
  "chicken-back": "/assets/products/chicken-back.png",
  "chicken-breast": "/assets/products/chicken-breast.png",
  "chicken-cubes": "/assets/products/chicken-cubes.png",
  "chicken-cutlet": "/assets/products/chicken-cutlet.png",
  "chicken-feet": "/assets/products/chicken-feet.png",
  "chicken-gizzards-portions": "/assets/products/chicken-gizzards-portions.png",
  "chicken-gizzards": "/assets/products/chicken-gizzards.png",
  "chicken-hearts": "/assets/products/chicken-hearts.png",
  "chicken-legs": "/assets/products/chicken-legs.png",
  "chicken-liver-portions": "/assets/products/chicken-liver-portions.png",
  "chicken-liver": "/assets/products/chicken-liver.png",
  "chicken-mid-wings": "/assets/products/chicken-mid-wings.png",
  "chicken-neck": "/assets/products/chicken-neck.png",
  "chicken-offal": "/assets/products/chicken-offal.png",
  "chicken-skin": "/assets/products/chicken-skin.png",
  "chicken-soup": "/assets/products/chicken-soup.png",
  "chicken-stock": "/assets/products/chicken-stock.png",
  "chicken-strips": "/assets/products/chicken-strips.png",
  "chicken-tenders": "/assets/products/chicken-tenders.png",
  "chicken-thighs": "/assets/products/chicken-thighs.png",
  "chicken-wings": "/assets/products/chicken-wings.png",
  "cracked-eggs": "/assets/products/cracked-eggs.png",
  drumsticks: "/assets/products/drumsticks.png",
  "egg-tray": "/assets/products/egg-tray.png",
  eggs: "/assets/products/eggs.png",
  "kienyeji-whole-chicken": "/assets/products/kienyeji-whole-chicken.webp",
  "minced-chicken": "/assets/products/minced-chicken.png",
  "poultry-mix": "/assets/products/poultry-mix.png",
  "roasted-chicken": "/assets/products/roasted-chicken.png",
  "whole-chicken": "/assets/products/whole-chicken.png",
};

export interface ProductImageDescriptor {
  productId?: string | null | undefined;
  name?: string | null | undefined;
  slug?: string | null | undefined;
  sku?: string | null | undefined;
  categoryName?: string | null | undefined;
  imageKey?: ProductImageKey | null | undefined;
}

const DISTINCT_WHOLE_CHICKEN_IMAGES: ProductImageKey[] = [
  "kienyeji-whole-chicken",
  "broiler-whole-chicken",
  "whole-chicken",
];

export const PRODUCT_IMAGE_OPTIONS: ProductImageKey[] = [
  ...DISTINCT_WHOLE_CHICKEN_IMAGES,
  ...(Object.keys(PRODUCT_IMAGE_ASSETS) as ProductImageKey[]).filter(
    (key) => !DISTINCT_WHOLE_CHICKEN_IMAGES.includes(key),
  ),
];

const PRODUCT_MATCHES: ReadonlyArray<{
  key: ProductImageKey;
  terms: readonly string[];
}> = [
  {
    key: "chicken-gizzards-portions",
    terms: ["gizzard portion", "gizzards portion", "gizzard portions", "gizzards portions"],
  },
  {
    key: "chicken-liver-portions",
    terms: ["liver portion", "livers portion", "liver portions", "livers portions"],
  },
  { key: "chicken-mid-wings", terms: ["mid wing", "mid wings", "midwing", "wing mid"] },
  { key: "minced-chicken", terms: ["minced chicken", "chicken mince", "mince chicken"] },
  { key: "chicken-tenders", terms: ["chicken tenders", "tenderloins"] },
  { key: "chicken-strips", terms: ["chicken strips", "chicken strip"] },
  { key: "chicken-cubes", terms: ["chicken cubes", "chicken cube"] },
  { key: "chicken-cutlet", terms: ["chicken cutlet", "chicken cutlets"] },
  { key: "chicken-gizzards", terms: ["gizzard", "gizzards"] },
  { key: "chicken-liver", terms: ["liver", "livers"] },
  { key: "chicken-hearts", terms: ["chicken heart", "chicken hearts"] },
  { key: "chicken-thighs", terms: ["chicken thigh", "chicken thighs", "thighs"] },
  { key: "drumsticks", terms: ["drumstick", "drumsticks"] },
  { key: "chicken-wings", terms: ["chicken wing", "chicken wings", "wings", "wing"] },
  { key: "chicken-breast", terms: ["chicken breast", "breast"] },
  { key: "chicken-legs", terms: ["chicken leg", "chicken legs", "legs"] },
  { key: "chicken-feet", terms: ["chicken feet", "chicken foot", "feet", "chicken paws"] },
  { key: "chicken-neck", terms: ["chicken neck", "chicken necks", "neck"] },
  { key: "chicken-back", terms: ["chicken back", "chicken backs", "back"] },
  { key: "chicken-skin", terms: ["chicken skin", "skin"] },
  { key: "chicken-offal", terms: ["chicken offal", "offal", "organ meat"] },
  { key: "poultry-mix", terms: ["poultry mix", "chicken mix", "mixed chicken"] },
  { key: "chicken-soup", terms: ["chicken soup", "soup"] },
  { key: "chicken-stock", terms: ["chicken stock", "stock"] },
  { key: "roasted-chicken", terms: ["roasted chicken", "roast chicken"] },
  { key: "egg-tray", terms: ["egg tray", "egg trays", "tray of eggs", "eggs tray"] },
  { key: "cracked-eggs", terms: ["cracked egg", "cracked eggs"] },
  { key: "eggs", terms: ["eggs", "egg"] },
  { key: "avocado", terms: ["avocado", "avocados"] },
];

function normalize(value: string | null | undefined): string {
  return (value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function hasTerm(value: string, terms: readonly string[]): boolean {
  return terms.some((term) => ` ${value} `.includes(` ${normalize(term)} `));
}

export function resolveProductImage(product: ProductImageDescriptor): ProductImageKey | null {
  if (product.imageKey) return product.imageKey;

  const productText = normalize(
    [product.name, product.slug, product.sku].filter(Boolean).join(" "),
  );
  const categoryText = normalize(product.categoryName);
  const allText = normalize([productText, categoryText].filter(Boolean).join(" "));

  for (const match of PRODUCT_MATCHES) {
    if (hasTerm(productText, match.terms)) return match.key;
  }

  const hasKienyeji = hasTerm(allText, ["kienyeji", "indigenous"]);
  const hasBroiler = hasTerm(allText, ["broiler"]);
  const hasWholeProduct = hasTerm(allText, ["whole", "whole bird", "whole birds"]);
  const hasWholeChicken =
    (hasWholeProduct && (hasTerm(allText, ["chicken"]) || hasKienyeji || hasBroiler)) ||
    ["chicken", "kienyeji", "kienyeji chicken", "broiler", "broiler chicken"].includes(
      normalize(product.name),
    );
  if (hasWholeChicken && hasKienyeji !== hasBroiler) {
    return hasKienyeji ? "kienyeji-whole-chicken" : "broiler-whole-chicken";
  }
  if (hasWholeChicken) return "whole-chicken";

  const categoryMatches = PRODUCT_MATCHES.find((match) => hasTerm(categoryText, match.terms));
  if (categoryMatches) return categoryMatches.key;

  return null;
}
