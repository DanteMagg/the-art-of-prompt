"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ClaudeLogo } from "@/components/claude-logo";

interface Frame {
  number: number;
  promptText: string;
  html: string;
  acknowledgment: string;
  createdAt: number;
}

const API_KEY_STORAGE = "aop_api_key";
const SESSION_STORAGE = "aop_session";

function getStoredKey(): string {
  if (typeof window === "undefined") return "";
  return sessionStorage.getItem(API_KEY_STORAGE) ?? "";
}

function getStoredSession(): { title: string; frames: Frame[] } | null {
  if (typeof window === "undefined") return null;
  const raw = sessionStorage.getItem(SESSION_STORAGE);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function ApiKeySetup({ onReady }: { onReady: (key: string) => void }) {
  const [key, setKey] = useState("");

  return (
    <div className="flex h-screen items-center justify-center bg-background">
      <div className="w-96 space-y-6">
        <div className="space-y-2">
          <ClaudeLogo className="mx-auto h-10 w-10" />
          <h1 className="text-center font-mono text-xs tracking-widest text-muted-foreground uppercase">
            The Art of Prompt
          </h1>
        </div>
        <div className="space-y-3">
          <p className="text-center font-mono text-sm text-muted-foreground">
            Enter your Anthropic API key to begin.
            <br />
            <span className="text-[11px] text-muted-foreground/60">
              Stored in your browser session only. Gone when you close this tab.
            </span>
          </p>
          <Input
            type="password"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="sk-ant-..."
            className="font-mono text-sm"
            onKeyDown={(e) => e.key === "Enter" && key.trim() && onReady(key.trim())}
          />
          <Button
            onClick={() => key.trim() && onReady(key.trim())}
            disabled={!key.trim()}
            className="w-full rounded-sm bg-accent text-accent-foreground hover:bg-accent/90"
          >
            Continue
          </Button>
        </div>
      </div>
    </div>
  );
}

function SessionSetup({ onStart }: { onStart: (title: string) => void }) {
  const [title, setTitle] = useState("");

  return (
    <div className="flex h-screen items-center justify-center bg-background">
      <div className="w-96 space-y-6">
        <div className="space-y-2">
          <ClaudeLogo className="mx-auto h-10 w-10" />
          <h1 className="text-center font-mono text-xs tracking-widest text-muted-foreground uppercase">
            The Art of Prompt
          </h1>
        </div>
        <div className="space-y-3">
          <p className="text-center font-mono text-sm text-muted-foreground">
            Name this session to begin.
          </p>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Session title..."
            className="font-mono text-sm"
            onKeyDown={(e) =>
              e.key === "Enter" && title.trim() && onStart(title.trim())
            }
          />
          <Button
            onClick={() => title.trim() && onStart(title.trim())}
            disabled={!title.trim()}
            className="w-full rounded-sm bg-accent text-accent-foreground hover:bg-accent/90"
          >
            Start Session
          </Button>
        </div>
      </div>
    </div>
  );
}

function ArtifactViewer({ html }: { html: string }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe || !html) return;

    const doc = iframe.contentDocument;
    if (doc) {
      doc.open();
      doc.write(html);
      doc.close();
    }
  }, [html]);

  if (!html) {
    return (
      <div className="flex h-full items-center justify-center bg-[#0a0a0a]">
        <p className="font-mono text-sm text-muted-foreground">
          Submit a prompt to begin
        </p>
      </div>
    );
  }

  return (
    <iframe
      ref={iframeRef}
      className="h-full w-full border-0"
      sandbox="allow-scripts"
      title="Artifact"
    />
  );
}

function ActiveSession({
  apiKey,
  session,
  onUpdate,
  onEnd,
}: {
  apiKey: string;
  session: { title: string; frames: Frame[] };
  onUpdate: (frames: Frame[]) => void;
  onEnd: () => void;
}) {
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [ack, setAck] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showGallery, setShowGallery] = useState(false);

  const lastFrame = session.frames[session.frames.length - 1];
  const frameNumber = lastFrame ? lastFrame.number + 1 : 1;

  const handleSubmit = useCallback(async () => {
    if (!prompt.trim() || loading) return;
    setLoading(true);
    setAck(null);
    setError(null);

    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiKey,
          previousHtml: lastFrame?.html ?? null,
          promptText: prompt.trim(),
          frameNumber,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Generation failed");
      }

      const newFrame: Frame = {
        number: frameNumber,
        promptText: prompt.trim(),
        html: data.html,
        acknowledgment: data.acknowledgment,
        createdAt: Date.now(),
      };

      const newFrames = [...session.frames, newFrame];
      onUpdate(newFrames);
      setPrompt("");
      setAck(data.acknowledgment);
      setTimeout(() => setAck(null), 8000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Something went wrong";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [prompt, loading, apiKey, lastFrame, frameNumber, session.frames, onUpdate]);

  if (showGallery) {
    return (
      <div className="flex h-screen flex-col bg-background">
        <div className="flex items-center justify-between border-b border-border px-6 py-3">
          <h2 className="font-mono text-sm text-muted-foreground">
            {session.title} — {session.frames.length} frames
          </h2>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowGallery(false)}
            className="font-mono text-xs"
          >
            Back
          </Button>
        </div>
        <div className="flex-1 overflow-auto p-6">
          {session.frames.length === 0 ? (
            <p className="font-mono text-sm text-muted-foreground">
              No frames yet
            </p>
          ) : (
            <div className="space-y-4">
              {session.frames.map((f) => (
                <div
                  key={f.number}
                  className="border border-border bg-card p-4"
                >
                  <div className="mb-2 flex items-baseline justify-between">
                    <span className="font-mono text-sm font-bold text-accent">
                      Frame {String(f.number).padStart(3, "0")}
                    </span>
                    <span className="font-mono text-[10px] text-muted-foreground">
                      {new Date(f.createdAt).toLocaleTimeString()}
                    </span>
                  </div>
                  <p className="mb-1 font-mono text-xs text-foreground">
                    &quot;{f.promptText}&quot;
                  </p>
                  <p className="font-mono text-xs text-accent/70">
                    {f.acknowledgment}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden">
      {/* Left Panel */}
      <div className="flex w-[30%] min-w-[320px] flex-col border-r border-border bg-card p-6">
        <div className="mb-6">
          <ClaudeLogo className="mb-3 h-8 w-8" />
          <h1 className="font-mono text-xs tracking-widest text-muted-foreground uppercase">
            The Art of Prompt
          </h1>
        </div>

        <div className="mb-6">
          <p className="text-sm text-muted-foreground">{session.title}</p>
          <p
            className={`font-mono text-2xl font-bold text-foreground ${
              ack ? "animate-flash" : ""
            }`}
          >
            Frame {String(lastFrame?.number ?? 0).padStart(3, "0")}
          </p>
        </div>

        {error && (
          <div className="mb-4 border border-red-800 bg-red-950/50 p-3 font-mono text-xs text-red-400">
            {error}
            <button
              onClick={() => setError(null)}
              className="ml-2 text-red-600 hover:text-red-400"
            >
              ✕
            </button>
          </div>
        )}

        {ack && !error && (
          <div className="mb-4 border border-border bg-background p-3 font-mono text-xs text-accent">
            {ack}
          </div>
        )}

        <div className="mt-auto space-y-3">
          <Textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Describe one change..."
            disabled={loading}
            className="min-h-[100px] resize-none border-border bg-background font-mono text-sm text-foreground placeholder:text-muted-foreground focus-visible:ring-accent"
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                handleSubmit();
              }
            }}
          />
          <Button
            onClick={handleSubmit}
            disabled={loading || !prompt.trim()}
            className="w-full rounded-sm bg-accent text-accent-foreground hover:bg-accent/90"
          >
            {loading ? "Evolving..." : "Submit"}
          </Button>

          <div className="flex gap-2 pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowGallery(true)}
              className="flex-1 font-mono text-xs"
            >
              Gallery ({session.frames.length})
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={onEnd}
              className="font-mono text-xs text-muted-foreground"
            >
              New Session
            </Button>
          </div>
        </div>
      </div>

      {/* Right Panel — Artifact */}
      <div
        className={`flex-1 bg-[#0a0a0a] ${
          loading ? "border-4 animate-pulse-border" : ""
        }`}
      >
        <ArtifactViewer html={lastFrame?.html ?? ""} />
      </div>
    </div>
  );
}

export function PromptInterface() {
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [session, setSession] = useState<{
    title: string;
    frames: Frame[];
  } | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const storedKey = getStoredKey();
    const storedSession = getStoredSession();
    if (storedKey) setApiKey(storedKey);
    if (storedSession) setSession(storedSession);
    setReady(true);
  }, []);

  const handleApiKey = (key: string) => {
    sessionStorage.setItem(API_KEY_STORAGE, key);
    setApiKey(key);
  };

  const handleStartSession = (title: string) => {
    const newSession = { title, frames: [] };
    sessionStorage.setItem(SESSION_STORAGE, JSON.stringify(newSession));
    setSession(newSession);
  };

  const handleUpdateFrames = (frames: Frame[]) => {
    const updated = { ...session!, frames };
    sessionStorage.setItem(SESSION_STORAGE, JSON.stringify(updated));
    setSession(updated);
  };

  const handleEndSession = () => {
    sessionStorage.removeItem(SESSION_STORAGE);
    setSession(null);
  };

  if (!ready) return null;

  if (!apiKey) {
    return <ApiKeySetup onReady={handleApiKey} />;
  }

  if (!session) {
    return <SessionSetup onStart={handleStartSession} />;
  }

  return (
    <ActiveSession
      apiKey={apiKey}
      session={session}
      onUpdate={handleUpdateFrames}
      onEnd={handleEndSession}
    />
  );
}
