import { z } from "zod";

export const BREW_METHODS = [
  "espresso",
  "pour-over",
  "immersion",
  "aeropress",
  "moka",
  "cold-brew",
  "other",
] as const;

export const ROAST_LEVELS = [
  "light",
  "medium-light",
  "medium",
  "medium-dark",
  "dark",
] as const;

export const COFFEE_ROTATION_STATUSES = ["active", "finished", "all"] as const;

export type BrewMethod = (typeof BREW_METHODS)[number];
export type RoastLevel = (typeof ROAST_LEVELS)[number];
export type LedgerPhaseType = "PRESSURE" | "FLOW";
export type CoffeeRotationFilter = (typeof COFFEE_ROTATION_STATUSES)[number];
export type CoffeeRotationStatus = Exclude<CoffeeRotationFilter, "all">;

const optionalText = (max: number) =>
  z.preprocess((value) => {
    if (value == null) return null;
    if (typeof value !== "string") return value;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }, z.string().max(max).nullable());

const optionalUrl = z.preprocess((value) => {
  if (value == null) return null;
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}, z.string().url().nullable());

const optionalNumber = z.preprocess((value) => {
  if (value == null || value === "") return null;
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : value;
  }
  return value;
}, z.number().nonnegative().nullable());

const optionalInteger = z.preprocess((value) => {
  if (value == null || value === "") return null;
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : value;
  }
  return value;
}, z.number().int().nonnegative().nullable());

const optionalDateString = z.preprocess((value) => {
  if (value == null || value === "") return null;
  if (value instanceof Date) return value.toISOString();
  return value;
}, z.string().refine((value) => !Number.isNaN(Date.parse(value)), "Invalid date").nullable());

const optionalFiniteNumber = z.number().finite().optional();

export const ledgerTelemetryPointSchema = z.object({
  tMs: z.number().int().nonnegative(),
  pressure: optionalFiniteNumber,
  targetPressure: optionalFiniteNumber,
  pumpFlow: optionalFiniteNumber,
  targetPumpFlow: optionalFiniteNumber,
  weight: optionalFiniteNumber,
  weightFlow: optionalFiniteNumber,
  pumpPowerPct: optionalFiniteNumber,
  pumpCps: optionalFiniteNumber,
  pumpClicks: optionalFiniteNumber,
  phaseIdx: z.number().int().nonnegative().optional(),
  phaseType: z.enum(["PRESSURE", "FLOW"]).optional(),
});

export const ledgerTelemetryPhaseMarkerSchema = z.object({
  tMs: z.number().int().nonnegative(),
  phaseIdx: z.number().int().nonnegative(),
  phaseType: z.enum(["PRESSURE", "FLOW"]).optional(),
});

export const ledgerTelemetryTraceSchema = z.object({
  points: z.array(ledgerTelemetryPointSchema).max(10000),
  phaseMarkers: z.array(ledgerTelemetryPhaseMarkerSchema).max(512),
});

export const coffeeCreateSchema = z.object({
  name: z.string().trim().min(1).max(256),
  imageUrl: optionalUrl,
  roaster: optionalText(256),
  origin: optionalText(256),
  process: optionalText(128),
  roastLevel: z.enum(ROAST_LEVELS).nullable().optional().transform((value) => value ?? null),
  roastDate: optionalDateString,
  purchaseDate: optionalDateString,
  notes: optionalText(2000),
  tastingNotes: optionalText(2000),
  preferredProfileRef: optionalText(128),
  preferredProfileName: optionalText(256),
  defaultBrewMethod: z
    .enum(BREW_METHODS)
    .nullable()
    .optional()
    .transform((value) => value ?? null),
});

export const coffeeUpdateSchema = coffeeCreateSchema.partial();

export const coffeeListQuerySchema = z.object({
  status: z
    .enum(COFFEE_ROTATION_STATUSES)
    .optional()
    .transform((value) => value ?? "active"),
  from: optionalDateString,
  to: optionalDateString,
  minRecipes: optionalInteger,
  maxRecipes: optionalInteger,
  minBrews: optionalInteger,
  maxBrews: optionalInteger,
  minBagsConsumed: optionalInteger,
  maxBagsConsumed: optionalInteger,
});

export const recipeCreateSchema = z.object({
  coffeeId: z.coerce.number().int().positive(),
  name: z.string().trim().min(1).max(256),
  brewMethod: z.enum(BREW_METHODS),
  doseGrams: optionalNumber,
  yieldGrams: optionalNumber,
  brewRatio: optionalNumber,
  grindSetting: optionalText(128),
  waterTempC: optionalNumber,
  brewTimeSeconds: z.coerce.number().int().nonnegative().nullable().optional().transform((value) => value ?? null),
  profileRef: optionalText(128),
  profileNameSnapshot: optionalText(256),
  tastingNotes: optionalText(2000),
  notes: optionalText(2000),
});

export const recipeUpdateSchema = recipeCreateSchema.omit({ coffeeId: true }).partial();

export const ledgerCreateSchema = z.object({
  coffeeId: z.coerce.number().int().positive(),
  recipeId: z.coerce.number().int().positive().nullable().optional().transform((value) => value ?? null),
  brewedAt: optionalDateString,
  brewMethod: z.enum(BREW_METHODS),
  doseGrams: optionalNumber,
  yieldGrams: optionalNumber,
  brewRatio: optionalNumber,
  grindSetting: optionalText(128),
  waterTempC: optionalNumber,
  brewTimeSeconds: z.coerce.number().int().nonnegative().nullable().optional().transform((value) => value ?? null),
  profileRef: optionalText(128),
  profileNameSnapshot: optionalText(256),
  grinder: optionalText(128),
  rating: z.coerce.number().int().min(0).max(10).nullable().optional().transform((value) => value ?? null),
  waterRecipe: optionalText(256),
  tastingNotes: optionalText(2000),
  notes: optionalText(2000),
  telemetryTrace: ledgerTelemetryTraceSchema.nullable().optional().transform((value) => value ?? null),
});

export const ledgerUpdateSchema = ledgerCreateSchema.omit({ coffeeId: true }).partial();

export const convertLedgerToRecipeSchema = z.object({
  name: optionalText(256),
});

export const finishCoffeeBagSchema = z.object({
  finishedAt: optionalDateString,
});

export const openCoffeeBagSchema = z.object({
  openedAt: optionalDateString,
});

export type CoffeeCreateInput = z.infer<typeof coffeeCreateSchema>;
export type CoffeeUpdateInput = z.infer<typeof coffeeUpdateSchema>;
export type CoffeeListQueryInput = z.infer<typeof coffeeListQuerySchema>;
export type RecipeCreateInput = z.infer<typeof recipeCreateSchema>;
export type RecipeUpdateInput = z.infer<typeof recipeUpdateSchema>;
export type LedgerCreateInput = z.infer<typeof ledgerCreateSchema>;
export type LedgerUpdateInput = z.infer<typeof ledgerUpdateSchema>;
export type FinishCoffeeBagInput = z.infer<typeof finishCoffeeBagSchema>;
export type OpenCoffeeBagInput = z.infer<typeof openCoffeeBagSchema>;

export interface LedgerTelemetryPoint {
  tMs: number;
  pressure?: number;
  targetPressure?: number;
  pumpFlow?: number;
  targetPumpFlow?: number;
  weight?: number;
  weightFlow?: number;
  pumpPowerPct?: number;
  pumpCps?: number;
  pumpClicks?: number;
  phaseIdx?: number;
  phaseType?: LedgerPhaseType;
}

export interface LedgerTelemetryPhaseMarker {
  tMs: number;
  phaseIdx: number;
  phaseType?: LedgerPhaseType;
}

export interface LedgerTelemetryTrace {
  points: LedgerTelemetryPoint[];
  phaseMarkers: LedgerTelemetryPhaseMarker[];
}

export interface CoffeeBag {
  id: number;
  coffeeId: number;
  openedAt: string;
  finishedAt: string | null;
  createdAt: string;
  updatedAt: string | null;
}

export interface CoffeeSummary {
  id: number;
  name: string;
  imageUrl: string | null;
  roaster: string | null;
  origin: string | null;
  process: string | null;
  roastLevel: RoastLevel | null;
  roastDate: string | null;
  purchaseDate: string | null;
  notes: string | null;
  tastingNotes: string | null;
  preferredProfileRef: string | null;
  preferredProfileName: string | null;
  defaultBrewMethod: BrewMethod | null;
  createdAt: string;
  updatedAt: string | null;
  recipeCount: number;
  ledgerCount: number;
  lastBrewedAt: string | null;
  bagsConsumed: number;
  rotationStatus: CoffeeRotationStatus;
  currentBag: CoffeeBag | null;
  latestBag: CoffeeBag | null;
}

export interface CoffeeRecipe {
  id: number;
  coffeeId: number;
  name: string;
  brewMethod: BrewMethod;
  doseGrams: number | null;
  yieldGrams: number | null;
  brewRatio: number | null;
  brewRatioLabel: string | null;
  grindSetting: string | null;
  waterTempC: number | null;
  brewTimeSeconds: number | null;
  profileRef: string | null;
  profileNameSnapshot: string | null;
  tastingNotes: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string | null;
}

export interface BrewLedgerEntry {
  id: number;
  coffeeId: number;
  recipeId: number | null;
  brewedAt: string;
  brewMethod: BrewMethod;
  doseGrams: number | null;
  yieldGrams: number | null;
  brewRatio: number | null;
  brewRatioLabel: string | null;
  grindSetting: string | null;
  waterTempC: number | null;
  brewTimeSeconds: number | null;
  profileRef: string | null;
  profileNameSnapshot: string | null;
  grinder: string | null;
  rating: number | null;
  waterRecipe: string | null;
  tastingNotes: string | null;
  notes: string | null;
  telemetryTrace: LedgerTelemetryTrace | null;
  createdAt: string;
  updatedAt: string | null;
}

export interface CoffeeDetail extends CoffeeSummary {
  recipes: CoffeeRecipe[];
  ledgerEntries: BrewLedgerEntry[];
  latestLedgerEntry: BrewLedgerEntry | null;
  bagHistory: CoffeeBag[];
}

export interface BrewLedgerPage {
  entries: BrewLedgerEntry[];
  nextCursor: string | null;
}
