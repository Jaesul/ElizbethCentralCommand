import type {
  BrewLedgerEntry,
  BrewMethod,
  CoffeeRecipe,
  CoffeeSummary,
} from "~/types/coffee";

export function calculateBrewRatio(
  doseGrams: number | null | undefined,
  yieldGrams: number | null | undefined,
) {
  if (
    doseGrams == null ||
    yieldGrams == null ||
    !Number.isFinite(doseGrams) ||
    !Number.isFinite(yieldGrams) ||
    doseGrams <= 0
  ) {
    return null;
  }

  return yieldGrams / doseGrams;
}

export function formatBrewRatio(
  ratio: number | null | undefined,
  doseGrams?: number | null,
  yieldGrams?: number | null,
) {
  const resolved = ratio ?? calculateBrewRatio(doseGrams, yieldGrams);
  if (resolved == null) return null;
  return `1:${resolved.toFixed(2)}`;
}

export function formatMetric(
  value: number | null | undefined,
  unit: string,
  digits = 1,
) {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${value.toFixed(digits)} ${unit}`;
}

export function formatSeconds(seconds: number | null | undefined) {
  if (seconds == null || !Number.isFinite(seconds)) return "—";
  return `${seconds}s`;
}

export function formatDateTime(value: string | null | undefined) {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return parsed.toLocaleString();
}

export function formatDateTimeNoSeconds(value: string | null | undefined) {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return parsed.toLocaleString([], {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatDateOnly(value: string | null | undefined) {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return parsed.toLocaleDateString();
}

export function toDateInputValue(value: string | null | undefined) {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toISOString().slice(0, 10);
}

export function buildBrewHref(
  profileRef: string | null | undefined,
  options: {
    coffeeId?: number | null;
    recipeId?: number | null;
    ledgerEntryId?: number | null;
  } = {},
) {
  const params = new URLSearchParams();
  if (profileRef != null && profileRef !== "") {
    params.set("profileId", profileRef);
  }
  if (options.coffeeId != null) params.set("coffeeId", String(options.coffeeId));
  if (options.recipeId != null) params.set("recipeId", String(options.recipeId));
  if (options.ledgerEntryId != null) {
    params.set("ledgerEntryId", String(options.ledgerEntryId));
  }

  const query = params.toString();
  return query.length > 0 ? `/brew?${query}` : `/brew`;
}

export function getRecipeProfileRef(
  recipe: CoffeeRecipe,
  coffee: Pick<CoffeeSummary, "preferredProfileRef">,
) {
  return recipe.profileRef ?? coffee.preferredProfileRef ?? null;
}

export function getLedgerProfileRef(
  entry: BrewLedgerEntry,
  coffee: Pick<CoffeeSummary, "preferredProfileRef">,
) {
  return entry.profileRef ?? coffee.preferredProfileRef ?? null;
}

export function getBrewMethodLabel(method: BrewMethod) {
  switch (method) {
    case "espresso":
      return "Espresso";
    case "pour-over":
      return "Pour over";
    case "immersion":
      return "Immersion";
    case "aeropress":
      return "AeroPress";
    case "moka":
      return "Moka pot";
    case "cold-brew":
      return "Cold brew";
    case "other":
      return "Other";
  }
}
