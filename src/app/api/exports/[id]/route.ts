import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { exportJobs } from "@/db/schema";
import { eq } from "drizzle-orm";
import { isAdmin } from "@/lib/auth";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const [job] = await db
    .select()
    .from(exportJobs)
    .where(eq(exportJobs.id, id));

  if (!job) {
    return NextResponse.json(
      { error: "Export job not found" },
      { status: 404 }
    );
  }

  return NextResponse.json({ exportJob: job });
}
