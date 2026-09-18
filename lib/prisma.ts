import { PrismaClient } from "@prisma/client";
import { prismaConnectionUrl } from "./database-url";

declare global {
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
  // eslint-disable-next-line no-var
  var prismaConnectionString: string | undefined;
}

function createPrismaClient(): PrismaClient {
  const databaseUrl = prismaConnectionUrl();
  if (!databaseUrl) {
    throw new Error("DATABASE_URL est manquant dans l'environnement.");
  }
  return new PrismaClient({
    datasources: {
      db: { url: databaseUrl },
    },
  });
}

function getPrismaClient(): PrismaClient {
  const databaseUrl = prismaConnectionUrl() ?? "";

  if (
    process.env.NODE_ENV !== "production" &&
    global.prisma &&
    global.prismaConnectionString &&
    global.prismaConnectionString !== databaseUrl
  ) {
    void global.prisma.$disconnect().catch(() => {});
    global.prisma = undefined;
  }

  if (!global.prisma) {
    global.prisma = createPrismaClient();
    global.prismaConnectionString = databaseUrl;
  }

  return global.prisma;
}

export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const client = getPrismaClient();
    const value = Reflect.get(client, prop, client);
    return typeof value === "function" ? value.bind(client) : value;
  },
});

export function resetPrismaClient(): void {
  if (global.prisma) {
    void global.prisma.$disconnect().catch(() => {});
  }
  global.prisma = undefined;
  global.prismaConnectionString = undefined;
}

export function isPrismaConnectionError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "P1001"
  );
}
