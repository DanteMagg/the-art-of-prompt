"use client";

import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { ClaudeLogo } from "@/components/claude-logo";
import { toast } from "sonner";

interface Frame {
  id: string;
  frameNumber: number;
  artifactHtml: string;
  acknowledgment: string;
  screenshotUrl: string | null;
}

interface Session {
  id: string;
  title: string;
  status: string;
}

export function PromptInterface() {
  const [prompt, setPrompt] = useState("");
  const [ack, setAck] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const { data: sessionData } = useQuery({
    queryKey: ["active-session"],
    queryFn: async () => {
      const res = await fetch("/api/sessions/active");
      return res.json() as Promise<{ session: Session | null }>;
    },
    refetchInterval: 5000,
  });

  const session = sessionData?.session;

  const { data: frameData } = useQuery({
    queryKey: ["latest-frame", session?.id],
    queryFn: async () => {
      const res = await fetch(
        `/api/frames/latest?sessionId=${session!.id}`
      );
      return res.json() as Promise<{ frame: Frame | null }>;
    },
    enabled: !!session?.id,
    refetchInterval: 3000,
  });

  const latestFrame = frameData?.frame;

  const submitMutation = useMutation({
    mutationFn: async (promptText: string) => {
      const res = await fetch("/api/frames", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: session!.id, promptText }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to submit");
      }
      return res.json() as Promise<{ frame: Frame }>;
    },
    onSuccess: (data) => {
      setPrompt("");
      setAck(data.frame.acknowledgment);
      queryClient.invalidateQueries({ queryKey: ["latest-frame"] });
      setTimeout(() => setAck(null), 6000);
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  const handleSubmit = useCallback(() => {
    if (!prompt.trim() || !session) return;
    submitMutation.mutate(prompt.trim());
  }, [prompt, session, submitMutation]);

  const artifactSrc = latestFrame?.artifactHtml
    ? `/render?frame=${encodeURIComponent(latestFrame.id)}`
    : null;

  const frameNumber = latestFrame?.frameNumber ?? 0;

  return (
    <div className="flex h-screen w-screen overflow-hidden">
      {/* Left Panel */}
      <div className="flex w-[30%] min-w-[320px] flex-col border-r border-border bg-card p-6">
        <div className="mb-8">
          <ClaudeLogo className="mb-3 h-8 w-8" />
          <h1 className="font-mono text-xs tracking-widest text-muted-foreground uppercase">
            The Art of Prompt
          </h1>
        </div>

        {session ? (
          <div className="flex flex-1 flex-col">
            <div className="mb-6">
              <p className="text-sm text-muted-foreground">{session.title}</p>
              <p
                className={`font-mono text-2xl font-bold text-foreground ${
                  submitMutation.isSuccess ? "animate-flash" : ""
                }`}
              >
                Frame {String(frameNumber).padStart(3, "0")}
              </p>
            </div>

            {ack && (
              <div className="mb-4 border border-border bg-background p-3 font-mono text-xs text-accent">
                {ack}
              </div>
            )}

            <div className="mt-auto">
              <Textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Describe one change..."
                disabled={submitMutation.isPending}
                className="mb-3 min-h-[100px] resize-none border-border bg-background font-mono text-sm text-foreground placeholder:text-muted-foreground focus-visible:ring-accent"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                    handleSubmit();
                  }
                }}
              />
              <Button
                onClick={handleSubmit}
                disabled={submitMutation.isPending || !prompt.trim()}
                className="w-full rounded-sm bg-accent text-accent-foreground hover:bg-accent/90"
              >
                {submitMutation.isPending ? "Evolving..." : "Submit"}
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-1 items-center justify-center">
            <p className="text-center font-mono text-sm text-muted-foreground">
              Waiting for session...
            </p>
          </div>
        )}
      </div>

      {/* Right Panel — Artifact */}
      <div
        className={`flex-1 bg-background ${
          submitMutation.isPending ? "border-4 animate-pulse-border" : ""
        }`}
      >
        {artifactSrc ? (
          <iframe
            src={artifactSrc}
            className="h-full w-full border-0"
            sandbox="allow-scripts"
            title="Artifact"
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <div className="text-center">
              <div className="mx-auto mb-4 h-16 w-16 rounded-full border border-border" />
              <p className="font-mono text-sm text-muted-foreground">
                {session
                  ? "Submit a prompt to begin"
                  : "No active session"}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
