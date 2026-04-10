import { relations } from "drizzle-orm";
import { index, pgTableCreator, primaryKey } from "drizzle-orm/pg-core";
import { type AdapterAccount } from "next-auth/adapters";

/**
 * This is an example of how to use the multi-project schema feature of Drizzle ORM. Use the same
 * database instance for multiple projects.
 *
 * @see https://orm.drizzle.team/docs/goodies#multi-project-schema
 */
export const createTable = pgTableCreator(
  (name) => `elizbeth_central_command_${name}`,
);

export const posts = createTable(
  "post",
  (d) => ({
    id: d.integer().primaryKey().generatedByDefaultAsIdentity(),
    name: d.varchar({ length: 256 }),
    createdById: d
      .varchar({ length: 255 })
      .notNull()
      .references(() => users.id),
    createdAt: d
      .timestamp({ withTimezone: true })
      .$defaultFn(() => /* @__PURE__ */ new Date())
      .notNull(),
    updatedAt: d.timestamp({ withTimezone: true }).$onUpdate(() => new Date()),
  }),
  (t) => [
    index("created_by_idx").on(t.createdById),
    index("name_idx").on(t.name),
  ],
);

export const users = createTable("user", (d) => ({
  id: d
    .varchar({ length: 255 })
    .notNull()
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: d.varchar({ length: 255 }),
  email: d.varchar({ length: 255 }).notNull(),
  emailVerified: d
    .timestamp({
      mode: "date",
      withTimezone: true,
    })
    .$defaultFn(() => /* @__PURE__ */ new Date()),
  image: d.varchar({ length: 255 }),
}));

export const usersRelations = relations(users, ({ many }) => ({
  accounts: many(accounts),
}));

export const accounts = createTable(
  "account",
  (d) => ({
    userId: d
      .varchar({ length: 255 })
      .notNull()
      .references(() => users.id),
    type: d.varchar({ length: 255 }).$type<AdapterAccount["type"]>().notNull(),
    provider: d.varchar({ length: 255 }).notNull(),
    providerAccountId: d.varchar({ length: 255 }).notNull(),
    refresh_token: d.text(),
    access_token: d.text(),
    expires_at: d.integer(),
    token_type: d.varchar({ length: 255 }),
    scope: d.varchar({ length: 255 }),
    id_token: d.text(),
    session_state: d.varchar({ length: 255 }),
  }),
  (t) => [
    primaryKey({ columns: [t.provider, t.providerAccountId] }),
    index("account_user_id_idx").on(t.userId),
  ],
);

export const accountsRelations = relations(accounts, ({ one }) => ({
  user: one(users, { fields: [accounts.userId], references: [users.id] }),
}));

export const sessions = createTable(
  "session",
  (d) => ({
    sessionToken: d.varchar({ length: 255 }).notNull().primaryKey(),
    userId: d
      .varchar({ length: 255 })
      .notNull()
      .references(() => users.id),
    expires: d.timestamp({ mode: "date", withTimezone: true }).notNull(),
  }),
  (t) => [index("t_user_id_idx").on(t.userId)],
);

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, { fields: [sessions.userId], references: [users.id] }),
}));

export const verificationTokens = createTable(
  "verification_token",
  (d) => ({
    identifier: d.varchar({ length: 255 }).notNull(),
    token: d.varchar({ length: 255 }).notNull(),
    expires: d.timestamp({ mode: "date", withTimezone: true }).notNull(),
  }),
  (t) => [primaryKey({ columns: [t.identifier, t.token] })],
);

export const coffees = createTable(
  "coffee",
  (d) => ({
    id: d.integer().primaryKey().generatedByDefaultAsIdentity(),
    name: d.varchar({ length: 256 }).notNull(),
    imageUrl: d.text(),
    roaster: d.varchar({ length: 256 }),
    origin: d.varchar({ length: 256 }),
    process: d.varchar({ length: 128 }),
    roastLevel: d.varchar({ length: 64 }),
    roastDate: d.timestamp({ mode: "date", withTimezone: true }),
    purchaseDate: d.timestamp({ mode: "date", withTimezone: true }),
    notes: d.text(),
    tastingNotes: d.text(),
    preferredProfileRef: d.varchar({ length: 128 }),
    preferredProfileName: d.varchar({ length: 256 }),
    defaultBrewMethod: d.varchar({ length: 64 }),
    createdAt: d
      .timestamp({ mode: "date", withTimezone: true })
      .$defaultFn(() => /* @__PURE__ */ new Date())
      .notNull(),
    updatedAt: d.timestamp({ mode: "date", withTimezone: true }).$onUpdate(() => new Date()),
  }),
  (t) => [
    index("coffee_name_idx").on(t.name),
    index("coffee_created_at_idx").on(t.createdAt),
  ],
);

export const coffeeRecipes = createTable(
  "coffee_recipe",
  (d) => ({
    id: d.integer().primaryKey().generatedByDefaultAsIdentity(),
    coffeeId: d
      .integer()
      .notNull()
      .references(() => coffees.id, { onDelete: "cascade" }),
    name: d.varchar({ length: 256 }).notNull(),
    brewMethod: d.varchar({ length: 64 }).notNull(),
    doseGrams: d.doublePrecision(),
    yieldGrams: d.doublePrecision(),
    brewRatio: d.doublePrecision(),
    grindSetting: d.varchar({ length: 128 }),
    waterTempC: d.doublePrecision(),
    brewTimeSeconds: d.integer(),
    profileRef: d.varchar({ length: 128 }),
    profileNameSnapshot: d.varchar({ length: 256 }),
    tastingNotes: d.text(),
    notes: d.text(),
    createdAt: d
      .timestamp({ mode: "date", withTimezone: true })
      .$defaultFn(() => /* @__PURE__ */ new Date())
      .notNull(),
    updatedAt: d.timestamp({ mode: "date", withTimezone: true }).$onUpdate(() => new Date()),
  }),
  (t) => [
    index("coffee_recipe_coffee_id_idx").on(t.coffeeId),
    index("coffee_recipe_created_at_idx").on(t.createdAt),
  ],
);

export const brewLedgerEntries = createTable(
  "brew_ledger_entry",
  (d) => ({
    id: d.integer().primaryKey().generatedByDefaultAsIdentity(),
    coffeeId: d
      .integer()
      .notNull()
      .references(() => coffees.id, { onDelete: "cascade" }),
    recipeId: d
      .integer()
      .references(() => coffeeRecipes.id, { onDelete: "set null" }),
    brewedAt: d
      .timestamp({ mode: "date", withTimezone: true })
      .$defaultFn(() => /* @__PURE__ */ new Date())
      .notNull(),
    brewMethod: d.varchar({ length: 64 }).notNull(),
    doseGrams: d.doublePrecision(),
    yieldGrams: d.doublePrecision(),
    brewRatio: d.doublePrecision(),
    grindSetting: d.varchar({ length: 128 }),
    waterTempC: d.doublePrecision(),
    brewTimeSeconds: d.integer(),
    profileRef: d.varchar({ length: 128 }),
    profileNameSnapshot: d.varchar({ length: 256 }),
    grinder: d.varchar({ length: 128 }),
    rating: d.integer(),
    waterRecipe: d.varchar({ length: 256 }),
    tastingNotes: d.text(),
    notes: d.text(),
    createdAt: d
      .timestamp({ mode: "date", withTimezone: true })
      .$defaultFn(() => /* @__PURE__ */ new Date())
      .notNull(),
    updatedAt: d.timestamp({ mode: "date", withTimezone: true }).$onUpdate(() => new Date()),
  }),
  (t) => [
    index("brew_ledger_coffee_id_idx").on(t.coffeeId),
    index("brew_ledger_recipe_id_idx").on(t.recipeId),
    index("brew_ledger_brewed_at_idx").on(t.brewedAt),
  ],
);

export const coffeesRelations = relations(coffees, ({ many }) => ({
  recipes: many(coffeeRecipes),
  ledgerEntries: many(brewLedgerEntries),
}));

export const coffeeRecipesRelations = relations(coffeeRecipes, ({ one, many }) => ({
  coffee: one(coffees, {
    fields: [coffeeRecipes.coffeeId],
    references: [coffees.id],
  }),
  ledgerEntries: many(brewLedgerEntries),
}));

export const brewLedgerEntriesRelations = relations(brewLedgerEntries, ({ one }) => ({
  coffee: one(coffees, {
    fields: [brewLedgerEntries.coffeeId],
    references: [coffees.id],
  }),
  recipe: one(coffeeRecipes, {
    fields: [brewLedgerEntries.recipeId],
    references: [coffeeRecipes.id],
  }),
}));
