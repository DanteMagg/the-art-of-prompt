import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { settings } from "@/db/schema";
import { eq } from "drizzle-orm";
import { isAdmin } from "@/lib/auth";
import { encrypt, decrypt, maskApiKey } from "@/lib/crypto";

const KEY_NAME = "anthropic_api_key";

export async function GET() {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [row] = await db
    .select()
    .from(settings)
    .where(eq(settings.key, KEY_NAME));

  if (!row) {
    return NextResponse.json({ hasKey: false, masked: null });
  }

  try {
    const raw = decrypt(row.value);
    return NextResponse.json({ hasKey: true, masked: maskApiKey(raw) });
  } catch {
    return NextResponse.json({ hasKey: false, masked: null });
  }
}

export async function POST(req: NextRequest) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { apiKey } = await req.json();

  if (!apiKey || typeof apiKey !== "string" || !apiKey.startsWith("sk-")) {
    return NextResponse.json(
      { error: "Invalid API key format" },
      { status: 400 }
    );
  }

  const encrypted = encrypt(apiKey);

  const [existing] = await db
    .select()
    .from(settings)
    .where(eq(settings.key, KEY_NAME));

  if (existing) {
    await db
      .update(settings)
      .set({ value: encrypted, updatedAt: new Date().toISOString() })
      .where(eq(settings.key, KEY_NAME));
  } else {
    await db.insert(settings).values({ key: KEY_NAME, value: encrypted });
  }

  return NextResponse.json({
    success: true,
    masked: maskApiKey(apiKey),
  });
}

export async function DELETE() {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await db.delete(settings).where(eq(settings.key, KEY_NAME));
  return NextResponse.json({ success: true });
}
