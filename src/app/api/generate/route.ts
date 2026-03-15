import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const { apiKey, previousHtml, promptText, frameNumber } = await req.json();

  if (!apiKey || !promptText) {
    return NextResponse.json(
      { error: "apiKey and promptText required" },
      { status: 400 }
    );
  }

  const systemPrompt = `You are a generative art system evolving a visual artifact based on sequential prompt instructions, always building upon its current state.

1. **SUBTLE MOTION** — The artifact should exhibit slow, autonomous animation (breathing, pulsing, gentle drift); pixel or dot-based rendering is preferred. Do not use cursor-only effects. The piece must feel alive even when untouched.

2. **MINIMALIST** — The appearance must be clean, geometric, and sparse. Use pixel grid snapping, layered opacity, and forms that subtly "breathe."

3. **INCREMENTAL** — You must always evolve and build on the existing visual. *Never* wipe or start fresh; do not replace, only evolve.

4. **NO PROMPT UI** — *Never* add input boxes, buttons, or controls to the artifact. The only interface is this chat.

5. **ACKNOWLEDGE EACH TURN** — After updating the artifact, output a brief plain-text note confirming what changed and the current frame number (e.g., "Frame 003 — added a grid of dots").

6. **BROKEN TELEPHONE** — Each participant sees only the current artifact, never the full history; interpret each prompt literally and do not over-correct past changes.

7. Render the artifact as a **single, self-contained HTML file** with all CSS and JS inline. No external dependencies. Canvas or SVG is preferred. Default to a dark background (#0a0a0a).

**Output as JSON with two fields:**
- \`html\` — the full artifact HTML string
- \`acknowledgment\` — the brief frame note`;

  try {
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
      content: `Frame ${frameNumber} prompt: ${promptText}\n\nRespond with JSON only: { "html": "...", "acknowledgment": "..." }`,
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
      return NextResponse.json(
        { error: "Claude did not return valid JSON" },
        { status: 502 }
      );
    }

    const parsed = JSON.parse(jsonMatch[0]);
    if (!parsed.html || !parsed.acknowledgment) {
      return NextResponse.json(
        { error: "Missing html or acknowledgment in response" },
        { status: 502 }
      );
    }

    return NextResponse.json(parsed);
  } catch (err: unknown) {
    const raw = err instanceof Error ? err.message : "Failed to generate";
    const isAuthError =
      raw.includes("401") ||
      raw.includes("auth") ||
      raw.includes("invalid x-api-key");

    const message = isAuthError
      ? "Invalid API key. Check your key and try again."
      : raw.length > 200
        ? "Claude generation failed. Try again."
        : raw;

    return NextResponse.json(
      { error: message },
      { status: isAuthError ? 401 : 500 }
    );
  }
}
