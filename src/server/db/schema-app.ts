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

export const appUserRelations = relations(appUser, ({ one }) => ({
  authUser: one(user, {
    fields: [appUser.authUserId],
    references: [user.id],
  }),
}));
