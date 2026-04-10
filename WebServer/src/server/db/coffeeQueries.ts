import { desc, eq } from "drizzle-orm";

import { formatBrewRatio } from "~/lib/coffeeUtils";
import { db } from "~/server/db";
import {
  brewLedgerEntries,
  coffeeRecipes,
  coffees,
} from "~/server/db/schema";
import type {
  BrewLedgerEntry,
  CoffeeCreateInput,
  CoffeeDetail,
  CoffeeRecipe,
  CoffeeSummary,
  CoffeeUpdateInput,
  LedgerCreateInput,
  LedgerUpdateInput,
  RecipeCreateInput,
  RecipeUpdateInput,
} from "~/types/coffee";

type CoffeeRow = typeof coffees.$inferSelect;
type CoffeeInsert = typeof coffees.$inferInsert;
type CoffeeRecipeRow = typeof coffeeRecipes.$inferSelect;
type CoffeeRecipeInsert = typeof coffeeRecipes.$inferInsert;
type BrewLedgerEntryRow = typeof brewLedgerEntries.$inferSelect;
type BrewLedgerInsert = typeof brewLedgerEntries.$inferInsert;

function toIsoString(value: Date | null | undefined) {
  return value ? value.toISOString() : null;
}

function serializeRecipe(row: CoffeeRecipeRow): CoffeeRecipe {
  return {
    id: row.id,
    coffeeId: row.coffeeId,
    name: row.name,
    brewMethod: row.brewMethod as CoffeeRecipe["brewMethod"],
    doseGrams: row.doseGrams,
    yieldGrams: row.yieldGrams,
    brewRatio: row.brewRatio,
    brewRatioLabel: formatBrewRatio(row.brewRatio, row.doseGrams, row.yieldGrams),
    grindSetting: row.grindSetting,
    waterTempC: row.waterTempC,
    brewTimeSeconds: row.brewTimeSeconds,
    profileRef: row.profileRef,
    profileNameSnapshot: row.profileNameSnapshot,
    tastingNotes: row.tastingNotes,
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
    updatedAt: toIsoString(row.updatedAt),
  };
}

function serializeLedgerEntry(row: BrewLedgerEntryRow): BrewLedgerEntry {
  return {
    id: row.id,
    coffeeId: row.coffeeId,
    recipeId: row.recipeId,
    brewedAt: row.brewedAt.toISOString(),
    brewMethod: row.brewMethod as BrewLedgerEntry["brewMethod"],
    doseGrams: row.doseGrams,
    yieldGrams: row.yieldGrams,
    brewRatio: row.brewRatio,
    brewRatioLabel: formatBrewRatio(row.brewRatio, row.doseGrams, row.yieldGrams),
    grindSetting: row.grindSetting,
    waterTempC: row.waterTempC,
    brewTimeSeconds: row.brewTimeSeconds,
    profileRef: row.profileRef,
    profileNameSnapshot: row.profileNameSnapshot,
    grinder: row.grinder,
    rating: row.rating,
    waterRecipe: row.waterRecipe,
    tastingNotes: row.tastingNotes,
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
    updatedAt: toIsoString(row.updatedAt),
  };
}

function serializeCoffeeSummary(
  row: CoffeeRow,
  recipes: CoffeeRecipeRow[],
  ledgerEntries: BrewLedgerEntryRow[],
): CoffeeSummary {
  const lastBrewedAt = [...ledgerEntries]
    .sort((left, right) => right.brewedAt.getTime() - left.brewedAt.getTime())
    .at(0)?.brewedAt;

  return {
    id: row.id,
    name: row.name,
    imageUrl: row.imageUrl,
    roaster: row.roaster,
    origin: row.origin,
    process: row.process,
    roastLevel: row.roastLevel as CoffeeSummary["roastLevel"],
    roastDate: toIsoString(row.roastDate),
    purchaseDate: toIsoString(row.purchaseDate),
    notes: row.notes,
    tastingNotes: row.tastingNotes,
    preferredProfileRef: row.preferredProfileRef,
    preferredProfileName: row.preferredProfileName,
    defaultBrewMethod: row.defaultBrewMethod as CoffeeSummary["defaultBrewMethod"],
    createdAt: row.createdAt.toISOString(),
    updatedAt: toIsoString(row.updatedAt),
    recipeCount: recipes.length,
    ledgerCount: ledgerEntries.length,
    lastBrewedAt: toIsoString(lastBrewedAt),
  };
}

function toCoffeeCreateInsert(input: CoffeeCreateInput): CoffeeInsert {
  return {
    name: input.name,
    imageUrl: input.imageUrl ?? null,
    roaster: input.roaster ?? null,
    origin: input.origin ?? null,
    process: input.process ?? null,
    roastLevel: input.roastLevel ?? null,
    roastDate: input.roastDate ? new Date(input.roastDate) : null,
    purchaseDate: input.purchaseDate ? new Date(input.purchaseDate) : null,
    notes: input.notes ?? null,
    tastingNotes: input.tastingNotes ?? null,
    preferredProfileRef: input.preferredProfileRef ?? null,
    preferredProfileName: input.preferredProfileName ?? null,
    defaultBrewMethod: input.defaultBrewMethod ?? null,
  };
}

function toCoffeeUpdateInsert(input: CoffeeUpdateInput): Partial<CoffeeInsert> {
  return {
    name: input.name,
    imageUrl: input.imageUrl === undefined ? undefined : (input.imageUrl ?? null),
    roaster: input.roaster === undefined ? undefined : (input.roaster ?? null),
    origin: input.origin === undefined ? undefined : (input.origin ?? null),
    process: input.process === undefined ? undefined : (input.process ?? null),
    roastLevel:
      input.roastLevel === undefined ? undefined : (input.roastLevel ?? null),
    roastDate:
      input.roastDate === undefined
        ? undefined
        : input.roastDate
          ? new Date(input.roastDate)
          : null,
    purchaseDate:
      input.purchaseDate === undefined
        ? undefined
        : input.purchaseDate
          ? new Date(input.purchaseDate)
          : null,
    notes: input.notes === undefined ? undefined : (input.notes ?? null),
    tastingNotes:
      input.tastingNotes === undefined
        ? undefined
        : (input.tastingNotes ?? null),
    preferredProfileRef:
      input.preferredProfileRef === undefined
        ? undefined
        : (input.preferredProfileRef ?? null),
    preferredProfileName:
      input.preferredProfileName === undefined
        ? undefined
        : (input.preferredProfileName ?? null),
    defaultBrewMethod:
      input.defaultBrewMethod === undefined
        ? undefined
        : (input.defaultBrewMethod ?? null),
  };
}

function toRecipeCreateInsert(input: RecipeCreateInput): CoffeeRecipeInsert {
  return {
    coffeeId: input.coffeeId,
    name: input.name,
    brewMethod: input.brewMethod,
    doseGrams: input.doseGrams ?? null,
    yieldGrams: input.yieldGrams ?? null,
    brewRatio: input.brewRatio ?? null,
    grindSetting: input.grindSetting ?? null,
    waterTempC: input.waterTempC ?? null,
    brewTimeSeconds: input.brewTimeSeconds ?? null,
    profileRef: input.profileRef ?? null,
    profileNameSnapshot: input.profileNameSnapshot ?? null,
    tastingNotes: input.tastingNotes ?? null,
    notes: input.notes ?? null,
  };
}

function toRecipeUpdateInsert(
  input: RecipeUpdateInput,
): Partial<CoffeeRecipeInsert> {
  return {
    name: input.name,
    brewMethod: input.brewMethod,
    doseGrams:
      input.doseGrams === undefined ? undefined : (input.doseGrams ?? null),
    yieldGrams:
      input.yieldGrams === undefined ? undefined : (input.yieldGrams ?? null),
    brewRatio:
      input.brewRatio === undefined ? undefined : (input.brewRatio ?? null),
    grindSetting:
      input.grindSetting === undefined
        ? undefined
        : (input.grindSetting ?? null),
    waterTempC:
      input.waterTempC === undefined ? undefined : (input.waterTempC ?? null),
    brewTimeSeconds:
      input.brewTimeSeconds === undefined
        ? undefined
        : (input.brewTimeSeconds ?? null),
    profileRef:
      input.profileRef === undefined ? undefined : (input.profileRef ?? null),
    profileNameSnapshot:
      input.profileNameSnapshot === undefined
        ? undefined
        : (input.profileNameSnapshot ?? null),
    tastingNotes:
      input.tastingNotes === undefined
        ? undefined
        : (input.tastingNotes ?? null),
    notes: input.notes === undefined ? undefined : (input.notes ?? null),
  };
}

function toLedgerInsert(input: LedgerCreateInput): BrewLedgerInsert {
  return {
    coffeeId: input.coffeeId,
    recipeId: input.recipeId ?? null,
    brewedAt: input.brewedAt ? new Date(input.brewedAt) : new Date(),
    brewMethod: input.brewMethod,
    doseGrams: input.doseGrams ?? null,
    yieldGrams: input.yieldGrams ?? null,
    brewRatio: input.brewRatio ?? null,
    grindSetting: input.grindSetting ?? null,
    waterTempC: input.waterTempC ?? null,
    brewTimeSeconds: input.brewTimeSeconds ?? null,
    profileRef: input.profileRef ?? null,
    profileNameSnapshot: input.profileNameSnapshot ?? null,
    grinder: input.grinder ?? null,
    rating: input.rating ?? null,
    waterRecipe: input.waterRecipe ?? null,
    tastingNotes: input.tastingNotes ?? null,
    notes: input.notes ?? null,
  };
}

function toLedgerUpdateInsert(
  input: LedgerUpdateInput,
): Partial<BrewLedgerInsert> {
  return {
    recipeId:
      input.recipeId === undefined ? undefined : (input.recipeId ?? null),
    brewedAt:
      input.brewedAt === undefined
        ? undefined
        : input.brewedAt
          ? new Date(input.brewedAt)
          : new Date(),
    brewMethod: input.brewMethod,
    doseGrams:
      input.doseGrams === undefined ? undefined : (input.doseGrams ?? null),
    yieldGrams:
      input.yieldGrams === undefined ? undefined : (input.yieldGrams ?? null),
    brewRatio:
      input.brewRatio === undefined ? undefined : (input.brewRatio ?? null),
    grindSetting:
      input.grindSetting === undefined
        ? undefined
        : (input.grindSetting ?? null),
    waterTempC:
      input.waterTempC === undefined ? undefined : (input.waterTempC ?? null),
    brewTimeSeconds:
      input.brewTimeSeconds === undefined
        ? undefined
        : (input.brewTimeSeconds ?? null),
    profileRef:
      input.profileRef === undefined ? undefined : (input.profileRef ?? null),
    profileNameSnapshot:
      input.profileNameSnapshot === undefined
        ? undefined
        : (input.profileNameSnapshot ?? null),
    grinder:
      input.grinder === undefined ? undefined : (input.grinder ?? null),
    rating: input.rating === undefined ? undefined : (input.rating ?? null),
    waterRecipe:
      input.waterRecipe === undefined
        ? undefined
        : (input.waterRecipe ?? null),
    tastingNotes:
      input.tastingNotes === undefined
        ? undefined
        : (input.tastingNotes ?? null),
    notes: input.notes === undefined ? undefined : (input.notes ?? null),
  };
}

export async function listCoffees() {
  const rows = await db.query.coffees.findMany({
    with: {
      recipes: true,
      ledgerEntries: true,
    },
    orderBy: (table, helpers) => [helpers.desc(table.createdAt)],
  });

  return rows.map((row) =>
    serializeCoffeeSummary(row, row.recipes, row.ledgerEntries),
  );
}

export async function getCoffeeDetailById(
  coffeeId: number,
): Promise<CoffeeDetail | null> {
  const row = await db.query.coffees.findFirst({
    where: (table, helpers) => helpers.eq(table.id, coffeeId),
    with: {
      recipes: true,
      ledgerEntries: true,
    },
  });

  if (!row) return null;

  const recipes = [...row.recipes]
    .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
    .map(serializeRecipe);
  const ledgerEntries = [...row.ledgerEntries]
    .sort((left, right) => right.brewedAt.getTime() - left.brewedAt.getTime())
    .map(serializeLedgerEntry);

  return {
    ...serializeCoffeeSummary(row, row.recipes, row.ledgerEntries),
    recipes,
    ledgerEntries,
  };
}

export async function createCoffee(input: CoffeeCreateInput) {
  const [row] = await db
    .insert(coffees)
    .values(toCoffeeCreateInsert(input))
    .returning();
  if (!row) {
    throw new Error("Coffee insert failed");
  }
  return getCoffeeDetailById(row.id);
}

export async function updateCoffee(coffeeId: number, input: CoffeeUpdateInput) {
  const values = toCoffeeUpdateInsert(input);
  const [row] = await db
    .update(coffees)
    .set({ ...values, updatedAt: new Date() })
    .where(eq(coffees.id, coffeeId))
    .returning();

  return row ? getCoffeeDetailById(row.id) : null;
}

export async function createRecipe(input: RecipeCreateInput) {
  const [row] = await db
    .insert(coffeeRecipes)
    .values(toRecipeCreateInsert(input))
    .returning();
  if (!row) {
    throw new Error("Recipe insert failed");
  }
  return serializeRecipe(row);
}

export async function updateRecipe(recipeId: number, input: RecipeUpdateInput) {
  const values = toRecipeUpdateInsert(input);
  const [row] = await db
    .update(coffeeRecipes)
    .set({ ...values, updatedAt: new Date() })
    .where(eq(coffeeRecipes.id, recipeId))
    .returning();

  return row ? serializeRecipe(row) : null;
}

export async function getRecipeById(recipeId: number) {
  const row = await db.query.coffeeRecipes.findFirst({
    where: (table, helpers) => helpers.eq(table.id, recipeId),
  });

  return row ? serializeRecipe(row) : null;
}

export async function createLedgerEntry(input: LedgerCreateInput) {
  const [row] = await db
    .insert(brewLedgerEntries)
    .values(toLedgerInsert(input))
    .returning();
  if (!row) {
    throw new Error("Ledger insert failed");
  }
  return serializeLedgerEntry(row);
}

export async function getLedgerEntryById(ledgerEntryId: number) {
  const row = await db.query.brewLedgerEntries.findFirst({
    where: (table, helpers) => helpers.eq(table.id, ledgerEntryId),
  });

  return row ? serializeLedgerEntry(row) : null;
}

export async function updateLedgerEntry(
  ledgerEntryId: number,
  input: LedgerUpdateInput,
) {
  const values = toLedgerUpdateInsert(input);
  const [row] = await db
    .update(brewLedgerEntries)
    .set({ ...values, updatedAt: new Date() })
    .where(eq(brewLedgerEntries.id, ledgerEntryId))
    .returning();

  return row ? serializeLedgerEntry(row) : null;
}

export async function convertLedgerEntryToRecipe(
  ledgerEntryId: number,
  name?: string | null,
) {
  const entry = await db.query.brewLedgerEntries.findFirst({
    where: (table, helpers) => helpers.eq(table.id, ledgerEntryId),
  });

  if (!entry) return null;

  const coffee = await db.query.coffees.findFirst({
    where: (table, helpers) => helpers.eq(table.id, entry.coffeeId),
  });

  if (!coffee) return null;

  const trimmedName = name?.trim();
  const createdName =
    trimmedName && trimmedName.length > 0
      ? trimmedName
      : `${coffee.name} ${entry.brewedAt.toLocaleDateString()} recipe`;

  const [recipe] = await db
    .insert(coffeeRecipes)
    .values({
      coffeeId: entry.coffeeId,
      name: createdName,
      brewMethod: entry.brewMethod,
      doseGrams: entry.doseGrams,
      yieldGrams: entry.yieldGrams,
      brewRatio: entry.brewRatio,
      grindSetting: entry.grindSetting,
      waterTempC: entry.waterTempC,
      brewTimeSeconds: entry.brewTimeSeconds,
      profileRef: entry.profileRef,
      profileNameSnapshot: entry.profileNameSnapshot,
      tastingNotes: entry.tastingNotes,
      notes: entry.notes,
    })
    .returning();
  if (!recipe) {
    throw new Error("Recipe conversion failed");
  }

  return serializeRecipe(recipe);
}

export async function getCoffeeSummariesForSelection() {
  return db
    .select({
      id: coffees.id,
      name: coffees.name,
      imageUrl: coffees.imageUrl,
      preferredProfileRef: coffees.preferredProfileRef,
      preferredProfileName: coffees.preferredProfileName,
      defaultBrewMethod: coffees.defaultBrewMethod,
    })
    .from(coffees)
    .orderBy(desc(coffees.createdAt));
}
