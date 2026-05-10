import { token } from "@satunnaisuus/distill";
import type { PrismaClient } from "../generated/prisma/client.js";

export type DatabaseClient = PrismaClient;

export const DATABASE = token("Database").of<DatabaseClient>();
