import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";

const connectionString = process.env.DATABASE_URL!;

// Allow disabling SSL for local dev (e.g. sslmode=disable) while requiring it in prod.
const disableSsl = /sslmode=disable/.test(connectionString);

const client = postgres(connectionString, {
    ssl: disableSsl ? false : "require",
});

export const db = drizzle(client);