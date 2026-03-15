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
    <div className="flex h-screen items-center justify-center">
      <div className="w-80 space-y-8">
        <div className="space-y-1">
          <ClaudeLogo className="h-6 w-6 text-foreground" />
          <p className="text-[11px] tracking-wide text-muted-foreground uppercase">
            The Art of Prompt
          </p>
        </div>
        <div className="space-y-3">
          <div>
            <p className="text-sm text-foreground">Enter your API key</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Stored in this tab only. Gone when you close it.
            </p>
          </div>
          <Input
            type="password"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="sk-ant-..."
            className="text-sm"
            onKeyDown={(e) => e.key === "Enter" && key.trim() && onReady(key.trim())}
          />
          <Button
            onClick={() => key.trim() && onReady(key.trim())}
            disabled={!key.trim()}
            className="w-full"
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
    <div className="flex h-screen items-center justify-center">
      <div className="w-80 space-y-8">
        <div className="space-y-1">
          <ClaudeLogo className="h-6 w-6 text-foreground" />
          <p className="text-[11px] tracking-wide text-muted-foreground uppercase">
            The Art of Prompt
          </p>
        </div>
        <div className="space-y-3">
          <p className="text-sm text-foreground">Name this session</p>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Session title"
            className="text-sm"
            onKeyDown={(e) =>
              e.key === "Enter" && title.trim() && onStart(title.trim())
            }
          />
          <Button
            onClick={() => title.trim() && onStart(title.trim())}
            disabled={!title.trim()}
            className="w-full"
          >
            Start
          </Button>
        </div>
      </div>
    </div>
  );
}

function IdleCanvas() {
  return (
    <div className="flex h-full items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-6">
        <div className="relative h-12 w-12">
          <div className="absolute inset-0 rounded-full border border-border" />
          <div
            className="absolute inset-0 rounded-full border border-foreground/20"
            style={{
              clipPath: "inset(0 0 50% 0)",
              animation: "spin 3s linear infinite",
            }}
          />
          <div
            className="absolute inset-2 rounded-full border border-foreground/10"
            style={{ animation: "spin 5s linear infinite reverse" }}
          />
          <div className="absolute inset-[18px] rounded-full bg-foreground/5" />
        </div>
        <p className="text-xs text-muted-foreground">Waiting for a prompt</p>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  );
}

function LoadingCanvas() {
  return (
    <div className="flex h-full items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-6">
        <div className="relative h-12 w-12">
          <div className="absolute inset-0 rounded-full border-2 border-foreground/10" />
          <div
            className="absolute inset-0 rounded-full border-2 border-transparent border-t-foreground/40"
            style={{ animation: "spin 1s linear infinite" }}
          />
        </div>
        <p className="text-xs text-muted-foreground">Evolving...</p>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  );
}

function ArtifactViewer({ html, loading }: { html: string; loading: boolean }) {
  if (!html) return loading ? <LoadingCanvas /> : <IdleCanvas />;

  return (
    <iframe
      srcDoc={html}
      className="h-full w-full border-0"
      sandbox="allow-scripts"
      title="Artifact"
    />
  );
}

// ── Gallery with timelapse + export ──

function GalleryView({
  session,
  onBack,
}: {
  session: { title: string; frames: Frame[] };
  onBack: () => void;
}) {
  const [selectedIdx, setSelectedIdx] = useState(session.frames.length - 1);
  const [playing, setPlaying] = useState(false);
  const [fps, setFps] = useState(2);
  const [exporting, setExporting] = useState(false);
  const playRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const frames = session.frames;
  const current = frames[selectedIdx];

  useEffect(() => {
    if (playing) {
      playRef.current = setInterval(() => {
        setSelectedIdx((prev) => {
          const next = prev + 1;
          if (next >= frames.length) {
            setPlaying(false);
            return prev;
          }
          return next;
        });
      }, 1000 / fps);
    }
    return () => {
      if (playRef.current) clearInterval(playRef.current);
    };
  }, [playing, fps, frames.length]);

  const handlePlay = () => {
    if (selectedIdx >= frames.length - 1) setSelectedIdx(0);
    setPlaying(true);
  };

  const handleDownloadZip = async () => {
    const { default: JSZip } = await import("jszip");
    const zip = new JSZip();

    frames.forEach((f) => {
      zip.file(
        `frame-${String(f.number).padStart(3, "0")}.html`,
        f.html
      );
    });

    const manifest = frames.map((f) => ({
      frame: f.number,
      prompt: f.promptText,
      acknowledgment: f.acknowledgment,
      createdAt: new Date(f.createdAt).toISOString(),
    }));
    zip.file("manifest.json", JSON.stringify(manifest, null, 2));

    const blob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${session.title.replace(/\s+/g, "-").toLowerCase()}-frames.zip`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleRecordTimelapse = async () => {
    if (!iframeRef.current || frames.length < 2) return;
    setExporting(true);

    try {
      const canvas = document.createElement("canvas");
      canvas.width = 1280;
      canvas.height = 720;
      const ctx = canvas.getContext("2d")!;
      const stream = canvas.captureStream(30);
      const recorder = new MediaRecorder(stream, {
        mimeType: "video/webm;codecs=vp9",
      });

      const chunks: BlobPart[] = [];
      recorder.ondataavailable = (e) => chunks.push(e.data);

      const done = new Promise<void>((resolve) => {
        recorder.onstop = () => resolve();
      });

      recorder.start();

      for (let i = 0; i < frames.length; i++) {
        setSelectedIdx(i);
        // Let the iframe render
        await new Promise((r) => setTimeout(r, 200));

        try {
          const iframe = iframeRef.current;
          if (iframe) {
            const iframeDoc =
              iframe.contentDocument || iframe.contentWindow?.document;
            if (iframeDoc?.body) {
              const { default: html2canvas } = await import("html2canvas");
              const capture = await html2canvas(iframeDoc.body, {
                width: 1280,
                height: 720,
                backgroundColor: "#FBF8EF",
              });
              ctx.drawImage(capture, 0, 0, 1280, 720);
            }
          }
        } catch {
          ctx.fillStyle = "#FBF8EF";
          ctx.fillRect(0, 0, 1280, 720);
          ctx.fillStyle = "#1a1a1a";
          ctx.font = "16px Inter, sans-serif";
          ctx.fillText(`Frame ${frames[i].number}`, 40, 40);
        }

        // Hold each frame for the configured duration
        const holdMs = 1000 / fps;
        await new Promise((r) => setTimeout(r, holdMs));
      }

      recorder.stop();
      await done;

      const blob = new Blob(chunks, { type: "video/webm" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${session.title.replace(/\s+/g, "-").toLowerCase()}-timelapse.webm`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Recording failed:", err);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="flex h-screen flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between border-b px-6 py-3">
        <p className="text-sm text-foreground">
          {session.title}
          <span className="ml-2 text-muted-foreground">
            {frames.length} frames
          </span>
        </p>
        <div className="flex items-center gap-3">
          <button
            onClick={handleDownloadZip}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Download ZIP
          </button>
          <button
            onClick={handleRecordTimelapse}
            disabled={exporting || frames.length < 2}
            className="text-xs text-muted-foreground hover:text-foreground disabled:opacity-40"
          >
            {exporting ? "Recording..." : "Export Video"}
          </button>
          <button
            onClick={onBack}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Back
          </button>
        </div>
      </div>

      {/* Main area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Preview */}
        <div className="flex flex-1 flex-col">
          <div className="flex-1 bg-background">
            {current ? (
              <iframe
                ref={iframeRef}
                srcDoc={current.html}
                className="h-full w-full border-0"
                sandbox="allow-scripts allow-same-origin"
                title={`Frame ${current.number}`}
              />
            ) : (
              <div className="flex h-full items-center justify-center">
                <p className="text-sm text-muted-foreground">No frames</p>
              </div>
            )}
          </div>

          {/* Playback controls */}
          {frames.length > 0 && (
            <div className="flex items-center gap-4 border-t px-6 py-3">
              <button
                onClick={playing ? () => setPlaying(false) : handlePlay}
                className="text-xs font-medium text-foreground"
              >
                {playing ? "Pause" : "Play"}
              </button>

              <input
                type="range"
                min={0}
                max={frames.length - 1}
                value={selectedIdx}
                onChange={(e) => {
                  setPlaying(false);
                  setSelectedIdx(Number(e.target.value));
                }}
                className="flex-1 accent-foreground"
              />

              <span className="w-12 text-right text-xs tabular-nums text-muted-foreground">
                {String(current?.number ?? 0).padStart(3, "0")}
              </span>

              <div className="flex items-center gap-1 border-l pl-4">
                <label className="text-[10px] text-muted-foreground">FPS</label>
                <select
                  value={fps}
                  onChange={(e) => setFps(Number(e.target.value))}
                  className="bg-transparent text-xs text-foreground"
                >
                  <option value={1}>1</option>
                  <option value={2}>2</option>
                  <option value={4}>4</option>
                  <option value={8}>8</option>
                </select>
              </div>
            </div>
          )}
        </div>

        {/* Frame list sidebar */}
        <div className="w-64 overflow-y-auto border-l">
          {frames.map((f, i) => (
            <button
              key={f.number}
              onClick={() => {
                setPlaying(false);
                setSelectedIdx(i);
              }}
              className={`w-full border-b px-4 py-3 text-left transition-colors ${
                i === selectedIdx
                  ? "bg-card"
                  : "hover:bg-card/50"
              }`}
            >
              <div className="flex items-baseline justify-between">
                <span className="text-xs font-medium text-foreground">
                  {String(f.number).padStart(3, "0")}
                </span>
                <span className="text-[10px] text-muted-foreground">
                  {new Date(f.createdAt).toLocaleTimeString()}
                </span>
              </div>
              <p className="mt-1 line-clamp-2 text-[11px] text-muted-foreground">
                {f.promptText}
              </p>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Main active session ──

function ActiveSession({
  apiKey,
  session,
  onUpdate,
  onEnd,
  onChangeKey,
}: {
  apiKey: string;
  session: { title: string; frames: Frame[] };
  onUpdate: (frames: Frame[]) => void;
  onEnd: () => void;
  onChangeKey: () => void;
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
      <GalleryView
        session={session}
        onBack={() => setShowGallery(false)}
      />
    );
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden">
      {/* Left Panel */}
      <div className="flex w-[30%] min-w-[300px] flex-col border-r p-6">
        <div className="mb-8">
          <ClaudeLogo className="mb-2 h-5 w-5 text-foreground" />
          <p className="text-[11px] tracking-wide text-muted-foreground uppercase">
            The Art of Prompt
          </p>
        </div>

        <div className="mb-6">
          <p className="text-xs text-muted-foreground">{session.title}</p>
          <p
            className={`mt-1 text-3xl font-light tracking-tight text-foreground ${
              ack ? "animate-flash" : ""
            }`}
          >
            {String(lastFrame?.number ?? 0).padStart(3, "0")}
          </p>
        </div>

        {error && (
          <div className="mb-4 border border-red-200 bg-red-50 p-3 text-xs text-red-700">
            <div className="flex items-start justify-between gap-2">
              <span>{error}</span>
              <button
                onClick={() => setError(null)}
                className="shrink-0 text-red-400 hover:text-red-600"
              >
                ✕
              </button>
            </div>
            {error.toLowerCase().includes("api key") && (
              <button
                onClick={onChangeKey}
                className="mt-2 text-[11px] text-red-500 underline hover:text-red-700"
              >
                Change API key
              </button>
            )}
          </div>
        )}

        {ack && !error && (
          <div className="mb-4 text-xs text-muted-foreground">{ack}</div>
        )}

        <div className="mt-auto space-y-3">
          <Textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Describe one change..."
            disabled={loading}
            className="min-h-[100px] resize-none text-sm placeholder:text-muted-foreground"
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                handleSubmit();
              }
            }}
          />
          <Button
            onClick={handleSubmit}
            disabled={loading || !prompt.trim()}
            className="w-full"
          >
            {loading ? "Evolving..." : "Submit"}
          </Button>

          <div className="flex gap-2 pt-1">
            <button
              onClick={() => setShowGallery(true)}
              className="mr-auto text-xs text-muted-foreground hover:text-foreground"
            >
              Gallery ({session.frames.length})
            </button>
            <button
              onClick={onEnd}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              New Session
            </button>
          </div>
        </div>
      </div>

      {/* Right Panel — Artifact */}
      <div className="flex-1">
        <ArtifactViewer html={lastFrame?.html ?? ""} loading={loading} />
      </div>
    </div>
  );
}

// ── Root ──

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

  if (!apiKey) return <ApiKeySetup onReady={handleApiKey} />;

  if (!session) return <SessionSetup onStart={handleStartSession} />;

  const handleChangeKey = () => {
    sessionStorage.removeItem(API_KEY_STORAGE);
    setApiKey(null);
  };

  return (
    <ActiveSession
      apiKey={apiKey}
      session={session}
      onUpdate={handleUpdateFrames}
      onEnd={handleEndSession}
      onChangeKey={handleChangeKey}
    />
  );
}
