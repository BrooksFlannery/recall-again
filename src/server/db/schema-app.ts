import { relations, sql } from "drizzle-orm";
import { integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
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
  quizzes: many(quiz),
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
  quizItems: many(quizItem),
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

/** A quiz session belonging to an app user. */
export const quiz = pgTable("quiz", {
  id: text("id")
    .primaryKey()
    .default(sql`'quiz_' || gen_random_uuid()::text`),
  userId: text("user_id")
    .notNull()
    .references(() => appUser.id, { onDelete: "cascade" }),
  mode: text("mode").notNull().default("manual"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

export const quizRelations = relations(quiz, ({ one, many }) => ({
  user: one(appUser, {
    fields: [quiz.userId],
    references: [appUser.id],
  }),
  items: many(quizItem),
}));

/** A single item within a quiz, referencing a fact. userId is denormalized for RLS. */
export const quizItem = pgTable("quiz_item", {
  id: text("id")
    .primaryKey()
    .default(sql`'qi_' || gen_random_uuid()::text`),
  quizId: text("quiz_id")
    .notNull()
    .references(() => quiz.id, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => appUser.id, { onDelete: "cascade" }),
  factId: text("fact_id")
    .notNull()
    .references(() => fact.id, { onDelete: "cascade" }),
  position: integer("position").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

export const quizItemRelations = relations(quizItem, ({ one }) => ({
  quiz: one(quiz, {
    fields: [quizItem.quizId],
    references: [quiz.id],
  }),
  user: one(appUser, {
    fields: [quizItem.userId],
    references: [appUser.id],
  }),
  fact: one(fact, {
    fields: [quizItem.factId],
    references: [fact.id],
  }),
}));
