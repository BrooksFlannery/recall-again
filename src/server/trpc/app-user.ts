import { eq } from "drizzle-orm";
import type { db as DbClient } from "@/server/db";
import { schemaApp } from "@/server/db";

type DrizzleClient = typeof DbClient;

export async function getAppUserByAuthId(
  db: DrizzleClient,
  authUserId: string,
): Promise<{ id: string } | null> {
  const [row] = await db
    .select({ id: schemaApp.appUser.id })
    .from(schemaApp.appUser)
    .where(eq(schemaApp.appUser.authUserId, authUserId))
    .limit(1);

  return row ?? null;
}
