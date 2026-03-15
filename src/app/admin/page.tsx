"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

interface Session {
  id: string;
  title: string;
  status: string;
  createdAt: string;
  endedAt: string | null;
}

interface Frame {
  id: string;
  frameNumber: number;
  promptText: string;
  acknowledgment: string;
  screenshotUrl: string | null;
  createdAt: string;
}

interface ExportJob {
  id: string;
  status: string;
  outputUrl: string | null;
  errorMessage: string | null;
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
    if (res.ok) {
      onAuth();
    } else {
      setError("Invalid PIN");
    }
  };

  return (
    <div className="flex h-screen items-center justify-center bg-background">
      <Card className="w-80 border-border bg-card">
        <CardHeader>
          <CardTitle className="font-mono text-sm">Admin Access</CardTitle>
          <CardDescription>Enter PIN to continue</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <Input
              type="password"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              placeholder="PIN"
              className="font-mono"
              onKeyDown={(e) => e.key === "Enter" && submit()}
            />
            {error && <p className="text-xs text-destructive">{error}</p>}
            <Button
              onClick={submit}
              className="w-full rounded-sm bg-accent text-accent-foreground"
            >
              Authenticate
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function ApiKeyCard() {
  const queryClient = useQueryClient();
  const [newKey, setNewKey] = useState("");
  const [showInput, setShowInput] = useState(false);

  const { data } = useQuery({
    queryKey: ["api-key-status"],
    queryFn: async () => {
      const res = await fetch("/api/settings/api-key");
      return res.json() as Promise<{ hasKey: boolean; masked: string | null }>;
    },
  });

  const saveKey = useMutation({
    mutationFn: async (apiKey: string) => {
      const res = await fetch("/api/settings/api-key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error);
      }
      return res.json();
    },
    onSuccess: () => {
      setNewKey("");
      setShowInput(false);
      queryClient.invalidateQueries({ queryKey: ["api-key-status"] });
      toast.success("API key saved");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteKey = useMutation({
    mutationFn: async () => {
      await fetch("/api/settings/api-key", { method: "DELETE" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["api-key-status"] });
      toast.success("API key removed");
    },
  });

  return (
    <Card className="border-border bg-card">
      <CardHeader>
        <CardTitle className="font-mono text-sm">Anthropic API Key</CardTitle>
        <CardDescription className="font-mono text-xs">
          Required for Claude to generate artifacts. Encrypted at rest.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {data?.hasKey && !showInput ? (
          <div className="flex items-center gap-3">
            <code className="flex-1 border border-border bg-background px-3 py-2 font-mono text-sm text-muted-foreground">
              {data.masked}
            </code>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowInput(true)}
              className="font-mono text-xs"
            >
              Replace
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => deleteKey.mutate()}
              className="font-mono text-xs"
            >
              Delete
            </Button>
          </div>
        ) : (
          <div className="flex gap-3">
            <Input
              type="password"
              value={newKey}
              onChange={(e) => setNewKey(e.target.value)}
              placeholder="sk-ant-..."
              className="font-mono"
              onKeyDown={(e) =>
                e.key === "Enter" && newKey.trim() && saveKey.mutate(newKey.trim())
              }
            />
            <Button
              onClick={() => newKey.trim() && saveKey.mutate(newKey.trim())}
              disabled={!newKey.trim() || saveKey.isPending}
              className="rounded-sm bg-accent text-accent-foreground"
            >
              Save
            </Button>
            {data?.hasKey && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setShowInput(false);
                  setNewKey("");
                }}
                className="font-mono text-xs"
              >
                Cancel
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function AdminDashboard() {
  const queryClient = useQueryClient();
  const [newTitle, setNewTitle] = useState("");
  const [exportFormat, setExportFormat] = useState("mp4");
  const [exportJobId, setExportJobId] = useState<string | null>(null);

  const { data: sessionsData } = useQuery({
    queryKey: ["admin-sessions"],
    queryFn: async () => {
      const res = await fetch("/api/sessions");
      return res.json() as Promise<{ sessions: Session[] }>;
    },
    refetchInterval: 5000,
  });

  const sessions = sessionsData?.sessions ?? [];
  const activeSession = sessions.find((s) => s.status === "active");

  const { data: framesData } = useQuery({
    queryKey: ["admin-frames", activeSession?.id],
    queryFn: async () => {
      const res = await fetch(
        `/api/frames?sessionId=${activeSession!.id}`
      );
      return res.json() as Promise<{ frames: Frame[] }>;
    },
    enabled: !!activeSession?.id,
    refetchInterval: 3000,
  });

  const framesList = framesData?.frames ?? [];
  const lastFrame = framesList[framesList.length - 1];

  const { data: exportData } = useQuery({
    queryKey: ["export-job", exportJobId],
    queryFn: async () => {
      const res = await fetch(`/api/exports/${exportJobId}`);
      return res.json() as Promise<{ exportJob: ExportJob }>;
    },
    enabled: !!exportJobId,
    refetchInterval: 2000,
  });

  const createSession = useMutation({
    mutationFn: async (title: string) => {
      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error);
      }
      return res.json();
    },
    onSuccess: () => {
      setNewTitle("");
      queryClient.invalidateQueries({ queryKey: ["admin-sessions"] });
      toast.success("Session created");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const endSession = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/sessions/${id}/end`, { method: "PATCH" });
      if (!res.ok) throw new Error("Failed to end session");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-sessions"] });
      toast.success("Session ended");
    },
  });

  const triggerExport = useMutation({
    mutationFn: async ({
      sessionId,
      format,
    }: {
      sessionId: string;
      format: string;
    }) => {
      const res = await fetch("/api/exports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, format }),
      });
      if (!res.ok) throw new Error("Failed to create export");
      return res.json() as Promise<{ exportJob: ExportJob }>;
    },
    onSuccess: (data) => {
      setExportJobId(data.exportJob.id);
      toast.success("Export started");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="font-mono text-lg text-foreground">
            Admin Dashboard
          </h1>
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              await fetch("/api/auth", { method: "DELETE" });
              window.location.reload();
            }}
            className="font-mono text-xs"
          >
            Logout
          </Button>
        </div>

        <ApiKeyCard />

        {/* Create Session */}
        {!activeSession && (
          <Card className="border-border bg-card">
            <CardHeader>
              <CardTitle className="font-mono text-sm">
                Start New Session
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex gap-3">
                <Input
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="Session title"
                  className="font-mono"
                  onKeyDown={(e) =>
                    e.key === "Enter" &&
                    newTitle.trim() &&
                    createSession.mutate(newTitle.trim())
                  }
                />
                <Button
                  onClick={() =>
                    newTitle.trim() && createSession.mutate(newTitle.trim())
                  }
                  className="rounded-sm bg-accent text-accent-foreground"
                >
                  Start
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Active Session */}
        {activeSession && (
          <Card className="border-accent/30 bg-card">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="font-mono text-sm">
                    {activeSession.title}
                  </CardTitle>
                  <CardDescription className="font-mono text-xs">
                    Session active
                  </CardDescription>
                </div>
                <div className="flex items-center gap-3">
                  <Badge
                    variant="outline"
                    className="border-accent text-accent"
                  >
                    {framesList.length} frames
                  </Badge>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => endSession.mutate(activeSession.id)}
                    className="font-mono text-xs"
                  >
                    End Session
                  </Button>
                </div>
              </div>
            </CardHeader>
            {lastFrame && (
              <CardContent>
                <div className="space-y-2">
                  <p className="font-mono text-xs text-muted-foreground">
                    Last prompt:
                  </p>
                  <p className="font-mono text-sm text-foreground">
                    &quot;{lastFrame.promptText}&quot;
                  </p>
                  <p className="font-mono text-xs text-accent">
                    {lastFrame.acknowledgment}
                  </p>
                  {lastFrame.screenshotUrl && (
                    <img
                      src={lastFrame.screenshotUrl}
                      alt={`Frame ${lastFrame.frameNumber}`}
                      className="mt-2 h-40 rounded border border-border object-cover"
                    />
                  )}
                </div>
              </CardContent>
            )}
          </Card>
        )}

        {/* Export */}
        {sessions.filter((s) => s.status !== "active").length > 0 && (
          <Card className="border-border bg-card">
            <CardHeader>
              <CardTitle className="font-mono text-sm">
                Export Session
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex gap-3">
                <Select
                  value={exportFormat}
                  onValueChange={(v) => v && setExportFormat(v)}
                >
                  <SelectTrigger className="w-32 font-mono">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="mp4">MP4</SelectItem>
                    <SelectItem value="gif">GIF</SelectItem>
                    <SelectItem value="zip">ZIP</SelectItem>
                  </SelectContent>
                </Select>
                {sessions
                  .filter((s) => s.status !== "active")
                  .map((s) => (
                    <Button
                      key={s.id}
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        triggerExport.mutate({
                          sessionId: s.id,
                          format: exportFormat,
                        })
                      }
                      className="font-mono text-xs"
                    >
                      Export &quot;{s.title}&quot;
                    </Button>
                  ))}
              </div>
              {exportData?.exportJob && (
                <div className="mt-3 font-mono text-xs">
                  <p>
                    Status:{" "}
                    <Badge variant="outline">
                      {exportData.exportJob.status}
                    </Badge>
                  </p>
                  {exportData.exportJob.outputUrl && (
                    <a
                      href={exportData.exportJob.outputUrl}
                      className="text-accent underline"
                      target="_blank"
                      rel="noreferrer"
                    >
                      Download
                    </a>
                  )}
                  {exportData.exportJob.errorMessage && (
                    <p className="text-destructive">
                      {exportData.exportJob.errorMessage}
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Session History */}
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="font-mono text-sm">All Sessions</CardTitle>
          </CardHeader>
          <CardContent>
            {sessions.length === 0 ? (
              <p className="font-mono text-xs text-muted-foreground">
                No sessions yet
              </p>
            ) : (
              <div className="space-y-2">
                {sessions.map((s) => (
                  <div
                    key={s.id}
                    className="flex items-center justify-between border-b border-border py-2 last:border-0"
                  >
                    <div>
                      <p className="font-mono text-sm">{s.title}</p>
                      <p className="font-mono text-xs text-muted-foreground">
                        {new Date(s.createdAt).toLocaleString()}
                      </p>
                    </div>
                    <Badge
                      variant="outline"
                      className={
                        s.status === "active"
                          ? "border-accent text-accent"
                          : ""
                      }
                    >
                      {s.status}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function AdminPage() {
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

  if (checking) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <p className="font-mono text-sm text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (!authed) {
    return <PinGate onAuth={() => setAuthed(true)} />;
  }

  return <AdminDashboard />;
}
