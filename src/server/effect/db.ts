import { Context, Layer } from "effect";
import { db } from "@/server/db";

export class Db extends Context.Tag("Db")<Db, typeof db>() {}

export const DbLive = Layer.succeed(Db, db);
