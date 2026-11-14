import { prisma } from "./db";

/** Plants are 3 rows of master data; load them as a lookup by code. */
export async function getPlantMap() {
  const plants = await prisma.plant.findMany({ orderBy: { code: "asc" } });
  return { plants, name: (code: string) => plants.find((p) => p.code === code)?.name ?? code };
}
