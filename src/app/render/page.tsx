import { db } from "@/db";
import { frames } from "@/db/schema";
import { eq } from "drizzle-orm";
import { RenderClient } from "./render-client";

export default async function RenderPage({
  searchParams,
}: {
  searchParams: Promise<{ frame?: string; html?: string }>;
}) {
  const params = await searchParams;
  let html = "";

  if (params.frame) {
    const [frame] = await db
      .select()
      .from(frames)
      .where(eq(frames.id, params.frame));
    html = frame?.artifactHtml ?? "";
  } else if (params.html) {
    try {
      html = decodeURIComponent(params.html);
    } catch {
      html = params.html;
    }
  }

  return <RenderClient html={html} />;
}
