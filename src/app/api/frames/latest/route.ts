import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { frames } from "@/db/schema";
import { eq, desc } from "drizzle-orm";

export async function GET(req: NextRequest) {
  const sessionId = req.nextUrl.searchParams.get("sessionId");

  if (!sessionId) {
    return NextResponse.json(
      { error: "sessionId required" },
      { status: 400 }
    );
  }

  const [frame] = await db
    .select()
    .from(frames)
    .where(eq(frames.sessionId, sessionId))
    .orderBy(desc(frames.frameNumber))
    .limit(1);

  return NextResponse.json({ frame: frame ?? null });
}
