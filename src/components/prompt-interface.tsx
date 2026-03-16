"use client";

import { useState, useCallback, useEffect, useLayoutEffect, useRef, useMemo } from "react";
import Anthropic from "@anthropic-ai/sdk";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ClaudeLogo } from "@/components/claude-logo";
import { TEMPLATES, type Template } from "@/lib/templates";

// ── Types ──

interface Frame {
  number: number;
  promptText: string;
  html: string;
  acknowledgment: string;
  suggestions?: string[];
  createdAt: number;
}

interface SessionData {
  title: string;
  frames: Frame[];
  style: string;
}

// ── Constants ──

const IS_MAC = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.userAgent);

const API_KEY_STORAGE = "aop_api_key";
const SESSION_STORAGE = "aop_session";
const MODEL_STORAGE = "aop_model";
const AUTOSAVE_STORAGE = "aop_autosave";

const MODELS = [
  { id: "claude-sonnet-4-6", label: "Sonnet 4.6", desc: "Latest" },
  { id: "claude-sonnet-4-5", label: "Sonnet 4.5", desc: "Best balance" },
  { id: "claude-opus-4", label: "Opus 4", desc: "Highest quality" },
  { id: "claude-haiku-3-5", label: "Haiku 3.5", desc: "Fastest" },
] as const;

type ModelId = (typeof MODELS)[number]["id"];

const STYLE_PRESETS = [
  { id: "default", label: "Default", modifier: "" },
  {
    id: "pixel",
    label: "Pixel Art",
    modifier:
      "STYLE: Use a pixel art / 8-bit aesthetic. Grid-snapped forms, limited color palette (4-8 colors), chunky rectangular shapes, no anti-aliasing. Think retro game sprites and tile maps.",
  },
  {
    id: "geometric",
    label: "Geometric",
    modifier:
      "STYLE: Use hard geometric edges, mathematical patterns, and primary colors. Prefer SVG. Think Mondrian, Bauhaus, tessellations, and sacred geometry.",
  },
  {
    id: "organic",
    label: "Organic",
    modifier:
      "STYLE: Use fluid, organic shapes with smooth gradients and natural motion. Soft curves, earthy or oceanic color palette, flowing forms that feel alive. Think bioluminescence, coral, flowing water.",
  },
  {
    id: "brutalist",
    label: "Brutalist",
    modifier:
      "STYLE: Raw, high-contrast, monochrome aesthetic. Bold black-and-white, harsh lines, glitch-friendly textures, large bold typography if any text. Think brutalist web design, concrete, raw materials.",
  },
  {
    id: "neon",
    label: "Neon",
    modifier:
      "STYLE: Dark background (#0a0a0f or similar) with vibrant neon glowing colors (cyan, magenta, electric blue, hot pink). Synthwave / cyberpunk feel. Glow effects, scanlines optional. Bright on dark.",
  },
] as const;

type StyleId = (typeof STYLE_PRESETS)[number]["id"];

const QUICK_ACTIONS = [
  "More subtle",
  "More motion",
  "Simplify",
  "Shift palette",
  "Add depth",
];

const INITIAL_SUGGESTIONS = [
  "A field of fireflies",
  "Ripples on still water",
  "Slowly rotating geometry",
];

const MAX_HTML_CONTEXT = 50_000;

// ── System Prompt ──

const BASE_SYSTEM_PROMPT = `You are a generative art system evolving a visual artifact based on sequential prompt instructions, always building upon its current state.

1. **SUBTLE MOTION** — The artifact should exhibit slow, autonomous animation (breathing, pulsing, gentle drift); pixel or dot-based rendering is preferred. Do not use cursor-only effects. The piece must feel alive even when untouched.

2. **MINIMALIST** — The appearance must be clean, geometric, and sparse. Use pixel grid snapping, layered opacity, and forms that subtly "breathe." Favor a light, bright aesthetic.

3. **INCREMENTAL** — You must always evolve and build on the existing visual. *Never* wipe or start fresh; do not replace, only evolve.

4. **NO PROMPT UI** — *Never* add input boxes, buttons, or controls to the artifact. The only interface is this chat.

5. **ACKNOWLEDGE EACH TURN** — After updating the artifact, output a brief plain-text note confirming what changed and the current frame number (e.g., "Frame 003 — added a grid of dots").

6. **BROKEN TELEPHONE / FRAME = FINAL STATE** — Each participant sees only the current artifact, never the full history. Interpret each prompt literally and do not over-correct past changes. CRITICAL: Each frame must show the **end result** of the latest prompt as a steady-state or looping animation. Do NOT replay prior frames as sequential phases. If the previous frame showed particles forming "HELLO" and the new prompt says "explode them", the new frame starts with particles already in HELLO position and then shows the explosion — it does NOT re-animate the formation first. Never build multi-phase timer-based state machines that accumulate across frames.

7. Render the artifact as a **single, self-contained HTML file** with all CSS and JS inline. No external dependencies. Canvas or SVG is preferred. Default to a warm white/cream background (#FBF8EF or #FAFAFA) with darker accents (#1a1a1a, #333, muted earth tones). The overall palette should feel bright and airy, not dark, unless the user explicitly requests a dark theme. **SPATIAL CONSISTENCY** — When elements need to connect (e.g., flower stems to ground, branches to trunk, wires to nodes), compute the distance dynamically rather than using hardcoded sizes. A stem should span from the flower head down to the ground line, not be a fixed 6px that floats in mid-air.

8. **ROBUSTNESS** — Always wrap animation logic in try/catch and use requestAnimationFrame for animation loops. Ensure content is visible and centered within the viewport immediately on load. Include \`<meta name="viewport" content="width=device-width, initial-scale=1">\` in the \`<head>\`. If using canvas, set explicit width/height attributes and draw initial content synchronously before any async setup. Prefer CSS animations over JS when possible for reliability. When animating particles with velocity/forces (explosions, scatter, physics), always clamp or wrap positions to stay within canvas bounds, or apply friction/damping so particles never permanently leave the visible area. **ANIMATION TIMING** — All animation cycles (transitions, one-shot effects, movement sequences) must complete within 30 seconds max. Prefer looping animations in the 3-10 second range. If the user requests slow motion (e.g., "sunset", "slowly grow"), keep the full sequence under 30s — do not create multi-minute animations.

9. **VISUAL AWARENESS** — A screenshot of the current artifact is provided alongside the HTML source. Use the screenshot to verify your understanding of the current visual state. If the code suggests one thing but the screenshot shows something different, trust the screenshot and adjust accordingly.

10. **SMART RENDERING** — Choose the right rendering approach for the task. SVG is great for 2D shapes, patterns, and geometric art. If the user asks for "3D", they mean objects that appear to exist in 3D space with real perspective — NOT flat shapes with gradient shading. Radial gradients on circles (whether SVG or Canvas 2D) are pseudo-3D and always look flat.

When the user requests 3D, switch to Canvas and implement **actual 3D math**:
- Define objects as 3D coordinates (x, y, z)
- Apply rotation matrices each frame (e.g., slow Y-axis rotation)
- Project 3D→2D using perspective divide: screenX = x * focalLength / (z + focalLength)
- Z-sort objects back-to-front before drawing
- Shade each sphere based on its 3D surface normal vs. light direction: brightness = max(0, dot(normal, lightDir))
- Draw each sphere as a filled arc with color scaled by brightness, plus a specular highlight whose position shifts based on the 3D light angle

This is ~40 lines of JS and produces spheres that genuinely rotate in 3D space with dynamic lighting. Do NOT use CSS perspective / transform-style: preserve-3d on SVG layers — that creates parallax, not real 3D.

**COORDINATE SPACES** — Never mix canvas transforms (ctx.translate/rotate) with manual position math on the same elements — this causes double-transformation where objects fly off-screen or jitter. Pick ONE approach: either compute all positions manually in world space and draw with no canvas transform, or use canvas transforms uniformly for everything. When doing 3D projection, always compute orbit/movement on the ORIGINAL untransformed coordinates, then apply rotation and projection exactly once per point.

11. **PARTICLE TEXT / SHAPE FORMATION** — When asked to arrange particles into text or a specific shape:
- Create AT LEAST 500 particles (never fewer). More complex shapes need more.
- Render the target text offscreen at 180px bold, use getImageData, sample every 3rd pixel (not every 4th+) to build a dense target array.
- Assign each particle a unique target position from the sampled array.
- Use DIRECT position interpolation: p.x += (p.tx - p.x) * 0.1 — NOT weak spring physics like vx += dx * 0.002. Particles must visibly converge within 1-2 seconds.
- Always clamp positions: p.x = Math.max(0, Math.min(c.width, p.x)) to prevent off-screen drift.
- If combining formation with an effect (e.g., form then explode), start particles at their target positions and only animate the effect — do not re-animate the formation from scratch.

Keep total HTML under 50KB to maintain output quality.

**Output as JSON with three fields:**
- \`html\` — the full artifact HTML string
- \`acknowledgment\` — the brief frame note
- \`suggestions\` — array of 2-3 short suggested next prompts (each under 8 words)`;

function buildSystemPrompt(styleId: string): string {
  const preset = STYLE_PRESETS.find((s) => s.id === styleId);
  if (preset?.modifier) {
    return BASE_SYSTEM_PROMPT + "\n\n" + preset.modifier;
  }
  return BASE_SYSTEM_PROMPT;
}

// ── JSON helpers ──

/** Extracts the first complete {...} object by tracking brace depth.
 *  Stops exactly at the closing brace, ignoring any trailing prose. */
function extractBalancedJSON(text: string): string | null {
  const start = text.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (esc) { esc = false; continue; }
    if (ch === "\\" && inStr) { esc = true; continue; }
    if (ch === '"') { inStr = !inStr; continue; }
    if (!inStr) {
      if (ch === "{") depth++;
      else if (ch === "}") { depth--; if (depth === 0) return text.slice(start, i + 1); }
    }
  }
  return null;
}

/** Escapes bare control characters inside JSON string literals so JSON.parse succeeds. */
function sanitizeJSONControlChars(json: string): string {
  let out = "";
  let inStr = false;
  let esc = false;
  for (let i = 0; i < json.length; i++) {
    const ch = json[i];
    if (esc) { out += ch; esc = false; continue; }
    if (ch === "\\" && inStr) { out += ch; esc = true; continue; }
    if (ch === '"') { inStr = !inStr; out += ch; continue; }
    if (inStr) {
      const c = ch.charCodeAt(0);
      if (c < 0x20 || c === 0x7f) {
        if (ch === "\n") { out += "\\n"; continue; }
        if (ch === "\r") { out += "\\r"; continue; }
        if (ch === "\t") { out += "\\t"; continue; }
        continue; // drop other control chars
      }
    }
    out += ch;
  }
  return out;
}

// ── Claude API ──

interface ClaudeResult {
  html: string;
  acknowledgment: string;
  suggestions?: string[];
}

async function callClaude(
  apiKey: string,
  previousHtml: string | null,
  promptText: string,
  frameNumber: number,
  model: ModelId,
  styleId: string,
  promptHistory: { frame: number; prompt: string }[],
  screenshotBase64: string | null,
  onText?: (accumulated: string) => void,
  signal?: AbortSignal
): Promise<ClaudeResult> {
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });

  const messages: Anthropic.MessageParam[] = [];

  if (previousHtml) {
    const contentParts: Anthropic.ContentBlockParam[] = [];

    if (screenshotBase64) {
      contentParts.push({
        type: "image",
        source: {
          type: "base64",
          media_type: "image/jpeg",
          data: screenshotBase64,
        },
      });
    }

    let htmlForContext = previousHtml;
    let truncNote = "";
    if (previousHtml.length > MAX_HTML_CONTEXT) {
      htmlForContext = previousHtml.slice(0, MAX_HTML_CONTEXT);
      truncNote =
        "\n\n(HTML truncated due to size — refer to the screenshot for full visual reference)";
    }

    let textContent = `Current artifact HTML (Frame ${frameNumber - 1}):\n\`\`\`html\n${htmlForContext}\n\`\`\`${truncNote}`;

    if (promptHistory.length > 0) {
      textContent +=
        "\n\nPrompt trajectory so far:\n" +
        promptHistory
          .map((h) => `- Frame ${String(h.frame).padStart(3, "0")}: "${h.prompt}"`)
          .join("\n");
    }

    contentParts.push({ type: "text", text: textContent });

    messages.push({ role: "user", content: contentParts });
    messages.push({
      role: "assistant",
      content: screenshotBase64
        ? "I see the current artifact (both code and visual screenshot) and the evolution trajectory. Ready for the next prompt."
        : "I see the current artifact state and the evolution trajectory. Ready for the next prompt.",
    });
  }

  messages.push({
    role: "user",
    content: `Frame ${frameNumber} prompt: ${promptText}\n\nRespond with JSON only: { "html": "...", "acknowledgment": "...", "suggestions": ["...", "...", "..."] }`,
  });

  let accumulated = "";

  const stream = client.messages.stream({
    model,
    max_tokens: 16000,
    system: buildSystemPrompt(styleId),
    messages,
  });

  stream.on("text", (chunk) => {
    accumulated += chunk;
    onText?.(accumulated);
  });

  if (signal) {
    signal.addEventListener("abort", () => stream.abort(), { once: true });
  }

  const finalMsg = await stream.finalMessage();
  const truncated = finalMsg.stop_reason === "max_tokens";

  // Strip only the outermost code fence — leaves backticks inside HTML values untouched
  const stripped = accumulated.trim()
    .replace(/^```(?:json)?\s*\n?/, "")
    .replace(/\n?```\s*$/, "");

  // Balanced-brace extractor: stops at the first complete {...} object,
  // ignoring any trailing prose or extra {} Claude may append after the JSON.
  const jsonStr = extractBalancedJSON(stripped);
  if (!jsonStr) {
    throw new Error(
      truncated
        ? "The artifact was too long to finish. Try a simpler prompt or switch to a faster model."
        : "Claude did not return valid JSON. Try again."
    );
  }

  let parsed: { html: string; acknowledgment: string; suggestions?: string[] };
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    // Fallback: escape bare control characters inside JSON string literals
    parsed = JSON.parse(sanitizeJSONControlChars(jsonStr));
  }
  if (!parsed.html || !parsed.acknowledgment) {
    throw new Error("Missing html or acknowledgment in response");
  }

  return {
    html: parsed.html,
    acknowledgment: parsed.acknowledgment,
    suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions : undefined,
  };
}

// ── Storage helpers ──

function getStoredKey(): string {
  if (typeof window === "undefined") return "";
  return sessionStorage.getItem(API_KEY_STORAGE) ?? "";
}

function getStoredSession(): SessionData | null {
  if (typeof window === "undefined") return null;
  const raw = sessionStorage.getItem(SESSION_STORAGE);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return { style: "default", ...parsed };
  } catch {
    return null;
  }
}

function getStoredModel(): ModelId {
  if (typeof window === "undefined") return "claude-sonnet-4-5";
  const stored = localStorage.getItem(MODEL_STORAGE);
  if (stored && MODELS.some((m) => m.id === stored)) return stored as ModelId;
  return "claude-sonnet-4-5";
}

function getAutoSaved(): SessionData | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(AUTOSAVE_STORAGE);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed?.title && Array.isArray(parsed.frames) && parsed.frames.length > 0) {
      return { style: "default", ...parsed };
    }
    return null;
  } catch {
    return null;
  }
}

// ── API Key Setup ──

function ApiKeySetup({ onReady }: { onReady: (key: string) => void }) {
  const [key, setKey] = useState("");

  return (
    <div className="flex h-screen items-center justify-center">
      <div className="w-96 space-y-8">
        <div className="space-y-1">
          <ClaudeLogo className="h-6 w-6 text-foreground" />
          <p className="text-[11px] tracking-wide text-muted-foreground uppercase">
            The Art of Prompt
          </p>
        </div>
        <div className="space-y-3">
          <div>
            <p className="text-sm text-foreground">Enter your Anthropic API key</p>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              Your key calls Anthropic directly from your browser. It never
              touches our server — you can verify this in your browser&apos;s
              network tab.
            </p>
          </div>
          <Input
            type="password"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="sk-ant-..."
            className="text-sm"
            onKeyDown={(e) =>
              e.key === "Enter" && key.trim() && onReady(key.trim())
            }
          />
          <Button
            onClick={() => key.trim() && onReady(key.trim())}
            disabled={!key.trim()}
            className="w-full"
          >
            Continue
          </Button>
          <div className="space-y-1 pt-1 text-[11px] leading-relaxed text-muted-foreground/70">
            <p>
              We recommend creating a{" "}
              <a
                href="https://console.anthropic.com/settings/keys"
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-foreground"
              >
                dedicated key
              </a>{" "}
              with a spend limit for this session.
            </p>
            <p>Stored in sessionStorage only — erased when you close this tab.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Session Setup ──

function SessionSetup({
  onStart,
  onLoad,
}: {
  onStart: (title: string, style: StyleId, template: Template) => void;
  onLoad: (session: SessionData) => void;
}) {
  const [title, setTitle] = useState("");
  const [style, setStyle] = useState<StyleId>("default");
  const [templateId, setTemplateId] = useState("blank");

  const handleFileLoad = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result as string);
        if (data?.title && Array.isArray(data.frames)) {
          onLoad({ style: "default", ...data });
        }
      } catch {
        /* invalid file */
      }
    };
    reader.readAsText(file);
  };

  const selectedTemplate = TEMPLATES.find((t) => t.id === templateId) ?? TEMPLATES[0];

  return (
    <div className="flex h-screen items-center justify-center">
      <div className="w-[32rem] space-y-10">
        <div className="space-y-2">
          <ClaudeLogo className="h-7 w-7 text-foreground" />
          <p className="text-xs tracking-wide text-muted-foreground uppercase">
            The Art of Prompt
          </p>
        </div>

        <div className="space-y-6">
          <div className="space-y-3">
            <p className="text-base text-foreground">Name this session</p>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Session title"
              className="text-base py-3"
              onKeyDown={(e) =>
                e.key === "Enter" &&
                title.trim() &&
                onStart(title.trim(), style, selectedTemplate)
              }
            />
          </div>

          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Style</p>
            <div className="flex flex-wrap gap-1.5">
              {STYLE_PRESETS.map((s) => (
                <button
                  key={s.id}
                  onClick={() => {
                    setStyle(s.id as StyleId);
                    if (s.id !== "default") setTemplateId("blank");
                  }}
                  className={`rounded px-3 py-1.5 text-xs transition-colors ${
                    style === s.id
                      ? "bg-foreground text-background"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Start from</p>
            <div className="grid grid-cols-3 gap-2.5">
              {TEMPLATES.map((t) => {
                const disabled = style !== "default" && t.id !== "blank";
                return (
                  <button
                    key={t.id}
                    onClick={() => !disabled && setTemplateId(t.id)}
                    className={`rounded border px-4 py-3 text-left transition-colors ${
                      disabled
                        ? "opacity-40 cursor-not-allowed border-border"
                        : templateId === t.id
                          ? "border-foreground bg-card"
                          : "border-border hover:border-foreground/30"
                    }`}
                  >
                    <span className="block text-sm font-medium text-foreground">
                      {t.label}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {t.desc}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <Button
            onClick={() =>
              title.trim() && onStart(title.trim(), style, selectedTemplate)
            }
            disabled={!title.trim()}
            className="w-full py-3 text-base"
          >
            Start
          </Button>

          <div className="flex items-center justify-center gap-4 pt-1">
            <label className="cursor-pointer text-sm text-muted-foreground hover:text-foreground">
              Import session
              <input
                type="file"
                accept=".json"
                onChange={handleFileLoad}
                className="hidden"
              />
            </label>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Canvases ──

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

// ── Health check ──

const HEALTH_CHECK_SCRIPT = `<script>
(function(){
  var _o=(window.location.ancestorOrigins&&window.location.ancestorOrigins[0])||(document.referrer?new URL(document.referrer).origin:null)||'*';
  var t=setTimeout(function(){
    window.parent.postMessage({type:'artifact-health',blank:true},_o);
  },3000);
  function check(){
    var hasCanvas=document.querySelector('canvas');
    var hasSvg=document.querySelector('svg');
    var bodyH=document.body?document.body.scrollHeight:0;
    var kids=document.body?document.body.children.length:0;
    var visible=bodyH>50&&kids>0;
    if(hasCanvas||hasSvg||visible){
      clearTimeout(t);
      window.parent.postMessage({type:'artifact-health',blank:false},_o);
    }
  }
  window.addEventListener('load',function(){setTimeout(check,800);});
  window.addEventListener('error',function(e){
    window.parent.postMessage({type:'artifact-health',blank:true,error:e.message||'JS error'},_o);
  });
})();
</script>`;

function wrapWithHealthCheck(html: string): string {
  if (!html) return html;
  const idx = html.indexOf("</head>");
  if (idx !== -1)
    return html.slice(0, idx) + HEALTH_CHECK_SCRIPT + html.slice(idx);
  const bodyIdx = html.indexOf("<body");
  if (bodyIdx !== -1)
    return html.slice(0, bodyIdx) + HEALTH_CHECK_SCRIPT + html.slice(bodyIdx);
  return HEALTH_CHECK_SCRIPT + html;
}

// ── Artifact Viewer with crossfade + fullscreen ──

function ArtifactViewer({
  html,
  loading,
  streamText,
  onBlank,
  fullscreen,
  onToggleFullscreen,
}: {
  html: string;
  loading: boolean;
  streamText?: string;
  onBlank?: () => void;
  fullscreen?: boolean;
  onToggleFullscreen?: () => void;
}) {
  const [showCode, setShowCode] = useState(false);
  const codeRef = useRef<HTMLPreElement>(null);
  const blankFired = useRef(false);
  const prevHtmlRef = useRef("");
  const [fadeKey, setFadeKey] = useState(0);

  useLayoutEffect(() => {
    if (showCode && codeRef.current) {
      codeRef.current.scrollTop = codeRef.current.scrollHeight;
    }
  }, [streamText, showCode]);

  useEffect(() => {
    if (!loading) setShowCode(false);
  }, [loading]);

  useEffect(() => {
    blankFired.current = false;
  }, [html]);

  // Crossfade: bump key when html changes to trigger animation
  useEffect(() => {
    if (html && !loading && html !== prevHtmlRef.current) {
      prevHtmlRef.current = html;
      setFadeKey((k) => k + 1);
    }
  }, [html, loading]);

  useEffect(() => {
    if (!html || loading) return;

    function handleMessage(e: MessageEvent) {
      if (e.data?.type !== "artifact-health") return;
      if (e.data.blank && !blankFired.current) {
        blankFired.current = true;
        onBlank?.();
      }
    }

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [html, loading, onBlank]);

  const hasStream = loading && !!streamText;
  const wrappedHtml = useMemo(() => html ? wrapWithHealthCheck(html) : "", [html]);

  return (
    <div className="relative h-full">
      {!html && !loading ? (
        <IdleCanvas />
      ) : loading ? (
        <LoadingCanvas />
      ) : (
        <iframe
          key={fadeKey}
          srcDoc={wrappedHtml}
          className="h-full w-full border-0 artifact-fade-in"
          sandbox="allow-scripts"
          title="Artifact"
        />
      )}

      {showCode && hasStream && (
        <div className="absolute inset-0 bg-background/[0.92] backdrop-blur-sm flex flex-col">
          <pre
            ref={codeRef}
            className="flex-1 overflow-auto px-6 py-4 font-mono text-[11px] leading-relaxed text-foreground/50 whitespace-pre-wrap break-words"
          >
            {streamText}
            <span className="inline-block w-1 h-3 bg-foreground/25 animate-pulse ml-0.5 align-middle" />
          </pre>
        </div>
      )}

      <div className="absolute top-3 right-3 z-10 flex gap-1">
        {hasStream && (
          <button
            onClick={() => setShowCode(!showCode)}
            className={`rounded px-2 py-1 text-[11px] font-mono transition-colors ${
              showCode
                ? "bg-foreground text-background"
                : "bg-card text-muted-foreground hover:text-foreground"
            }`}
          >
            &lt;/&gt;
          </button>
        )}
        {!loading && html && onToggleFullscreen && (
          <button
            onClick={onToggleFullscreen}
            className="rounded bg-card px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
          >
            {fullscreen ? "Exit" : "Expand"}
          </button>
        )}
      </div>
    </div>
  );
}

// ── Gallery with timelapse + export ──

async function captureIframeOnce(
  offscreen: HTMLIFrameElement,
  target: HTMLCanvasElement
): Promise<boolean> {
  const ctx = target.getContext("2d");
  if (!ctx) return false;
  const doc = offscreen.contentDocument;

  const artCanvas = doc?.querySelector("canvas");
  if (artCanvas && artCanvas.width > 0 && artCanvas.height > 0) {
    const rect = artCanvas.getBoundingClientRect();
    const iframeW = offscreen.clientWidth || target.width;
    const iframeH = offscreen.clientHeight || target.height;
    const sx = target.width / iframeW;
    const sy = target.height / iframeH;
    const dw = rect.width * sx;
    const dh = rect.height * sy;
    const isPixelArt = artCanvas.width < iframeW * 0.8 || artCanvas.height < iframeH * 0.8;
    ctx.imageSmoothingEnabled = !isPixelArt;
    ctx.fillStyle = "#FBF8EF";
    ctx.fillRect(0, 0, target.width, target.height);
    ctx.drawImage(
      artCanvas,
      rect.left * sx, rect.top * sy,
      dw, dh
    );
    return true;
  }

  const svgEl = doc?.querySelector("svg");
  if (svgEl) {
    const serialized = new XMLSerializer().serializeToString(svgEl);
    const blob = new Blob([serialized], {
      type: "image/svg+xml;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const i = new Image();
        i.onload = () => resolve(i);
        i.onerror = reject;
        i.src = url;
      });
      const rect = svgEl.getBoundingClientRect();
      const iframeW = offscreen.clientWidth || target.width;
      const iframeH = offscreen.clientHeight || target.height;
      const sx = target.width / iframeW;
      const sy = target.height / iframeH;
      ctx.drawImage(
        img,
        rect.left * sx, rect.top * sy,
        rect.width * sx, rect.height * sy
      );
      return true;
    } catch {
      return false;
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  return false;
}

async function captureIframeWithHtml2Canvas(
  offscreen: HTMLIFrameElement,
  target: HTMLCanvasElement
) {
  const ctx = target.getContext("2d");
  if (!ctx) return;
  const doc = offscreen.contentDocument;
  if (!doc?.body) return;

  const { default: html2canvas } = await import("html2canvas");
  const capture = await html2canvas(doc.body, {
    width: target.width,
    height: target.height,
    backgroundColor: "#FBF8EF",
    useCORS: true,
    scale: 1,
  });
  ctx.drawImage(capture, 0, 0, target.width, target.height);
}

function createOffscreenIframe(
  html: string,
  width = 1080,
  height = 1080,
  keepVisible = false
): Promise<HTMLIFrameElement> {
  return new Promise((resolve, reject) => {
    const iframe = document.createElement("iframe");
    if (keepVisible) {
      iframe.style.cssText = `position:fixed;left:0;top:0;width:${width}px;height:${height}px;border:none;opacity:0;pointer-events:none;z-index:-1;`;
    } else {
      iframe.style.cssText = `position:fixed;left:-9999px;top:0;width:${width}px;height:${height}px;border:none;`;
    }
    iframe.setAttribute("sandbox", "allow-scripts allow-same-origin");
    const timeout = setTimeout(() => {
      try { document.body.removeChild(iframe); } catch { /* ok */ }
      reject(new Error("Iframe load timed out"));
    }, 10_000);
    document.body.appendChild(iframe);
    iframe.onload = () => { clearTimeout(timeout); resolve(iframe); };
    iframe.srcdoc = html;
  });
}

async function captureArtifactScreenshot(
  html: string
): Promise<string | null> {
  try {
    const iframe = await createOffscreenIframe(html, 800, 800);
    const canvas = document.createElement("canvas");
    canvas.width = 800;
    canvas.height = 800;

    // Poll for content instead of a hard-coded wait — resolves as fast as 200ms
    const deadline = Date.now() + 2000;
    while (Date.now() < deadline) {
      const grabbed = await captureIframeOnce(iframe, canvas);
      if (grabbed && !isCanvasBlank(canvas)) break;
      await new Promise((r) => setTimeout(r, 200));
    }
    if (isCanvasBlank(canvas)) {
      await captureIframeWithHtml2Canvas(iframe, canvas);
    }

    document.body.removeChild(iframe);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.7);
    return dataUrl.split(",")[1] || null;
  } catch {
    return null;
  }
}


type RequestFrameFn = { requestFrame?: () => void };

function isCanvasBlank(canvas: HTMLCanvasElement): boolean {
  const ctx = canvas.getContext("2d");
  if (!ctx) return true;
  const d = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  const r0 = d[0], g0 = d[1], b0 = d[2];
  for (let i = 4; i < d.length; i += 16) {
    if (Math.abs(d[i] - r0) + Math.abs(d[i + 1] - g0) + Math.abs(d[i + 2] - b0) > 10)
      return false;
  }
  return true;
}

async function captureFromIframe(
  iframe: HTMLIFrameElement,
  recCanvas: HTMLCanvasElement,
  track: MediaStreamTrack,
  durationMs: number,
  captureFps: number,
  abortSignal?: { aborted: boolean }
) {
  const intervalMs = 1000 / captureFps;

  const doCapture = async () => {
    try {
      const grabbed = await captureIframeOnce(iframe, recCanvas);
      if (!grabbed) await captureIframeWithHtml2Canvas(iframe, recCanvas);
    } catch { /* keep last */ }
  };

  const pushFrame = () => {
    (track as unknown as RequestFrameFn).requestFrame?.();
  };

  // Brief poll for first visible paint (iframe onload already fired)
  const deadline = Date.now() + 500;
  while (Date.now() < deadline) {
    await doCapture();
    if (!isCanvasBlank(recCanvas)) break;
    await new Promise((r) => setTimeout(r, 50));
  }

  const totalFrames = Math.round(durationMs / intervalMs);
  for (let i = 0; i < totalFrames; i++) {
    if (abortSignal?.aborted) break;
    await doCapture();
    pushFrame();
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

const FREEZE_SCRIPT = `<script>(function(){var o=window.requestAnimationFrame;var q=[];var f=true;window.requestAnimationFrame=function(c){if(f){q.push(c);return 0}return o.call(window,c)};window.__thaw=function(){f=false;q.forEach(function(c){o.call(window,c)});q=[]}})()</script>`;

function injectFreeze(html: string): string {
  const idx = html.indexOf("<head>");
  if (idx !== -1) return html.slice(0, idx + 6) + FREEZE_SCRIPT + html.slice(idx + 6);
  const idx2 = html.indexOf("<script");
  if (idx2 !== -1) return html.slice(0, idx2) + FREEZE_SCRIPT + html.slice(idx2);
  return FREEZE_SCRIPT + html;
}

const ONE_SHOT_PATTERNS = [
  /\bsun\s*set/i, /\bsun\s*rise/i,
  /\bsun\b.*\b(set|sink|descend|lower|drop|dip|fall)\b/i,
  /\b(set|sink|descend|lower|drop|dip|fall)\b.*\bsun\b/i,
  /\b(fade\s*(out|in|away)|dissolve|melt|evaporate|vanish|disappear)\b/i,
  /\b(grow|sprout|bloom|blossom|wilt|wither|shrink|collapse)\b/i,
  /\b(build\s*up|fill\s*(in|up)|drain|empty|pour|flood|overflow)\b/i,
  /\b(morph|transform|evolve|transition|convert|shift)\b.*\b(into|to|from)\b/i,
  /\b(count\s*down|timer|clock|deplete|exhaust|expire)\b/i,
  /\b(explode|implode|shatter|crumble|scatter|disperse)\b/i,
  /\b(emerge|reveal|unveil|unfold|unravel|assemble|construct)\b/i,
  /\b(rise|ascend|climb|lift)\b.*\b(slowly|gradually|over\s*time)\b/i,
  /\b(slowly|gradually)\b.*\b(rise|ascend|climb|lift|set|sink|fall|drop)\b/i,
];

function isOneShot(prompt: string): boolean {
  return ONE_SHOT_PATTERNS.some((re) => re.test(prompt));
}

function GalleryView({
  session,
  onBack,
  onSave,
}: {
  session: SessionData;
  onBack: () => void;
  onSave: () => void;
}) {
  const [selectedIdx, setSelectedIdx] = useState(session.frames.length - 1);
  const [playing, setPlaying] = useState(false);
  const [secPerFrame, setSecPerFrame] = useState(3);
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState("");
  const playRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const abortRef = useRef<{ aborted: boolean }>({ aborted: false });

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
      }, secPerFrame * 1000);
    }
    return () => {
      if (playRef.current) clearInterval(playRef.current);
    };
  }, [playing, secPerFrame, frames.length]);

  const handlePlay = () => {
    if (selectedIdx >= frames.length - 1) setSelectedIdx(0);
    setPlaying(true);
  };

  const handleDownloadZip = async () => {
    const { default: JSZip } = await import("jszip");
    const zip = new JSZip();
    frames.forEach((f) => {
      zip.file(`frame-${String(f.number).padStart(3, "0")}.html`, f.html);
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
    if (frames.length < 2) return;
    abortRef.current = { aborted: false };
    setExporting(true);

    const BATCH = 5;
    const liveIframes: HTMLIFrameElement[] = [];
    const destroyIframes = (list: HTMLIFrameElement[]) => {
      list.forEach((f) => {
        try { document.body.removeChild(f); } catch { /* ok */ }
      });
      list.length = 0;
    };

    try {
      const freshFlags = frames.map((f, i) => i === 0 || isOneShot(f.promptText));
      console.log(
        "[export] classification:",
        frames.map((_f, i) => `${i + 1}:${freshFlags[i] ? "FRESH" : "CONTINUE"}`).join(", ")
      );
      if (abortRef.current.aborted) { setExporting(false); setExportProgress(""); return; }

      const VW = 1920;
      const VH = 1080;
      const canvas = document.createElement("canvas");
      canvas.width = VW;
      canvas.height = VH;
      const stream = canvas.captureStream(0);
      const mimeType = (
        ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"]
          .find((t) => MediaRecorder.isTypeSupported(t)) || "video/webm"
      );
      const recorder = new MediaRecorder(stream, {
        mimeType,
        videoBitsPerSecond: 10_000_000,
      });
      const chunks: BlobPart[] = [];
      recorder.ondataavailable = (e) => chunks.push(e.data);
      const done = new Promise<void>((resolve) => {
        recorder.onstop = () => resolve();
      });
      recorder.start();
      const track = stream.getVideoTracks()[0];
      const durationMs = secPerFrame * 1000;
      const captureFps = 60;

      const initCtx = canvas.getContext("2d");
      if (initCtx) { initCtx.clearRect(0, 0, VW, VH); }

      let pendingBatch: Promise<HTMLIFrameElement[]> | null = null;

      const loadBatch = (start: number) => {
        const end = Math.min(start + BATCH, frames.length);
        const slice = frames.slice(start, end);
        const flags = freshFlags.slice(start, end);
        return Promise.all(
          slice.map((f, j) => {
            const html = flags[j] ? injectFreeze(f.html) : f.html;
            return createOffscreenIframe(html, VW, VH, true);
          })
        );
      };

      // Pre-load first batch
      setExportProgress(`Loading frames 1–${Math.min(BATCH, frames.length)}...`);
      let currentBatch = await loadBatch(0);
      liveIframes.push(...currentBatch);

      for (let batchStart = 0; batchStart < frames.length; batchStart += BATCH) {
        if (abortRef.current.aborted) break;

        const batchEnd = Math.min(batchStart + BATCH, frames.length);
        const batchFlags = freshFlags.slice(batchStart, batchEnd);
        const loaded = currentBatch;

        // Pre-load NEXT batch while we capture this one
        const nextStart = batchStart + BATCH;
        if (nextStart < frames.length) {
          pendingBatch = loadBatch(nextStart);
        } else {
          pendingBatch = null;
        }

        for (let j = 0; j < loaded.length; j++) {
          if (abortRef.current.aborted) break;
          const globalIdx = batchStart + j;
          setSelectedIdx(globalIdx);
          setExportProgress(
            `Recording frame ${globalIdx + 1} / ${frames.length}...`
          );

          const targetIframe = loaded[j];

          if (batchFlags[j]) {
            console.log(`[export] frame ${globalIdx + 1} — FRESH (frozen, thawing now)`);
            try {
              (targetIframe.contentWindow as unknown as { __thaw: () => void }).__thaw();
            } catch (e) {
              console.warn("[export] thaw failed, animation may have auto-started", e);
            }
            await new Promise((r) => setTimeout(r, 50));
          } else {
            console.log(`[export] frame ${globalIdx + 1} — CONTINUE (pre-run)`);
          }

          await captureFromIframe(
            targetIframe,
            canvas,
            track,
            durationMs,
            captureFps,
            abortRef.current
          );
        }

        destroyIframes(liveIframes);

        // Await pre-loaded next batch (should already be ready or nearly ready)
        if (pendingBatch) {
          currentBatch = await pendingBatch;
          liveIframes.push(...currentBatch);
        }
      }

      setExportProgress("Finalizing...");
      recorder.stop();
      await done;
      if (!abortRef.current.aborted) {
        const blob = new Blob(chunks, { type: "video/webm" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${session.title.replace(/\s+/g, "-").toLowerCase()}-timelapse.webm`;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      console.error("Recording failed:", err);
    } finally {
      destroyIframes(liveIframes);
      setExporting(false);
      setExportProgress("");
    }
  };

  const handleCancelExport = () => {
    abortRef.current.aborted = true;
  };

  return (
    <div className="flex h-screen flex-col">
      <div className="flex items-center justify-between border-b px-6 py-3">
        <p className="text-sm text-foreground">
          {session.title}
          <span className="ml-2 text-muted-foreground">
            {frames.length} frames
          </span>
        </p>
        <div className="flex items-center gap-3">
          <button
            onClick={onSave}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Save Session
          </button>
          <button
            onClick={handleDownloadZip}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Download ZIP
          </button>
          {exporting ? (
            <button
              onClick={handleCancelExport}
              className="text-xs text-red-500 hover:text-red-400"
            >
              {exportProgress || "Recording..."} — Cancel
            </button>
          ) : (
            <button
              onClick={handleRecordTimelapse}
              disabled={frames.length < 2}
              className="text-xs text-muted-foreground hover:text-foreground disabled:opacity-40"
            >
              Export Video
            </button>
          )}
          <button
            onClick={() => {
              handleCancelExport();
              onBack();
            }}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Back
          </button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <div className="flex flex-1 flex-col">
          <div className="relative flex-1 bg-background">
            {frames.length === 0 ? (
              <div className="flex h-full items-center justify-center">
                <p className="text-sm text-muted-foreground">No frames</p>
              </div>
            ) : current ? (
              <iframe
                key={current.number}
                srcDoc={current.html}
                className="absolute inset-0 h-full w-full border-0"
                sandbox="allow-scripts"
                title={`Frame ${current.number}`}
              />
            ) : null}
          </div>

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
                <label htmlFor="gal-spf" className="text-[10px] text-muted-foreground">sec/frame</label>
                <select
                  id="gal-spf"
                  value={secPerFrame}
                  onChange={(e) => setSecPerFrame(Number(e.target.value))}
                  className="bg-transparent text-xs text-foreground"
                >
                  <option value={1}>1</option>
                  <option value={2}>2</option>
                  <option value={3}>3</option>
                  <option value={5}>5</option>
                </select>
              </div>
            </div>
          )}
        </div>

        <div className="w-64 overflow-y-auto border-l">
          {frames.map((f, i) => (
            <button
              key={f.number}
              onClick={() => {
                setPlaying(false);
                setSelectedIdx(i);
              }}
              className={`w-full border-b px-4 py-3 text-left transition-colors ${
                i === selectedIdx ? "bg-card" : "hover:bg-card/50"
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
  onSave,
}: {
  apiKey: string;
  session: SessionData;
  onUpdate: (session: SessionData) => void;
  onEnd: () => void;
  onChangeKey: () => void;
  onSave: () => void;
}) {
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [ack, setAck] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>(() => {
    const last = session.frames[session.frames.length - 1];
    if (last?.suggestions?.length) return last.suggestions;
    return session.frames.length <= 1 ? INITIAL_SUGGESTIONS : [];
  });
  const [error, setError] = useState<string | null>(null);
  const [showGallery, setShowGallery] = useState(false);
  const [model, setModel] = useState<ModelId>(getStoredModel);
  const [streamText, setStreamText] = useState("");
  const [blankWarning, setBlankWarning] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const retryRef = useRef(0);
  const lastPromptRef = useRef("");
  const screenshotRef = useRef<string | null>(null);
  const ackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const sessionRef = useRef(session);
  useEffect(() => { sessionRef.current = session; });

  const handleModelChange = (id: ModelId) => {
    setModel(id);
    localStorage.setItem(MODEL_STORAGE, id);
  };

  const handleStyleChange = useCallback((id: StyleId) => {
    onUpdate({ ...sessionRef.current, style: id });
  }, [onUpdate]);

  const lastFrame = session.frames[session.frames.length - 1];

  // Dynamic tab title
  useEffect(() => {
    const num = String(lastFrame?.number ?? 0).padStart(3, "0");
    document.title = `${num} — ${session.title} | Art of Prompt`;
    return () => {
      document.title = "The Art of Prompt";
    };
  }, [lastFrame?.number, session.title]);

  // Capture screenshot in background after each frame renders
  useEffect(() => {
    if (!lastFrame?.html || loading) return;
    screenshotRef.current = null;
    let cancelled = false;
    captureArtifactScreenshot(lastFrame.html).then((b64) => {
      if (!cancelled) screenshotRef.current = b64;
    });
    return () => {
      cancelled = true;
    };
  }, [lastFrame?.html, loading]);

  // Esc exits fullscreen
  useEffect(() => {
    if (!fullscreen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFullscreen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [fullscreen]);

  const generate = useCallback(
    async (
      promptText: string,
      baseFrames: Frame[],
      baseHtml: string | null,
      fNum: number,
      isRetry: boolean
    ) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setLoading(true);
      setAck(isRetry ? "Regenerating — previous output didn't render..." : null);
      setError(null);
      setStreamText("");
      setSuggestions([]);
      if (!isRetry) setBlankWarning(false);

      const retryHint = isRetry
        ? "\n\n[SYSTEM NOTE: Your previous output failed to render in the browser. It produced a blank screen. Please regenerate using simpler, more robust HTML/CSS/JS. Avoid complex features that might cause errors. Ensure the page has visible content immediately on load.]"
        : "";

      const history = baseFrames.slice(-5).map((f) => ({
        frame: f.number,
        prompt: f.promptText,
      }));

      const screenshot = isRetry ? null : screenshotRef.current;

      try {
        const result = await callClaude(
          apiKey,
          baseHtml,
          promptText + retryHint,
          fNum,
          model,
          sessionRef.current.style,
          history,
          screenshot,
          (text) => setStreamText(text),
          controller.signal
        );

        const newFrame: Frame = {
          number: fNum,
          promptText,
          html: result.html,
          acknowledgment: result.acknowledgment,
          suggestions: result.suggestions,
          createdAt: Date.now(),
        };

        const newFrames = [...baseFrames, newFrame];
        onUpdate({ ...sessionRef.current, frames: newFrames });
        if (!isRetry) setPrompt("");
        setStreamText("");
        setAck(result.acknowledgment);
        if (result.suggestions?.length) setSuggestions(result.suggestions);
        if (ackTimerRef.current) clearTimeout(ackTimerRef.current);
        ackTimerRef.current = setTimeout(() => setAck(null), 8000);
      } catch (err: unknown) {
        if (controller.signal.aborted) return;
        setStreamText("");
        const raw = err instanceof Error ? err.message : "Something went wrong";
        const isAuthError =
          raw.includes("401") ||
          raw.includes("auth") ||
          raw.includes("invalid x-api-key");
        setError(
          isAuthError
            ? "Invalid API key. Check your key and try again."
            : raw.length > 200
              ? "Generation failed. Try again."
              : raw
        );
      } finally {
        setLoading(false);
      }
    },
    [apiKey, model, onUpdate]
  );

  const handleCancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setLoading(false);
    setStreamText("");
    setAck(null);
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!prompt.trim() || loading) return;
    retryRef.current = 0;
    lastPromptRef.current = prompt.trim();
    const frames = sessionRef.current.frames;
    const prevFrame = frames[frames.length - 1];
    await generate(
      prompt.trim(),
      frames,
      prevFrame?.html ?? null,
      prevFrame ? prevFrame.number + 1 : 1,
      false
    );
  }, [prompt, loading, generate]);

  const handleBlankDetected = useCallback(() => {
    if (loading) return;
    if (retryRef.current >= 1) {
      setBlankWarning(true);
      return;
    }
    retryRef.current += 1;
    setLoading(true);
    const s = sessionRef.current;
    const framesBeforeBad = s.frames.slice(0, -1);
    const prevFrame = framesBeforeBad[framesBeforeBad.length - 1];
    onUpdate({ ...s, frames: framesBeforeBad });
    setTimeout(() => {
      generate(
        lastPromptRef.current,
        framesBeforeBad,
        prevFrame?.html ?? null,
        prevFrame ? prevFrame.number + 1 : 1,
        true
      );
    }, 100);
  }, [loading, onUpdate, generate]);

  if (showGallery) {
    return (
      <GalleryView
        session={session}
        onBack={() => setShowGallery(false)}
        onSave={onSave}
      />
    );
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden">
      {/* Left Panel */}
      {!fullscreen && (
        <div className="flex w-[30%] min-w-[300px] flex-col border-r p-6">
          <div className="mb-8">
            <ClaudeLogo className="mb-2 h-5 w-5 text-foreground" />
            <p className="text-[11px] tracking-wide text-muted-foreground uppercase">
              The Art of Prompt
            </p>
          </div>

          <div className="mb-4">
            <p className="text-xs text-muted-foreground">{session.title}</p>
            <p
              className={`mt-1 text-3xl font-light tracking-tight text-foreground ${
                ack ? "animate-flash" : ""
              }`}
            >
              {String(lastFrame?.number ?? 0).padStart(3, "0")}
            </p>
          </div>

          <div className="mb-3 flex flex-wrap gap-1">
            {MODELS.map((m) => (
              <button
                key={m.id}
                onClick={() => handleModelChange(m.id)}
                disabled={loading}
                className={`rounded px-2 py-1 text-[11px] transition-colors ${
                  model === m.id
                    ? "bg-foreground text-background"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                title={m.desc}
              >
                {m.label}
              </button>
            ))}
          </div>

          <div className="mb-6 flex flex-wrap gap-1">
            {STYLE_PRESETS.map((s) => (
              <button
                key={s.id}
                onClick={() => handleStyleChange(s.id as StyleId)}
                disabled={loading}
                className={`rounded px-2 py-1 text-[11px] transition-colors ${
                  session.style === s.id
                    ? "bg-foreground text-background"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>

          <div aria-live="polite">
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

            {blankWarning && !error && (
              <div className="mb-4 border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                <div className="flex items-start justify-between gap-2">
                  <span>This artifact may not have rendered correctly.</span>
                  <button
                    onClick={() => setBlankWarning(false)}
                    className="shrink-0 text-amber-400 hover:text-amber-600"
                  >
                    ✕
                  </button>
                </div>
                <button
                  onClick={() => {
                    onUpdate({
                      ...session,
                      frames: session.frames.slice(0, -1),
                    });
                    setBlankWarning(false);
                    setAck(null);
                  }}
                  className="mt-2 text-[11px] text-amber-600 underline hover:text-amber-800"
                >
                  Undo last frame
                </button>
              </div>
            )}

            {ack && !error && !blankWarning && (
              <div className="mb-2 text-xs text-muted-foreground">{ack}</div>
            )}
          </div>

          {/* Suggestions */}
          {suggestions.length > 0 && !loading && !error && (
            <div className="mb-4 flex flex-wrap gap-1">
              {suggestions.map((s, i) => (
                <button
                  key={i}
                  onClick={() => setPrompt(s)}
                  className="rounded border border-border px-2 py-1 text-[11px] text-muted-foreground hover:border-foreground/30 hover:text-foreground transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          )}

          <div className="mt-auto space-y-3">
            <Textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Describe one change..."
              disabled={loading}
              className="min-h-[100px] resize-none text-sm placeholder:text-muted-foreground"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit();
                }
              }}
            />

            {/* Quick actions */}
            <div className="flex flex-wrap gap-1">
              {QUICK_ACTIONS.map((qa) => (
                <button
                  key={qa}
                  disabled={loading}
                  onClick={() =>
                    setPrompt((p) => (p.trim() ? `${p.trim()}, ${qa.toLowerCase()}` : qa))
                  }
                  className="rounded border border-border px-2 py-0.5 text-[10px] text-muted-foreground hover:border-foreground/30 hover:text-foreground transition-colors disabled:opacity-40"
                >
                  {qa}
                </button>
              ))}
            </div>

            {loading ? (
              <Button onClick={handleCancel} variant="outline" className="w-full">
                Cancel
              </Button>
            ) : (
              <Button
                onClick={handleSubmit}
                disabled={!prompt.trim()}
                className="w-full"
              >
                <span className="flex items-center justify-center gap-2">
                  Submit
                  <kbd className="rounded bg-primary-foreground/20 px-1 py-0.5 text-[10px] font-normal">
                    ↵
                  </kbd>
                </span>
              </Button>
            )}

            <div className="flex gap-2 pt-1">
              <button
                onClick={() => setShowGallery(true)}
                className="mr-auto text-xs text-muted-foreground hover:text-foreground"
              >
                Gallery ({session.frames.length})
              </button>
              <button
                onClick={onSave}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Save
              </button>
              {session.frames.length > 0 && (
                <button
                  onClick={() => {
                    onUpdate({
                      ...session,
                      frames: session.frames.slice(0, -1),
                    });
                    setAck(null);
                    setError(null);
                  }}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  Undo
                </button>
              )}
              <button
                onClick={onEnd}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                New Session
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Right Panel — Artifact */}
      <div className="flex-1">
        <ArtifactViewer
          html={lastFrame?.html ?? ""}
          loading={loading}
          streamText={streamText}
          onBlank={handleBlankDetected}
          fullscreen={fullscreen}
          onToggleFullscreen={() => setFullscreen(!fullscreen)}
        />
      </div>
    </div>
  );
}

// ── Root ──

export function PromptInterface() {
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [session, setSession] = useState<SessionData | null>(null);
  const [ready, setReady] = useState(false);
  const [recoverySession, setRecoverySession] = useState<SessionData | null>(
    null
  );

  useEffect(() => {
    const storedKey = getStoredKey();
    const storedSession = getStoredSession();
    if (storedKey) setApiKey(storedKey);
    if (storedSession) {
      setSession(storedSession);
    } else {
      const autoSaved = getAutoSaved();
      if (autoSaved) setRecoverySession(autoSaved);
    }
    setReady(true);
  }, []);

  const handleApiKey = (key: string) => {
    sessionStorage.setItem(API_KEY_STORAGE, key);
    setApiKey(key);
  };

  const handleStartSession = (
    title: string,
    style: StyleId,
    template: Template
  ) => {
    const frames: Frame[] = [];
    if (template.html) {
      frames.push({
        number: 1,
        promptText: `Template: ${template.label}`,
        html: template.html,
        acknowledgment: `Frame 001 — started from ${template.label} template`,
        createdAt: Date.now(),
      });
    }
    const newSession: SessionData = { title, frames, style };
    sessionStorage.setItem(SESSION_STORAGE, JSON.stringify(newSession));
    localStorage.setItem(AUTOSAVE_STORAGE, JSON.stringify(newSession));
    setSession(newSession);
    setRecoverySession(null);
  };

  const handleLoadSession = (loaded: SessionData) => {
    sessionStorage.setItem(SESSION_STORAGE, JSON.stringify(loaded));
    localStorage.setItem(AUTOSAVE_STORAGE, JSON.stringify(loaded));
    setSession(loaded);
    setRecoverySession(null);
  };

  const handleUpdateSession = (updated: SessionData) => {
    sessionStorage.setItem(SESSION_STORAGE, JSON.stringify(updated));
    localStorage.setItem(AUTOSAVE_STORAGE, JSON.stringify(updated));
    setSession(updated);
  };

  const handleEndSession = () => {
    sessionStorage.removeItem(SESSION_STORAGE);
    localStorage.removeItem(AUTOSAVE_STORAGE);
    setSession(null);
  };

  const handleSaveSession = () => {
    if (!session) return;
    const data = JSON.stringify(
      { ...session, exportedAt: new Date().toISOString() },
      null,
      2
    );
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${session.title.replace(/\s+/g, "-").toLowerCase()}-session.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!ready) return null;

  if (!apiKey) return <ApiKeySetup onReady={handleApiKey} />;

  // Recovery prompt
  if (!session && recoverySession) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="w-80 space-y-6">
          <div className="space-y-1">
            <ClaudeLogo className="h-6 w-6 text-foreground" />
            <p className="text-[11px] tracking-wide text-muted-foreground uppercase">
              The Art of Prompt
            </p>
          </div>
          <div className="space-y-3">
            <p className="text-sm text-foreground">Resume previous session?</p>
            <p className="text-xs text-muted-foreground">
              Found &ldquo;{recoverySession.title}&rdquo; with{" "}
              {recoverySession.frames.length} frames.
            </p>
            <div className="flex gap-2">
              <Button
                onClick={() => handleLoadSession(recoverySession)}
                className="flex-1"
              >
                Resume
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  localStorage.removeItem(AUTOSAVE_STORAGE);
                  setRecoverySession(null);
                }}
                className="flex-1"
              >
                New Session
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <SessionSetup onStart={handleStartSession} onLoad={handleLoadSession} />
    );
  }

  const handleChangeKey = () => {
    sessionStorage.removeItem(API_KEY_STORAGE);
    setApiKey(null);
  };

  return (
    <ActiveSession
      apiKey={apiKey}
      session={session}
      onUpdate={handleUpdateSession}
      onEnd={handleEndSession}
      onChangeKey={handleChangeKey}
      onSave={handleSaveSession}
    />
  );
}
