import { NextRequest, NextResponse } from "next/server";
import { verifyPin, setAdminCookie, clearAdminCookie, isAdmin } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const { pin } = await req.json();
  if (!pin) {
    return NextResponse.json({ error: "PIN required" }, { status: 400 });
  }

  const valid = await verifyPin(pin);
  if (!valid) {
    return NextResponse.json({ error: "Invalid PIN" }, { status: 401 });
  }

  await setAdminCookie();
  return NextResponse.json({ success: true });
}

export async function GET() {
  const admin = await isAdmin();
  return NextResponse.json({ authenticated: admin });
}

export async function DELETE() {
  await clearAdminCookie();
  return NextResponse.json({ success: true });
}
