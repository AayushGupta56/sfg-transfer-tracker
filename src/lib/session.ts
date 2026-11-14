// Prototype identity: the person picks their name + plant once; it's stored in a cookie.
// Every action is stamped with this identity in the audit trail.
// Production replacement: company SSO (Azure AD / SAP IdP) with plant taken from the user's role.

import { cookies } from "next/headers";
import type { Actor } from "./transfers";
import { DomainError } from "./transfers";

export const SESSION_COOKIE = "sfg_user";

export async function getActor(): Promise<Actor | null> {
  const raw = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!raw) return null;
  try {
    const v = JSON.parse(decodeURIComponent(raw));
    if (typeof v?.name === "string" && typeof v?.plantCode === "string") return v;
  } catch {}
  return null;
}

export async function requireActor(): Promise<Actor> {
  const a = await getActor();
  if (!a) throw new DomainError("Choose who you are (name + plant) before making changes", 401);
  return a;
}
