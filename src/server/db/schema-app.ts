import { relations, sql } from "drizzle-orm";
import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { user } from "./schema";

/** Append-only ping log. Each row records one ping. */
export const ping = pgTable("ping", {
  id: serial("id").primaryKey(),
  pingedAt: timestamp("pinged_at").defaultNow().notNull(),
});

/** App-level user record, decoupled from the auth provider's user table. */
export const appUser = pgTable("app_user", {
  id: text("id")
    .primaryKey()
    .default(sql`'user_' || gen_random_uuid()::text`),
  authUserId: text("auth_user_id")
    .notNull()
    .unique()
    .references(() => user.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

export const appUserRelations = relations(appUser, ({ one, many }) => ({
  authUser: one(user, {
    fields: [appUser.authUserId],
    references: [user.id],
  }),
  facts: many(fact),
}));

/** A single fact belonging to an app user. */
export const fact = pgTable("fact", {
  id: text("id")
    .primaryKey()
    .default(sql`'fact_' || gen_random_uuid()::text`),
  userId: text("user_id")
    .notNull()
    .references(() => appUser.id, { onDelete: "cascade" }),
  content: text("content").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

export const factRelations = relations(fact, ({ one, many }) => ({
  user: one(appUser, {
    fields: [fact.userId],
    references: [appUser.id],
  }),
  flashcards: many(flashcard),
}));

/** An AI-generated flashcard (question + canonical answer) derived from a fact. Append-only; no RLS — access via fact ownership. */
export const flashcard = pgTable("flashcard", {
  id: text("id")
    .primaryKey()
    .default(sql`'fc_' || gen_random_uuid()::text`),
  factId: text("fact_id")
    .notNull()
    .references(() => fact.id, { onDelete: "cascade" }),
  question: text("question").notNull(),
  canonicalAnswer: text("canonical_answer").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const flashcardRelations = relations(flashcard, ({ one }) => ({
  fact: one(fact, {
    fields: [flashcard.factId],
    references: [fact.id],
  }),
}));
