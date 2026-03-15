import Anthropic from "@anthropic-ai/sdk";
import { db } from "@/db";
import { settings } from "@/db/schema";
import { eq } from "drizzle-orm";
import { decrypt } from "@/lib/crypto";

async function getApiKey(): Promise<string> {
  const [row] = await db
    .select()
    .from(settings)
    .where(eq(settings.key, "anthropic_api_key"));

  if (!row) throw new Error("No API key configured. Set one in Admin → Settings.");
  return decrypt(row.value);
}

interface ArtifactResponse {
  html: string;
  acknowledgment: string;
}

export async function evolveArtifact(
  systemPrompt: string,
  previousHtml: string | null,
  userPrompt: string,
  frameNumber: number
): Promise<ArtifactResponse> {
  const apiKey = await getApiKey();
  const client = new Anthropic({ apiKey });

  const messages: Anthropic.MessageParam[] = [];

  if (previousHtml) {
    messages.push({
      role: "user",
      content: `Current artifact HTML (Frame ${frameNumber - 1}):\n\`\`\`html\n${previousHtml}\n\`\`\``,
    });
    messages.push({
      role: "assistant",
      content:
        "I see the current artifact state. Ready for the next participant's prompt.",
    });
  }

  messages.push({
    role: "user",
    content: `Frame ${frameNumber} prompt: ${userPrompt}\n\nRespond with JSON only: { "html": "...", "acknowledgment": "..." }`,
  });

  const response = await client.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 16000,
    system: systemPrompt,
    messages,
  });

  const text =
    response.content[0].type === "text" ? response.content[0].text : "";

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("Claude did not return valid JSON");
  }

  const parsed = JSON.parse(jsonMatch[0]) as ArtifactResponse;
  if (!parsed.html || !parsed.acknowledgment) {
    throw new Error("Missing html or acknowledgment in Claude response");
  }

  return parsed;
}
