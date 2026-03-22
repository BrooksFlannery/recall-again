import { relations, sql } from "drizzle-orm";
import {
  boolean,
  date,
  integer,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
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

/** Spaced-repetition scheduling state per user per fact (M3-pre). */
export const factReviewState = pgTable(
  "fact_review_state",
  {
    userId: text("user_id")
      .notNull()
      .references(() => appUser.id, { onDelete: "cascade" }),
    factId: text("fact_id")
      .notNull()
      .references(() => fact.id, { onDelete: "cascade" }),
    nextReviewAt: timestamp("next_review_at", { withTimezone: true }).notNull(),
    fibonacciStepIndex: integer("fibonacci_step_index").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.userId, t.factId] }),
  }),
);

/** An AI-generated question prompt derived from a fact. Exactly one active row per fact; no RLS — access via fact ownership. */
export const flashcard = pgTable("flashcard", {
  id: text("id")
    .primaryKey()
    .default(sql`'fc_' || gen_random_uuid()::text`),
  factId: text("fact_id")
    .notNull()
    .references(() => fact.id, { onDelete: "cascade" }),
  question: text("question").notNull(),
  canonicalAnswer: text("canonical_answer").notNull(),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

/** A quiz session belonging to an app user. */
export const quiz = pgTable(
  "quiz",
  {
    id: text("id")
      .primaryKey()
      .default(sql`'quiz_' || gen_random_uuid()::text`),
    userId: text("user_id")
      .notNull()
      .references(() => appUser.id, { onDelete: "cascade" }),
    mode: text("mode").notNull().default("manual"),
    /** UTC calendar day for idempotent scheduled quizzes (M3b). */
    scheduledFor: date("scheduled_for", { mode: "date" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => ({
    scheduledUserDayUnique: uniqueIndex("quiz_scheduled_user_day_unique")
      .on(table.userId, table.scheduledFor)
      .where(sql`${table.mode} = 'scheduled'`),
  }),
);

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
  /** User's free-text answer; set when the quiz is submitted. */
  userAnswer: text("user_answer"),
  /** Short explanation from the grader model. */
  aiReasoning: text("ai_reasoning"),
  /** AI verdict at grade time; does not change when the learner overrides. */
  aiResult: text("ai_result"),
  /**
   * Effective outcome for score display and spaced repetition.
   * Initially matches `aiResult`; the learner may override if the AI was wrong.
   */
  result: text("result"),
  /**
   * Snapshot of `fact_review_state.fibonacci_step_index` before this item was graded
   * (scheduled quizzes only). Used to recompute SRS when `result` is overridden.
   */
  reviewFibonacciStepBefore: integer("review_fibonacci_step_before"),
  /** Snapshot of `fact_review_state.next_review_at` before this item was graded. */
  reviewNextReviewAtBefore: timestamp("review_next_review_at_before", {
    withTimezone: true,
  }),
  answeredAt: timestamp("answered_at", { withTimezone: true }),
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
  factReviewStates: many(factReviewState),
}));

export const factRelations = relations(fact, ({ one, many }) => ({
  user: one(appUser, {
    fields: [fact.userId],
    references: [appUser.id],
  }),
  flashcards: many(flashcard),
  quizItems: many(quizItem),
  reviewState: one(factReviewState, {
    fields: [fact.id],
    references: [factReviewState.factId],
  }),
}));

export const factReviewStateRelations = relations(factReviewState, ({ one }) => ({
  user: one(appUser, {
    fields: [factReviewState.userId],
    references: [appUser.id],
  }),
  fact: one(fact, {
    fields: [factReviewState.factId],
    references: [fact.id],
  }),
}));

export const flashcardRelations = relations(flashcard, ({ one }) => ({
  fact: one(fact, {
    fields: [flashcard.factId],
    references: [fact.id],
  }),
}));

export const quizRelations = relations(quiz, ({ one, many }) => ({
  user: one(appUser, {
    fields: [quiz.userId],
    references: [appUser.id],
  }),
  items: many(quizItem),
}));

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
