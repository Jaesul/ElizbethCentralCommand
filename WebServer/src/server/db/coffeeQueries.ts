import {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  gte,
  isNull,
  lt,
  lte,
  or,
  sql,
} from "drizzle-orm";

import { formatBrewRatio } from "~/lib/coffeeUtils";
import { db } from "~/server/db";
import {
  brewLedgerEntries,
  coffeeBags,
  coffeeRecipes,
  coffees,
} from "~/server/db/schema";
import type {
  CoffeeBag,
  BrewLedgerEntry,
  CoffeeCreateInput,
  CoffeeDetail,
  CoffeeListQueryInput,
  CoffeeRotationStatus,
  CoffeeRecipe,
  CoffeeSummary,
  CoffeeUpdateInput,
  FinishCoffeeBagInput,
  LedgerCreateInput,
  LedgerUpdateInput,
  OpenCoffeeBagInput,
  RecipeCreateInput,
  RecipeUpdateInput,
} from "~/types/coffee";

type CoffeeRow = typeof coffees.$inferSelect;
type CoffeeInsert = typeof coffees.$inferInsert;
type CoffeeRecipeRow = typeof coffeeRecipes.$inferSelect;
type CoffeeRecipeInsert = typeof coffeeRecipes.$inferInsert;
type CoffeeBagRow = typeof coffeeBags.$inferSelect;
type CoffeeBagInsert = typeof coffeeBags.$inferInsert;
type BrewLedgerEntryRow = typeof brewLedgerEntries.$inferSelect;
type BrewLedgerInsert = typeof brewLedgerEntries.$inferInsert;

/** ISO string or null; never throws (invalid / out-of-range dates from DB). */
function toIsoString(value: Date | string | number | bigint | null | undefined) {
  if (value == null) return null;

  const format = (d: Date): string | null => {
    if (Number.isNaN(d.getTime())) return null;
    try {
      return d.toISOString();
    } catch {
      return null;
    }
  };

  if (value instanceof Date) {
    return format(value);
  }
  if (typeof value === "string") {
    return format(new Date(value));
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return format(new Date(value));
  }
  if (typeof value === "bigint") {
    return format(new Date(Number(value)));
  }
  return null;
}

/** Required API timestamps: DB should always be valid; fallback avoids 500 on bad rows. */
function toIsoStringRequired(
  value: Date | string | number | bigint | null | undefined,
  fallback = "1970-01-01T00:00:00.000Z",
) {
  return toIsoString(value) ?? fallback;
}

/** PG `count()` can be bigint; JSON.stringify throws on bigint. */
function coerceCount(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
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
    createdAt: toIsoStringRequired(row.createdAt),
    updatedAt: toIsoString(row.updatedAt),
  };
}

function serializeLedgerEntry(row: BrewLedgerEntryRow): BrewLedgerEntry {
  return {
    id: row.id,
    coffeeId: row.coffeeId,
    recipeId: row.recipeId,
    brewedAt: toIsoStringRequired(row.brewedAt),
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
    telemetryTrace: row.telemetryTrace,
    createdAt: toIsoStringRequired(row.createdAt),
    updatedAt: toIsoString(row.updatedAt),
  };
}

function serializeCoffeeBag(row: CoffeeBagRow): CoffeeBag {
  return {
    id: row.id,
    coffeeId: row.coffeeId,
    openedAt: toIsoStringRequired(row.openedAt),
    finishedAt: toIsoString(row.finishedAt),
    createdAt: toIsoStringRequired(row.createdAt),
    updatedAt: toIsoString(row.updatedAt),
  };
}

function getCoffeeBagState(rows: CoffeeBagRow[]) {
  const currentBagRow = rows.find((row) => row.finishedAt == null) ?? null;
  const latestBagRow = rows[0] ?? null;

  return {
    currentBag: currentBagRow ? serializeCoffeeBag(currentBagRow) : null,
    latestBag: latestBagRow ? serializeCoffeeBag(latestBagRow) : null,
    bagsConsumed: rows.length,
    rotationStatus: (currentBagRow ? "active" : "finished") as CoffeeRotationStatus,
  };
}

/** Same semantics as {@link getCoffeeBagState} for rows ordered newest-first, without scanning every bag row. */
function getCoffeeBagStateFromPeek(input: {
  bagsConsumed: number;
  latestBagRow: CoffeeBagRow | null;
  openBagRow: CoffeeBagRow | null;
}) {
  const { bagsConsumed, latestBagRow, openBagRow } = input;
  return {
    currentBag: openBagRow ? serializeCoffeeBag(openBagRow) : null,
    latestBag: latestBagRow ? serializeCoffeeBag(latestBagRow) : null,
    bagsConsumed,
    rotationStatus: (openBagRow ? "active" : "finished") as CoffeeRotationStatus,
  };
}

type CoffeeSummaryBagsInput =
  | CoffeeBagRow[]
  | {
      bagsConsumed: number;
      latestBagRow: CoffeeBagRow | null;
      openBagRow: CoffeeBagRow | null;
    };

function resolveCoffeeSummaryBags(bags: CoffeeSummaryBagsInput) {
  return Array.isArray(bags) ? getCoffeeBagState(bags) : getCoffeeBagStateFromPeek(bags);
}

function serializeCoffeeSummaryFromCounts(
  row: CoffeeRow,
  recipeCount: number,
  ledgerCount: number,
  lastBrewedAt: Date | string | null | undefined,
  bags: CoffeeSummaryBagsInput,
): CoffeeSummary {
  const bagState = resolveCoffeeSummaryBags(bags);

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
    createdAt: toIsoStringRequired(row.createdAt),
    updatedAt: toIsoString(row.updatedAt),
    recipeCount: coerceCount(recipeCount),
    ledgerCount: coerceCount(ledgerCount),
    lastBrewedAt: toIsoString(lastBrewedAt),
    bagsConsumed: bagState.bagsConsumed,
    rotationStatus: bagState.rotationStatus,
    currentBag: bagState.currentBag,
    latestBag: bagState.latestBag,
  };
}

function toCoffeeBagInsert(
  coffeeId: number,
  openedAt: Date,
): CoffeeBagInsert {
  return {
    coffeeId,
    openedAt,
  };
}

function getCoffeeFilterDate(coffee: CoffeeSummary) {
  return (
    coffee.currentBag?.openedAt ??
    coffee.latestBag?.finishedAt ??
    coffee.latestBag?.openedAt ??
    coffee.purchaseDate ??
    coffee.roastDate ??
    coffee.lastBrewedAt ??
    coffee.createdAt
  );
}

function matchesCoffeeListFilters(
  coffee: CoffeeSummary,
  filters: CoffeeListQueryInput,
) {
  if (filters.status === "active" && coffee.rotationStatus !== "active") {
    return false;
  }

  if (filters.status === "finished" && coffee.rotationStatus !== "finished") {
    return false;
  }

  const filterDate = new Date(getCoffeeFilterDate(coffee));
  if (filters.from && filterDate < new Date(filters.from)) {
    return false;
  }
  if (filters.to && filterDate > new Date(filters.to)) {
    return false;
  }

  if (filters.minRecipes != null && coffee.recipeCount < filters.minRecipes) {
    return false;
  }
  if (filters.maxRecipes != null && coffee.recipeCount > filters.maxRecipes) {
    return false;
  }
  if (filters.minBrews != null && coffee.ledgerCount < filters.minBrews) {
    return false;
  }
  if (filters.maxBrews != null && coffee.ledgerCount > filters.maxBrews) {
    return false;
  }
  if (
    filters.minBagsConsumed != null &&
    coffee.bagsConsumed < filters.minBagsConsumed
  ) {
    return false;
  }
  if (
    filters.maxBagsConsumed != null &&
    coffee.bagsConsumed > filters.maxBagsConsumed
  ) {
    return false;
  }

  return true;
}

function compareCoffeeSummaries(left: CoffeeSummary, right: CoffeeSummary) {
  if (left.rotationStatus !== right.rotationStatus) {
    return left.rotationStatus === "active" ? -1 : 1;
  }

  const leftDate = new Date(getCoffeeFilterDate(left)).getTime();
  const rightDate = new Date(getCoffeeFilterDate(right)).getTime();
  if (leftDate !== rightDate) {
    return rightDate - leftDate;
  }

  return right.id - left.id;
}

function takeExecuteRows(result: unknown): Record<string, unknown>[] {
  if (Array.isArray(result)) {
    return result as Record<string, unknown>[];
  }
  if (
    result &&
    typeof result === "object" &&
    Array.isArray((result as { rows?: unknown }).rows)
  ) {
    return (result as { rows: Record<string, unknown>[] }).rows;
  }
  return [];
}

function rowToCoffeeBagRow(row: Record<string, unknown>): CoffeeBagRow {
  const openedAt = row.openedAt;
  const finishedAt = row.finishedAt;
  const createdAt = row.createdAt;
  const updatedAt = row.updatedAt;

  return {
    id: Number(row.id),
    coffeeId: Number(row.coffeeId),
    openedAt:
      openedAt instanceof Date ? openedAt : new Date(String(openedAt)),
    finishedAt:
      finishedAt == null || finishedAt === ""
        ? null
        : finishedAt instanceof Date
          ? finishedAt
          : new Date(String(finishedAt)),
    createdAt:
      createdAt instanceof Date ? createdAt : new Date(String(createdAt)),
    updatedAt:
      updatedAt == null || updatedAt === ""
        ? null
        : updatedAt instanceof Date
          ? updatedAt
          : new Date(String(updatedAt)),
  };
}

/** Per-coffee bag stats for browse lists (O(coffees) rows, not O(bags)). */
async function listCoffeeBagPeekData() {
  const [countRows, latestResult, openResult] = await Promise.all([
    db
      .select({
        coffeeId: coffeeBags.coffeeId,
        n: count(),
      })
      .from(coffeeBags)
      .groupBy(coffeeBags.coffeeId),
    db.execute(sql.raw(`
      SELECT DISTINCT ON ("coffeeId") *
      FROM "elizbeth_central_command_coffee_bag"
      ORDER BY "coffeeId", "openedAt" DESC, "id" DESC
    `)),
    db.execute(sql.raw(`
      SELECT DISTINCT ON ("coffeeId") *
      FROM "elizbeth_central_command_coffee_bag"
      WHERE "finishedAt" IS NULL
      ORDER BY "coffeeId", "openedAt" DESC, "id" DESC
    `)),
  ]);

  const counts = new Map<number, number>(
    countRows.map((r) => [r.coffeeId, coerceCount(r.n)]),
  );
  const latestByCoffeeId = new Map<number, CoffeeBagRow>();
  for (const raw of takeExecuteRows(latestResult)) {
    const bagRow = rowToCoffeeBagRow(raw);
    latestByCoffeeId.set(bagRow.coffeeId, bagRow);
  }
  const openByCoffeeId = new Map<number, CoffeeBagRow>();
  for (const raw of takeExecuteRows(openResult)) {
    const bagRow = rowToCoffeeBagRow(raw);
    openByCoffeeId.set(bagRow.coffeeId, bagRow);
  }

  return { counts, latestByCoffeeId, openByCoffeeId };
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
    telemetryTrace: input.telemetryTrace ?? null,
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
    telemetryTrace:
      input.telemetryTrace === undefined ? undefined : (input.telemetryTrace ?? null),
  };
}

export async function listCoffees(
  filters: CoffeeListQueryInput = {
    status: "active",
    from: null,
    to: null,
    minRecipes: null,
    maxRecipes: null,
    minBrews: null,
    maxBrews: null,
    minBagsConsumed: null,
    maxBagsConsumed: null,
  },
) {
  const coffeeRows = await db.query.coffees.findMany({
    orderBy: (table, helpers) => [helpers.desc(table.createdAt)],
    with: {
      recipes: {
        columns: { id: true },
      },
      ledgerEntries: {
        columns: {
          id: true,
          brewedAt: true,
        },
      },
      bags: {
        columns: {
          id: true,
          coffeeId: true,
          openedAt: true,
          finishedAt: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: (table, helpers) => [helpers.desc(table.openedAt), helpers.desc(table.id)],
      },
    },
  });

  return coffeeRows
    .map((row) => {
      const lastBrewedAt =
        row.ledgerEntries.reduce<Date | null>(
          (latest, entry) =>
            latest == null || entry.brewedAt.getTime() > latest.getTime()
              ? entry.brewedAt
              : latest,
          null,
        );

      return serializeCoffeeSummaryFromCounts(
        row,
        row.recipes.length,
        row.ledgerEntries.length,
        lastBrewedAt,
        row.bags,
      );
    })
    .filter((coffee) => matchesCoffeeListFilters(coffee, filters))
    .sort(compareCoffeeSummaries);
}

export async function getCoffeeDetailById(
  coffeeId: number,
): Promise<CoffeeDetail | null> {
  const [row, bagRows] = await Promise.all([
    db.query.coffees.findFirst({
      where: (table, helpers) => helpers.eq(table.id, coffeeId),
      with: {
        recipes: true,
        ledgerEntries: true,
      },
    }),
    db.query.coffeeBags.findMany({
      where: (table, helpers) => helpers.eq(table.coffeeId, coffeeId),
      orderBy: (table, helpers) => [helpers.desc(table.openedAt), helpers.desc(table.id)],
    }),
  ]);

  if (!row) return null;

  const recipes = [...row.recipes]
    .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
    .map(serializeRecipe);
  const ledgerEntries = [...row.ledgerEntries]
    .sort((left, right) => right.brewedAt.getTime() - left.brewedAt.getTime())
    .map(serializeLedgerEntry);

  return {
    ...serializeCoffeeSummaryFromCounts(
      row,
      row.recipes.length,
      row.ledgerEntries.length,
      row.ledgerEntries
        .slice()
        .sort((left, right) => right.brewedAt.getTime() - left.brewedAt.getTime())
        .at(0)?.brewedAt,
      bagRows,
    ),
    recipes,
    ledgerEntries,
    latestLedgerEntry: ledgerEntries[0] ?? null,
    bagHistory: bagRows.map(serializeCoffeeBag),
  };
}

export async function getCoffeePageDetailById(
  coffeeId: number,
): Promise<CoffeeDetail | null> {
  const [row, bagRows] = await Promise.all([
    db.query.coffees.findFirst({
      where: (table, helpers) => helpers.eq(table.id, coffeeId),
      with: {
        recipes: true,
      },
    }),
    db.query.coffeeBags.findMany({
      where: (table, helpers) => helpers.eq(table.coffeeId, coffeeId),
      orderBy: (table, helpers) => [helpers.desc(table.openedAt), helpers.desc(table.id)],
    }),
  ]);

  if (!row) return null;

  const recipes = [...row.recipes]
    .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
    .map(serializeRecipe);

  const [ledgerCountRow] = await db
    .select({ value: count() })
    .from(brewLedgerEntries)
    .where(eq(brewLedgerEntries.coffeeId, coffeeId));

  const latestLedgerRow = await db.query.brewLedgerEntries.findFirst({
    where: (table, helpers) => helpers.eq(table.coffeeId, coffeeId),
    orderBy: (table, helpers) => [helpers.desc(table.brewedAt), helpers.desc(table.id)],
  });

  return {
    ...serializeCoffeeSummaryFromCounts(
      row,
      recipes.length,
      coerceCount(ledgerCountRow?.value ?? 0),
      latestLedgerRow?.brewedAt,
      bagRows,
    ),
    recipes,
    ledgerEntries: [],
    latestLedgerEntry: latestLedgerRow ? serializeLedgerEntry(latestLedgerRow) : null,
    bagHistory: bagRows.map(serializeCoffeeBag),
  };
}

export async function createCoffee(input: CoffeeCreateInput) {
  const row = await db.transaction(async (tx) => {
    const [createdCoffee] = await tx
      .insert(coffees)
      .values(toCoffeeCreateInsert(input))
      .returning();

    if (!createdCoffee) {
      throw new Error("Coffee insert failed");
    }

    await tx.insert(coffeeBags).values(
      toCoffeeBagInsert(
        createdCoffee.id,
        input.purchaseDate ? new Date(input.purchaseDate) : new Date(),
      ),
    );

    return createdCoffee;
  });

  if (!row) {
    throw new Error("Coffee insert failed");
  }
  return getCoffeePageDetailById(row.id);
}

export async function updateCoffee(coffeeId: number, input: CoffeeUpdateInput) {
  const values = toCoffeeUpdateInsert(input);
  const [row] = await db
    .update(coffees)
    .set({ ...values, updatedAt: new Date() })
    .where(eq(coffees.id, coffeeId))
    .returning();

  return row ? getCoffeePageDetailById(row.id) : null;
}

export async function finishCoffeeBag(
  coffeeId: number,
  input: FinishCoffeeBagInput,
) {
  const finishedAt = input.finishedAt ? new Date(input.finishedAt) : new Date();

  const result = await db.transaction(async (tx) => {
    const coffee = await tx.query.coffees.findFirst({
      where: (table, helpers) => helpers.eq(table.id, coffeeId),
    });
    if (!coffee) {
      return null;
    }

    const activeBag = await tx.query.coffeeBags.findFirst({
      where: (table, helpers) =>
        and(eq(table.coffeeId, coffeeId), isNull(table.finishedAt)),
      orderBy: (table, helpers) => [helpers.desc(table.openedAt), helpers.desc(table.id)],
    });

    if (!activeBag) {
      throw new Error("No active bag to finish");
    }

    if (finishedAt.getTime() < activeBag.openedAt.getTime()) {
      throw new Error("Finished date must be after the bag was opened");
    }

    await tx
      .update(coffeeBags)
      .set({ finishedAt, updatedAt: new Date() })
      .where(eq(coffeeBags.id, activeBag.id));

    return coffee.id;
  });

  return result == null ? null : getCoffeePageDetailById(result);
}

export async function openCoffeeBag(
  coffeeId: number,
  input: OpenCoffeeBagInput,
) {
  const openedAt = input.openedAt ? new Date(input.openedAt) : new Date();

  const result = await db.transaction(async (tx) => {
    const coffee = await tx.query.coffees.findFirst({
      where: (table, helpers) => helpers.eq(table.id, coffeeId),
    });
    if (!coffee) {
      return null;
    }

    const activeBag = await tx.query.coffeeBags.findFirst({
      where: (table, helpers) =>
        and(eq(table.coffeeId, coffeeId), isNull(table.finishedAt)),
      orderBy: (table, helpers) => [helpers.desc(table.openedAt), helpers.desc(table.id)],
    });

    if (activeBag) {
      throw new Error("This coffee already has an active bag");
    }

    await tx.insert(coffeeBags).values(toCoffeeBagInsert(coffeeId, openedAt));
    return coffee.id;
  });

  return result == null ? null : getCoffeePageDetailById(result);
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

export async function deleteRecipe(recipeId: number) {
  const deleted = await db
    .delete(coffeeRecipes)
    .where(eq(coffeeRecipes.id, recipeId))
    .returning({ id: coffeeRecipes.id });
  return deleted.length > 0;
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

export async function listLedgerEntriesByCoffee(
  coffeeId: number,
  options: {
    limit?: number;
    cursor?: { brewedAt: Date; id: number } | null;
    from?: Date | null;
    to?: Date | null;
    sort?: "asc" | "desc";
  } = {},
) {
  const limit = Math.min(Math.max(options.limit ?? 5, 1), 5);
  const sort = options.sort ?? "desc";
  const where = and(
    eq(brewLedgerEntries.coffeeId, coffeeId),
    options.from ? gte(brewLedgerEntries.brewedAt, options.from) : undefined,
    options.to ? lte(brewLedgerEntries.brewedAt, options.to) : undefined,
    options.cursor
      ? or(
          sort === "desc"
            ? lt(brewLedgerEntries.brewedAt, options.cursor.brewedAt)
            : gt(brewLedgerEntries.brewedAt, options.cursor.brewedAt),
          and(
            eq(brewLedgerEntries.brewedAt, options.cursor.brewedAt),
            sort === "desc"
              ? lt(brewLedgerEntries.id, options.cursor.id)
              : gt(brewLedgerEntries.id, options.cursor.id),
          ),
        )
      : undefined,
  );

  const rows = await db
    .select()
    .from(brewLedgerEntries)
    .where(where)
    .orderBy(
      sort === "desc" ? desc(brewLedgerEntries.brewedAt) : asc(brewLedgerEntries.brewedAt),
      sort === "desc" ? desc(brewLedgerEntries.id) : asc(brewLedgerEntries.id),
    )
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const pageRows = hasMore ? rows.slice(0, limit) : rows;
  const entries = pageRows.map(serializeLedgerEntry);
  const lastRow = pageRows.at(-1);

  return {
    entries,
    nextCursor: hasMore && lastRow
      ? {
          brewedAt: toIsoStringRequired(lastRow.brewedAt),
          id: lastRow.id,
        }
      : null,
  };
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
