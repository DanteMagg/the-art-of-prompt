import { cookies } from "next/headers";
import bcrypt from "bcryptjs";

const ADMIN_COOKIE = "admin_auth";
const COOKIE_MAX_AGE = 60 * 60 * 4; // 4 hours

export async function verifyPin(pin: string): Promise<boolean> {
  const hash = process.env.ADMIN_PIN_HASH;
  if (!hash) return false;
  return bcrypt.compare(pin, hash);
}

export async function setAdminCookie() {
  const jar = await cookies();
  jar.set(ADMIN_COOKIE, "authenticated", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: COOKIE_MAX_AGE,
    path: "/",
  });
}

export async function isAdmin(): Promise<boolean> {
  const jar = await cookies();
  return jar.get(ADMIN_COOKIE)?.value === "authenticated";
}

export async function clearAdminCookie() {
  const jar = await cookies();
  jar.delete(ADMIN_COOKIE);
}
