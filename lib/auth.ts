import { betterAuth } from "better-auth";
import {drizzleAdapter} from "better-auth/adapters/drizzle";
import { admin } from "better-auth/plugins";
import { db } from "@/db/client";
import * as authSchema from "@/db/schemas/auth";

export const auth = betterAuth({
    database: drizzleAdapter(db, {
        provider: "pg",
        schema: authSchema,
    }),
    emailAndPassword: {
        enabled: true,
    },
    user: {
        additionalFields: {
            // Surface the temp-password reset flag on the session user so both
            // server gates and the client can read it without a DB round-trip.
            mustResetPassword: {
                type: "boolean",
                required: false,
                input: false,
            },
        },
    },
    plugins: [admin()],
    secret: process.env.BETTER_AUTH_SECRET!,
    baseURL: process.env.NEXT_PUBLIC_APP_URL,
});

export type Session = typeof auth.$Infer.Session;
