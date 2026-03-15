import { eq } from "drizzle-orm";
import type { db as DbClient } from "@/server/db";
import { schemaApp } from "@/server/db";

type DrizzleClient = typeof DbClient;

export async function findOrCreateAppUserByAuthId(
  db: DrizzleClient,
  authUserId: string,
): Promise<{ id: string }> {
  const existing = await db
    .select({ id: schemaApp.appUser.id })
    .from(schemaApp.appUser)
    .where(eq(schemaApp.appUser.authUserId, authUserId))
    .limit(1);

  if (existing[0]) {
    return { id: existing[0].id };
  }

  const inserted = await db
    .insert(schemaApp.appUser)
    .values({ authUserId })
    .onConflictDoNothing()
    .returning({ id: schemaApp.appUser.id });

  if (inserted[0]) {
    return { id: inserted[0].id };
  }

  // Race: another request inserted first; re-select
  const reselected = await db
    .select({ id: schemaApp.appUser.id })
    .from(schemaApp.appUser)
    .where(eq(schemaApp.appUser.authUserId, authUserId))
    .limit(1);

  if (reselected[0]) {
    return { id: reselected[0].id };
  }

  throw new Error(`Failed to find or create app user for authUserId: ${authUserId}`);
}
