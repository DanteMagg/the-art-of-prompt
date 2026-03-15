"use client";

import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { ClaudeLogo } from "@/components/claude-logo";

interface Session {
  id: string;
  title: string;
  status: string;
  createdAt: string;
}

interface Frame {
  id: string;
  frameNumber: number;
  promptText: string;
  acknowledgment: string;
  screenshotUrl: string | null;
}

function PinGate({ onAuth }: { onAuth: () => void }) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");

  const submit = async () => {
    setError("");
    const res = await fetch("/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin }),
    });
    if (res.ok) onAuth();
    else setError("Invalid PIN");
  };

  return (
    <div className="flex h-screen items-center justify-center bg-background">
      <div className="w-72 space-y-3">
        <p className="font-mono text-sm text-muted-foreground">
          Enter PIN to view gallery
        </p>
        <input
          type="password"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          className="w-full border border-border bg-background px-3 py-2 font-mono text-sm text-foreground"
          placeholder="PIN"
        />
        {error && <p className="text-xs text-destructive">{error}</p>}
        <button
          onClick={submit}
          className="w-full rounded-sm bg-accent px-4 py-2 font-mono text-sm text-accent-foreground"
        >
          Enter
        </button>
      </div>
    </div>
  );
}

function GalleryView() {
  const [selectedSession, setSelectedSession] = useState<string | null>(null);

  const { data: sessionsData } = useQuery({
    queryKey: ["gallery-sessions"],
    queryFn: async () => {
      const res = await fetch("/api/sessions");
      return res.json() as Promise<{ sessions: Session[] }>;
    },
  });

  const sessions =
    sessionsData?.sessions?.filter((s) => s.status !== "active") ?? [];

  const { data: framesData } = useQuery({
    queryKey: ["gallery-frames", selectedSession],
    queryFn: async () => {
      const res = await fetch(
        `/api/frames?sessionId=${selectedSession}`
      );
      return res.json() as Promise<{ frames: Frame[] }>;
    },
    enabled: !!selectedSession,
  });

  const framesList = framesData?.frames ?? [];

  useEffect(() => {
    if (sessions.length > 0 && !selectedSession) {
      setSelectedSession(sessions[0].id);
    }
  }, [sessions, selectedSession]);

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex items-center gap-3">
          <ClaudeLogo className="h-6 w-6" />
          <h1 className="font-mono text-sm tracking-widest text-muted-foreground uppercase">
            Gallery
          </h1>
        </div>

        {/* Session selector */}
        <div className="mb-6 flex gap-2">
          {sessions.map((s) => (
            <button
              key={s.id}
              onClick={() => setSelectedSession(s.id)}
              className={`border px-3 py-1.5 font-mono text-xs transition-colors ${
                selectedSession === s.id
                  ? "border-accent bg-accent/10 text-accent"
                  : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {s.title}
              <Badge variant="outline" className="ml-2 text-[10px]">
                {s.status}
              </Badge>
            </button>
          ))}
        </div>

        {/* Filmstrip */}
        {framesList.length === 0 ? (
          <p className="font-mono text-sm text-muted-foreground">
            {selectedSession ? "No frames in this session" : "Select a session"}
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {framesList.map((frame) => (
              <div key={frame.id} className="group relative">
                <div className="aspect-video overflow-hidden border border-border bg-card">
                  {frame.screenshotUrl ? (
                    <img
                      src={frame.screenshotUrl}
                      alt={`Frame ${frame.frameNumber}`}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center">
                      <span className="font-mono text-xs text-muted-foreground">
                        No screenshot
                      </span>
                    </div>
                  )}
                </div>
                {/* Hover overlay */}
                <div className="pointer-events-none absolute inset-0 flex flex-col justify-end bg-black/80 p-2 opacity-0 transition-opacity group-hover:opacity-100">
                  <p className="font-mono text-xs font-bold text-accent">
                    Frame {String(frame.frameNumber).padStart(3, "0")}
                  </p>
                  <p className="mt-1 line-clamp-2 font-mono text-[10px] text-foreground/80">
                    {frame.promptText}
                  </p>
                  <p className="mt-0.5 line-clamp-1 font-mono text-[10px] text-accent/70">
                    {frame.acknowledgment}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function GalleryPage() {
  const [authed, setAuthed] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    fetch("/api/auth")
      .then((r) => r.json())
      .then((d) => {
        setAuthed(d.authenticated);
        setChecking(false);
      })
      .catch(() => setChecking(false));
  }, []);

  if (checking) return null;
  if (!authed) return <PinGate onAuth={() => setAuthed(true)} />;
  return <GalleryView />;
}
