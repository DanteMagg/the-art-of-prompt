import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { sessions } from "@/db/schema";
import { isAdmin } from "@/lib/auth";
import { eq } from "drizzle-orm";

export async function POST(req: NextRequest) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { title } = await req.json();
  if (!title) {
    return NextResponse.json({ error: "Title required" }, { status: 400 });
  }

  const existing = await db
    .select()
    .from(sessions)
    .where(eq(sessions.status, "active"));

  if (existing.length > 0) {
    return NextResponse.json(
      { error: "An active session already exists. End it first." },
      { status: 409 }
    );
  }

  const [session] = await db.insert(sessions).values({ title }).returning();
  return NextResponse.json({ session });
}

export async function GET() {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const allSessions = await db
    .select()
    .from(sessions)
    .orderBy(sessions.createdAt);
  return NextResponse.json({ sessions: allSessions });
}
