import { eq } from "drizzle-orm";
import type { db as DbClient } from "@/server/db";
import { schemaApp } from "@/server/db";

type DrizzleClient = typeof DbClient;

export async function findOrCreateAppUserByAuthId(
  db: DrizzleClient,
  authUserId: string,
): Promise<{ id: string }> {
  const [existing] = await db
    .select({ id: schemaApp.appUser.id })
    .from(schemaApp.appUser)
    .where(eq(schemaApp.appUser.authUserId, authUserId))
    .limit(1);

  if (existing) return existing;

  await db
    .insert(schemaApp.appUser)
    .values({ authUserId })
    .onConflictDoNothing({ target: schemaApp.appUser.authUserId });

  const [row] = await db
    .select({ id: schemaApp.appUser.id })
    .from(schemaApp.appUser)
    .where(eq(schemaApp.appUser.authUserId, authUserId))
    .limit(1);

  if (!row) {
    console.error(`Failed to find or create app user for authUserId: ${authUserId}`);
    throw new Error("Internal server error: could not resolve app user");
  }

  return row;
}
