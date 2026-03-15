import { NextResponse } from "next/server";
import { db } from "@/db";
import { sessions } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function GET() {
  const [session] = await db
    .select()
    .from(sessions)
    .where(eq(sessions.status, "active"))
    .limit(1);

  return NextResponse.json({ session: session ?? null });
}
