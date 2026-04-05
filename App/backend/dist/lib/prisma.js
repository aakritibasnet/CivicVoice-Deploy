import "@/lib/env";
import { PrismaClient } from "@/generated/prisma-client";
export const prisma = globalThis.__backendPrisma ??
    new PrismaClient({
        log: process.env.NODE_ENV === "development"
            ? ["warn", "error"]
            : ["error"],
    });
if (process.env.NODE_ENV !== "production") {
    globalThis.__backendPrisma = prisma;
}
