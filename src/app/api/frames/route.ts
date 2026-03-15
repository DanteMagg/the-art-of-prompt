import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { frames, sessions, systemPrompts } from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { evolveArtifact } from "@/lib/claude";
import { captureAndUpload } from "@/lib/screenshot";
import { acquireLock, releaseLock } from "@/lib/lock";
import { isAdmin } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const { sessionId, promptText } = await req.json();

  if (!sessionId || !promptText) {
    return NextResponse.json(
      { error: "sessionId and promptText required" },
      { status: 400 }
    );
  }

  const [session] = await db
    .select()
    .from(sessions)
    .where(and(eq(sessions.id, sessionId), eq(sessions.status, "active")));

  if (!session) {
    return NextResponse.json(
      { error: "No active session found" },
      { status: 404 }
    );
  }

  if (!acquireLock(sessionId)) {
    return NextResponse.json(
      { error: "Another prompt is being processed. Please wait." },
      { status: 429 }
    );
  }

  try {
    const maxFrames = parseInt(process.env.SESSION_MAX_FRAMES || "100");

    const existingFrames = await db
      .select()
      .from(frames)
      .where(eq(frames.sessionId, sessionId))
      .orderBy(desc(frames.frameNumber))
      .limit(1);

    const lastFrame = existingFrames[0];
    const newFrameNumber = lastFrame ? lastFrame.frameNumber + 1 : 1;

    if (newFrameNumber > maxFrames) {
      return NextResponse.json(
        { error: "Session has reached maximum frames" },
        { status: 400 }
      );
    }

    const [activePrompt] = await db
      .select()
      .from(systemPrompts)
      .where(eq(systemPrompts.isActive, true))
      .limit(1);

    if (!activePrompt) {
      return NextResponse.json(
        { error: "No active system prompt configured" },
        { status: 500 }
      );
    }

    const result = await evolveArtifact(
      activePrompt.content,
      lastFrame?.artifactHtml ?? null,
      promptText,
      newFrameNumber
    );

    const [frame] = await db
      .insert(frames)
      .values({
        sessionId,
        frameNumber: newFrameNumber,
        promptText,
        artifactHtml: result.html,
        acknowledgment: result.acknowledgment,
      })
      .returning();

    // Fire screenshot pipeline async — don't block the response
    captureAndUpload(result.html, sessionId, newFrameNumber).then(
      async (url) => {
        if (url) {
          await db
            .update(frames)
            .set({ screenshotUrl: url })
            .where(eq(frames.id, frame.id));
        }
      }
    );

    return NextResponse.json({ frame });
  } catch (err) {
    console.error("Frame generation error:", err);
    return NextResponse.json(
      { error: "Failed to generate frame" },
      { status: 500 }
    );
  } finally {
    releaseLock(sessionId);
  }
}

export async function GET(req: NextRequest) {
  const sessionId = req.nextUrl.searchParams.get("sessionId");

  if (!sessionId) {
    return NextResponse.json(
      { error: "sessionId required" },
      { status: 400 }
    );
  }

  const admin = await isAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const allFrames = await db
    .select()
    .from(frames)
    .where(eq(frames.sessionId, sessionId))
    .orderBy(frames.frameNumber);

  return NextResponse.json({ frames: allFrames });
}
