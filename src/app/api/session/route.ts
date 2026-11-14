import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { SESSION_COOKIE } from "@/lib/session";

// POST { name, plantCode } — choose who you are acting as
export async function POST(req: Request) {
  const { name, plantCode } = await req.json().catch(() => ({}));
  if (!name?.trim() || name.trim().length < 2) return NextResponse.json({ error: "Enter your full name" }, { status: 400 });
  const plant = await prisma.plant.findUnique({ where: { code: String(plantCode) } });
  if (!plant) return NextResponse.json({ error: "Choose your plant" }, { status: 400 });

  const res = NextResponse.json({ name: name.trim(), plantCode: plant.code });
  res.cookies.set(SESSION_COOKIE, encodeURIComponent(JSON.stringify({ name: name.trim(), plantCode: plant.code })), {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
