import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { exportJobs } from "@/db/schema";
import { isAdmin } from "@/lib/auth";

export async function POST(req: NextRequest) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { sessionId, format } = await req.json();

  if (!sessionId || !format) {
    return NextResponse.json(
      { error: "sessionId and format required" },
      { status: 400 }
    );
  }

  if (!["mp4", "gif", "zip"].includes(format)) {
    return NextResponse.json(
      { error: "Format must be mp4, gif, or zip" },
      { status: 400 }
    );
  }

  const [job] = await db
    .insert(exportJobs)
    .values({ sessionId, format })
    .returning();

  // TODO: trigger background export worker
  // For now, export processing is a placeholder

  return NextResponse.json({ exportJob: job });
}
