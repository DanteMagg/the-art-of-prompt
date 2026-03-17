"use client";

import { useState, useCallback, useEffect, useLayoutEffect, useRef, useMemo } from "react";
import Anthropic from "@anthropic-ai/sdk";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ClaudeLogo } from "@/components/claude-logo";
import { TEMPLATES, resolveTemplate, type Template } from "@/lib/templates";
import { STYLE_PRESETS, buildSystemPrompt, type StyleId } from "@/lib/system-prompt";
import { extractBalancedJSON, parseClaudeJSON } from "@/lib/json-helpers";
import {
  saveSession,
  loadSession,
  clearSession,
  saveAutosave,
  loadAutosave,
  clearAutosave,
  appendFrame,
  appendFrameAutosave,
  removeLastFrame,
  removeLastFrameAutosave,
  saveSessionMeta,
  saveAutosaveMeta,
  migrateFromLocalStorage,
  migrateFromSessionStorage,
  clearLegacyStorage,
  type Frame,
  type SessionData,
} from "@/lib/storage";

// ── Constants ──

const API_KEY_STORAGE = "aop_api_key";
const MODEL_STORAGE = "aop_model";

const MODELS = [
  { id: "claude-sonnet-4-6", label: "Sonnet 4.6", desc: "Latest" },
  { id: "claude-sonnet-4-5", label: "Sonnet 4.5", desc: "Best balance" },
  { id: "claude-opus-4", label: "Opus 4", desc: "Highest quality" },
  { id: "claude-haiku-3-5", label: "Haiku 3.5", desc: "Fastest" },
] as const;

type ModelId = (typeof MODELS)[number]["id"];


const QUICK_ACTIONS = [
  "More subtle",
  "More motion",
  "Simplify",
  "Shift palette",
  "Add depth",
];

const INITIAL_SUGGESTIONS: Record<string, string[]> = {
  default: [
    "A murmuration of starlings",
    "Ink drops blooming in water",
    "A single pendulum swinging",
    "Phyllotaxis spiral of dots",
    "Rain falling on a still pond",
    "A tree growing from a seed",
    "Smoke rising from a candle",
    "A double pendulum with trails",
    "Drifting particles connected by threads",
    "A Voronoi diagram slowly shifting",
    "Mountain ridgeline at golden hour",
    "Bouncing balls with gravity",
    "A sunflower made of particles",
    "Cloth rippling in the wind",
    "Fireflies at dusk over a meadow",
  ],
  pixel: [
    "A campfire with rising sparks",
    "A tiny planet slowly rotating",
    "Rain falling on pixel rooftops",
    "A cozy room with flickering light",
    "Fish swimming in an 8-bit pond",
    "A pixel rocket launching upward",
    "A windmill turning in a field",
    "Snowfall over a pixel village",
    "An hourglass with falling sand",
    "A lighthouse beam sweeping the dark",
  ],
  geometric: [
    "A Penrose tiling that breathes",
    "Nested polygons rotating in opposite directions",
    "A Sierpinski triangle assembling",
    "Circles packing into a square",
    "A Mondrian grid with shifting proportions",
    "Hexagonal cells pulsing like a heartbeat",
    "Golden ratio spirals layered",
    "Voronoi cells drifting apart",
    "An impossible triangle rotating in 3D",
    "Tessellation morphing between shapes",
  ],
  organic: [
    "Coral branching outward slowly",
    "Ink diffusing through still water",
    "A jellyfish pulsing downward",
    "Roots finding their way through soil",
    "Cells dividing under a microscope",
    "A vine climbing a wall",
    "Waves of bioluminescent plankton",
    "A fern unfurling its fronds",
    "Lava lamp blobs rising and falling",
    "Mushrooms sprouting from a log",
  ],
  brutalist: [
    "A grid of squares eroding",
    "Static noise resolving into a shape",
    "Bold text shattering into fragments",
    "Harsh lines converging to a point",
    "A monochrome maze being carved",
    "Concrete blocks stacking and falling",
    "Scan lines distorting a circle",
    "A barcode slowly bending",
    "Cracks propagating across a surface",
    "Binary digits cascading down",
  ],
  neon: [
    "Plasma arcs between two points",
    "A grid floor stretching to the horizon",
    "Glowing rings orbiting each other",
    "A synthwave sun with reflection",
    "Neon rain on wet pavement",
    "Particle trails forming a spiral",
    "Electric arcs jumping across nodes",
    "A wireframe sphere rotating",
    "Light beams refracting through a prism",
    "Pulsing frequency bars like an equalizer",
  ],
};

function pickRandom<T>(pool: T[], n: number): T[] {
  const copy = [...pool];
  const out: T[] = [];
  for (let i = 0; i < n && copy.length > 0; i++) {
    const idx = Math.floor(Math.random() * copy.length);
    out.push(copy.splice(idx, 1)[0]);
  }
  return out;
}

function pickInitialSuggestions(style = "default", n = 3): string[] {
  return pickRandom(INITIAL_SUGGESTIONS[style] ?? INITIAL_SUGGESTIONS.default, n);
}

async function fetchGeneratedSuggestions(
  apiKey: string,
  style: string,
  signal?: AbortSignal
): Promise<string[]> {
  const preset = STYLE_PRESETS.find((s) => s.id === style);
  const styleCtx = preset?.modifier
    ? `The visual style is: ${preset.modifier}`
    : "The visual style is open / default — poetic, generative, beautiful.";

  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
  const msg = await client.messages.create(
    {
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      system:
        "You generate creative short prompt ideas for a generative art / animation tool. Each idea must be ONE small, incremental change — not a complex multi-part transformation. Return ONLY a raw JSON array of strings — no markdown, no explanation.",
      messages: [
        {
          role: "user",
          content: `${styleCtx}

Generate 30 short, simple animation/visual prompts that fit this style. Each should be 3-6 words and describe a SINGLE incremental change (add one element, shift a color, adjust speed, tweak a shape). NOT multi-step transformations. Think "Add soft rain", "Slow the drift down", "Tint everything amber" — not "Create an underwater city with bioluminescent coral and swimming fish".

Return as a JSON array: ["...", "...", ...]`,
        },
      ],
    },
    { signal }
  );

  const text = msg.content[0]?.type === "text" ? msg.content[0].text.trim() : "";
  const arrStart = text.indexOf("[");
  const arrEnd = text.lastIndexOf("]");
  if (arrStart === -1 || arrEnd === -1) return [];
  let arr: unknown;
  try {
    arr = JSON.parse(text.slice(arrStart, arrEnd + 1));
  } catch {
    return [];
  }
  if (!Array.isArray(arr)) return [];
  return (arr as unknown[]).filter((s): s is string => typeof s === "string").slice(0, 30);
}

const MAX_HTML_CONTEXT = 50_000;

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
    if (signal.aborted) {
      stream.abort();
    } else {
      signal.addEventListener("abort", () => stream.abort(), { once: true });
    }
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

  const parsed = parseClaudeJSON(jsonStr);

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

function getStoredModel(): ModelId {
  if (typeof window === "undefined") return "claude-sonnet-4-5";
  const stored = localStorage.getItem(MODEL_STORAGE);
  if (stored && MODELS.some((m) => m.id === stored)) return stored as ModelId;
  return "claude-sonnet-4-5";
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
        <p className="text-[11px] text-muted-foreground/50">by Dante Maggiotto</p>
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
  const [importError, setImportError] = useState<string | null>(null);

  const handleFileLoad = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportError(null);
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result as string);
        if (!data?.title || !Array.isArray(data.frames)) {
          setImportError("Invalid session file — missing title or frames.");
          return;
        }
        const validFrames = (data.frames as unknown[]).filter(
          (f): f is Frame =>
            typeof f === "object" && f !== null &&
            typeof (f as Frame).html === "string" &&
            typeof (f as Frame).number === "number" &&
            typeof (f as Frame).promptText === "string" &&
            typeof (f as Frame).acknowledgment === "string"
        );
        if (validFrames.length === 0 && data.frames.length > 0) {
          setImportError("Session file frames are malformed or missing required fields.");
          return;
        }
        onLoad({ style: "default", ...data, frames: validFrames });
      } catch {
        setImportError("Could not parse file — expected a .json session export.");
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
                onStart(title.trim(), style, resolveTemplate(selectedTemplate, style))
              }
            />
          </div>

          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Style</p>
            <div className="flex flex-wrap gap-1.5">
              {STYLE_PRESETS.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setStyle(s.id as StyleId)}
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
              {TEMPLATES.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setTemplateId(t.id)}
                    className={`rounded border px-4 py-3 text-left transition-colors ${
                      templateId === t.id
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
              ))}
            </div>
          </div>

          <Button
            onClick={() =>
              title.trim() && onStart(title.trim(), style, resolveTemplate(selectedTemplate, style))
            }
            disabled={!title.trim()}
            className="w-full py-3 text-base"
          >
            Start
          </Button>

          <div className="flex flex-col items-center gap-2 pt-1">
            <label className="cursor-pointer text-sm text-muted-foreground hover:text-foreground">
              Import session
              <input
                type="file"
                accept=".json"
                onChange={handleFileLoad}
                className="hidden"
              />
            </label>
            {importError && (
              <p className="text-xs text-red-500">{importError}</p>
            )}
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

const LOADING_WORDS = [
  "evolving",
  "imagining",
  "rendering",
  "composing",
  "conjuring",
  "painting",
  "thinking",
  "dreaming",
  "sculpting",
  "weaving",
];

const SCRAMBLE_CHARS = "abcdefghijklmnopqrstuvwxyz";

function LoadingCanvas() {
  const [wordIdx, setWordIdx] = useState(0);
  const [displayed, setDisplayed] = useState(LOADING_WORDS[0]);

  // Scramble animation whenever wordIdx changes
  useEffect(() => {
    const word = LOADING_WORDS[wordIdx];
    let frame = 0;
    const totalFrames = 18;
    const id = setInterval(() => {
      frame++;
      if (frame >= totalFrames) {
        setDisplayed(word);
        clearInterval(id);
        return;
      }
      const progress = frame / totalFrames;
      setDisplayed(
        word
          .split("")
          .map((ch, i) =>
            progress * word.length > i + 0.6
              ? ch
              : SCRAMBLE_CHARS[Math.floor(Math.random() * SCRAMBLE_CHARS.length)]
          )
          .join("")
      );
    }, 30);
    return () => clearInterval(id);
  }, [wordIdx]);

  // Cycle words
  useEffect(() => {
    const id = setInterval(
      () => setWordIdx((i) => (i + 1) % LOADING_WORDS.length),
      2400
    );
    return () => clearInterval(id);
  }, []);

  return (
    <div className="flex h-full items-center justify-center bg-background">
      <p className="font-mono text-4xl font-bold tracking-tight text-foreground/70">
        {displayed}
      </p>
    </div>
  );
}

// ── Health check ──

const HEALTH_CHECK_SCRIPT = `<script>
(function(){
  var _o=(window.location.ancestorOrigins&&window.location.ancestorOrigins[0])||(document.referrer?new URL(document.referrer).origin:null)||'*';
  var resolved=false;
  var t=setTimeout(function(){
    if(!resolved){resolved=true;window.parent.postMessage({type:'artifact-health',blank:true},_o);}
  },5000);
  function check(){
    if(resolved)return;
    var hasCanvas=document.querySelector('canvas');
    var hasSvg=document.querySelector('svg');
    var bodyH=document.body?document.body.scrollHeight:0;
    var kids=document.body?document.body.children.length:0;
    var hasFixedContent=false;
    if(document.body){try{hasFixedContent=Array.from(document.body.querySelectorAll('*')).some(function(el){
      var s=getComputedStyle(el);
      return (s.position==='fixed'||s.position==='absolute')&&el.getBoundingClientRect().width>0;
    });}catch(e){}}
    var visible=bodyH>50&&kids>0;
    if(hasCanvas||hasSvg||visible||hasFixedContent){
      resolved=true;clearTimeout(t);
      window.parent.postMessage({type:'artifact-health',blank:false},_o);
    }
  }
  // Poll repeatedly instead of checking once — complex artifacts may need time to initialize
  window.addEventListener('load',function(){
    var polls=0;
    var iv=setInterval(function(){
      check();polls++;
      if(resolved||polls>=8){clearInterval(iv);}
    },500);
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

  // Crossfade: bump key when html changes to trigger animation.
  // Always bump on loading→false transition so retry with identical HTML still remounts.
  useEffect(() => {
    if (html && !loading) {
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
  const ctx = target.getContext("2d", { willReadFrequently: true });
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
  const ctx = target.getContext("2d", { willReadFrequently: true });
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
  let iframe: HTMLIFrameElement | null = null;
  try {
    iframe = await createOffscreenIframe(html, 800, 800);
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

    const dataUrl = canvas.toDataURL("image/jpeg", 0.7);
    return dataUrl.split(",")[1] || null;
  } catch {
    return null;
  } finally {
    if (iframe) {
      try { document.body.removeChild(iframe); } catch { /* ok */ }
    }
  }
}


type RequestFrameFn = { requestFrame?: () => void };

function isCanvasBlank(canvas: HTMLCanvasElement): boolean {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
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

// ── Gallery sidebar (virtual list) ──

const SIDEBAR_ITEM_H = 64; // px — must match the rendered button height

function GallerySidebar({
  frames,
  selectedIdx,
  onSelect,
}: {
  frames: SessionData["frames"];
  selectedIdx: number;
  onSelect: (i: number) => void;
}) {
  const OVERSCAN = 6;
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewH, setViewH] = useState(600);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setViewH(el.clientHeight));
    ro.observe(el);
    const onScroll = () => setScrollTop(el.scrollTop);
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => { ro.disconnect(); el.removeEventListener("scroll", onScroll); };
  }, []);

  // Keep selected item visible during playback / export
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const itemTop = selectedIdx * SIDEBAR_ITEM_H;
    const itemBot = itemTop + SIDEBAR_ITEM_H;
    if (itemTop < el.scrollTop || itemBot > el.scrollTop + el.clientHeight) {
      el.scrollTo({ top: itemTop - el.clientHeight / 2 + SIDEBAR_ITEM_H / 2, behavior: "smooth" });
    }
  }, [selectedIdx]);

  const startIdx = Math.max(0, Math.floor(scrollTop / SIDEBAR_ITEM_H) - OVERSCAN);
  const endIdx = Math.min(frames.length - 1, Math.ceil((scrollTop + viewH) / SIDEBAR_ITEM_H) + OVERSCAN);

  return (
    <div ref={containerRef} className="w-64 overflow-y-auto border-l">
      <div style={{ height: frames.length * SIDEBAR_ITEM_H, position: "relative" }}>
        {frames.slice(startIdx, endIdx + 1).map((f, localIdx) => {
          const i = startIdx + localIdx;
          return (
            <button
              key={f.number}
              onClick={() => onSelect(i)}
              style={{ position: "absolute", top: i * SIDEBAR_ITEM_H, left: 0, right: 0, height: SIDEBAR_ITEM_H }}
              className={`border-b px-4 py-3 text-left transition-colors ${
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
          );
        })}
      </div>
    </div>
  );
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

  // Clamp selectedIdx if frames shrink (e.g. undo from active session while gallery is open)
  useEffect(() => {
    if (frames.length > 0 && selectedIdx >= frames.length) {
      setSelectedIdx(frames.length - 1);
    }
  }, [frames.length, selectedIdx]);

  const current = frames[Math.min(selectedIdx, Math.max(0, frames.length - 1))];

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
      zip.file(`frame-${String(f.number).padStart(3, "0")}.html`, f.html ?? "");
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
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };

  const handleRecordTimelapse = async () => {
    if (frames.length < 2) return;

    if (frames.length > 100) {
      const mins = Math.ceil((frames.length * secPerFrame) / 60);
      if (!window.confirm(
        `This session has ${frames.length} frames. Export will take ~${mins} minutes and produce a large file. Continue?`
      )) return;
    }

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

    let pendingBatch: Promise<HTMLIFrameElement[]> | null = null;

    // Hoisted so finally can stop the recorder/stream on abort or error
    let stream: MediaStream | null = null;
    let recorder: MediaRecorder | null = null;
    let done: Promise<void> = Promise.resolve();

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
      stream = canvas.captureStream(0);
      const mimeType = (
        ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"]
          .find((t) => MediaRecorder.isTypeSupported(t)) || "video/webm"
      );
      recorder = new MediaRecorder(stream, {
        mimeType,
        videoBitsPerSecond: 10_000_000,
      });
      const chunks: BlobPart[] = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
      done = new Promise<void>((resolve) => {
        recorder!.onstop = () => resolve();
      });
      recorder.start();
      const track = stream.getVideoTracks()[0];
      const durationMs = secPerFrame * 1000;
      const captureFps = 60;

      const initCtx = canvas.getContext("2d", { willReadFrequently: true });
      if (initCtx) { initCtx.fillStyle = "#FBF8EF"; initCtx.fillRect(0, 0, VW, VH); }

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

      if (!abortRef.current.aborted) {
        setExportProgress("Finalizing...");
        recorder.stop();
        await done;
        const blob = new Blob(chunks, { type: "video/webm" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${session.title.replace(/\s+/g, "-").toLowerCase()}-timelapse.webm`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
      }
    } catch (err) {
      console.error("Recording failed:", err);
    } finally {
      // Stop recorder and release stream tracks regardless of abort/error
      try {
        if (recorder && recorder.state !== "inactive") { recorder.stop(); await done; }
      } catch { /* ok */ }
      stream?.getTracks().forEach((t: MediaStreamTrack) => t.stop());
      destroyIframes(liveIframes);
      pendingBatch?.then((batch) => destroyIframes(batch)).catch(() => {});
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

        <GallerySidebar
          frames={frames}
          selectedIdx={selectedIdx}
          onSelect={(i) => { setPlaying(false); setSelectedIdx(i); }}
        />
      </div>
    </div>
  );
}

// ── Main active session ──

function ActiveSession({
  apiKey,
  session,
  onFrameAdded,
  onFrameRemoved,
  onMetaChanged,
  onEnd,
  onChangeKey,
  onSave,
}: {
  apiKey: string;
  session: SessionData;
  onFrameAdded: (session: SessionData, frame: Frame) => void;
  onFrameRemoved: (session: SessionData, removedNumber: number) => void;
  onMetaChanged: (session: SessionData) => void;
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
    return session.frames.length <= 1 ? pickInitialSuggestions(session.style) : [];
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
  const suggestionPoolRef = useRef<string[]>([]);
  useEffect(() => { sessionRef.current = session; });

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (ackTimerRef.current) clearTimeout(ackTimerRef.current);
    };
  }, []);

  const handleModelChange = (id: ModelId) => {
    setModel(id);
    localStorage.setItem(MODEL_STORAGE, id);
  };

  const handleStyleChange = useCallback((id: StyleId) => {
    onMetaChanged({ ...sessionRef.current, style: id });
  }, [onMetaChanged]);

  const lastFrame = session.frames[session.frames.length - 1];

  // Dynamic tab title
  useEffect(() => {
    const num = String(lastFrame?.number ?? 0).padStart(3, "0");
    document.title = `${num} — ${session.title} | Art of Prompt`;
    return () => {
      document.title = "The Art of Prompt";
    };
  }, [lastFrame?.number, session.title]);

  // Generate style-aware suggestions on fresh session start
  useEffect(() => {
    if (session.frames.length > 1) return;
    const ctrl = new AbortController();
    fetchGeneratedSuggestions(apiKey, session.style, ctrl.signal)
      .then((generated) => {
        if (generated.length >= 3) {
          suggestionPoolRef.current = generated;
          setSuggestions(generated.slice(0, 3));
        }
      })
      .catch(() => { /* keep hardcoded fallback */ });
    return () => ctrl.abort();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Capture screenshot in background after each frame's HTML is set.
  // Only cancel when the html itself changes (new frame), not on loading state changes —
  // cancelling on loading=true meant fast users always got a null screenshot.
  useEffect(() => {
    if (!lastFrame?.html) return;
    let cancelled = false;
    captureArtifactScreenshot(lastFrame.html).then((b64) => {
      if (!cancelled) screenshotRef.current = b64;
    });
    return () => {
      cancelled = true;
      screenshotRef.current = null;
    };
  }, [lastFrame?.html]);

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
        const updated = { ...sessionRef.current, frames: newFrames };
        onFrameAdded(updated, newFrame);
        if (!isRetry) setPrompt("");
        setStreamText("");
        setAck(result.acknowledgment);
        if (result.suggestions?.length) {
          setSuggestions(result.suggestions);
          suggestionPoolRef.current = result.suggestions;
        } else {
          setSuggestions(
            suggestionPoolRef.current.length > 0
              ? pickRandom(suggestionPoolRef.current, 3)
              : pickInitialSuggestions(sessionRef.current.style)
          );
        }
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
    [apiKey, model, onFrameAdded]
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
    // Create abort controller immediately so handleCancel can abort the upcoming generate call
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    const s = sessionRef.current;
    const removedFrame = s.frames[s.frames.length - 1];
    if (!removedFrame) return;
    const framesBeforeBad = s.frames.slice(0, -1);
    const prevFrame = framesBeforeBad[framesBeforeBad.length - 1];
    onFrameRemoved({ ...s, frames: framesBeforeBad }, removedFrame.number);
    setTimeout(() => {
      if (controller.signal.aborted) return;
      generate(
        lastPromptRef.current,
        framesBeforeBad,
        prevFrame?.html ?? null,
        prevFrame ? prevFrame.number + 1 : 1,
        true
      );
    }, 100);
  }, [loading, onFrameRemoved, generate]);

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
              className={`mt-1 text-lg font-light tracking-tight text-foreground ${
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
                    const removed = session.frames[session.frames.length - 1];
                    onFrameRemoved({
                      ...session,
                      frames: session.frames.slice(0, -1),
                    }, removed?.number ?? 0);
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
            <div className="mb-4 flex flex-wrap items-center gap-1">
              {suggestions.map((s) => (
                <button
                  key={s}
                  onClick={() => setPrompt(s)}
                  className="rounded border border-border px-2 py-1 text-[11px] text-muted-foreground hover:border-foreground/30 hover:text-foreground transition-colors"
                >
                  {s}
                </button>
              ))}
              {suggestionPoolRef.current.length > 3 && (
                <button
                  onClick={() => setSuggestions(pickRandom(suggestionPoolRef.current, 3))}
                  className="rounded px-1.5 py-1 text-[11px] text-muted-foreground/50 hover:text-muted-foreground transition-colors"
                  title="Show different suggestions"
                >
                  ↻
                </button>
              )}
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
                    setPrompt((p) => {
                      if (p.toLowerCase().includes(qa.toLowerCase())) return p;
                      return p.trim() ? `${p.trim()}, ${qa.toLowerCase()}` : qa;
                    })
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
                    const removed = session.frames[session.frames.length - 1];
                    onFrameRemoved({
                      ...session,
                      frames: session.frames.slice(0, -1),
                    }, removed?.number ?? 0);
                    setAck(null);
                    setError(null);
                  }}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  Undo
                </button>
              )}
              <button
                onClick={() => {
                  if (session.frames.length === 0 || window.confirm("Start a new session? Unsaved progress will be lost.")) {
                    onEnd();
                  }
                }}
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
    if (storedKey) setApiKey(storedKey);

    (async () => {
      let sess = await loadSession();

      // Migrate from old sessionStorage/localStorage if IDB is empty
      if (!sess) {
        sess = migrateFromSessionStorage();
        if (sess) {
          await saveSession(sess);
          await saveAutosave(sess);
        }
      }

      if (sess) {
        setSession(sess);
      } else {
        let auto = await loadAutosave();
        if (!auto) auto = migrateFromLocalStorage();
        if (auto) {
          await saveAutosave(auto);
          setRecoverySession(auto);
        }
      }

      clearLegacyStorage();
      setReady(true);
    })();
  }, []);

  const handleApiKey = (key: string) => {
    sessionStorage.setItem(API_KEY_STORAGE, key);
    setApiKey(key);
  };

  const handleStartSession = async (
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
    await saveSession(newSession);
    await saveAutosave(newSession);
    setSession(newSession);
    setRecoverySession(null);
  };

  const handleLoadSession = async (loaded: SessionData) => {
    await saveSession(loaded);
    await saveAutosave(loaded);
    setSession(loaded);
    setRecoverySession(null);
  };

  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    };
  }, []);

  const warnIdbError = (op: string) => (err: unknown) => {
    console.error(`[storage] ${op} failed:`, err);
  };

  const handleFrameAdded = (updated: SessionData, frame: Frame) => {
    setSession(updated);
    appendFrame(updated, frame).catch(warnIdbError("appendFrame"));
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => {
      appendFrameAutosave(updated, frame).catch(warnIdbError("appendFrameAutosave"));
    }, 1000);
  };

  const handleFrameRemoved = (updated: SessionData, removedNumber: number) => {
    setSession(updated);
    removeLastFrame(updated, removedNumber).catch(warnIdbError("removeLastFrame"));
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => {
      removeLastFrameAutosave(updated, removedNumber).catch(warnIdbError("removeLastFrameAutosave"));
    }, 1000);
  };

  const handleMetaChanged = (updated: SessionData) => {
    setSession(updated);
    saveSessionMeta(updated).catch(warnIdbError("saveSessionMeta"));
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => {
      saveAutosaveMeta(updated).catch(warnIdbError("saveAutosaveMeta"));
    }, 1000);
  };

  const handleEndSession = () => {
    clearSession().catch(() => {});
    clearAutosave().catch(() => {});
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
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
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
                  clearAutosave().catch(() => {});
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
      onFrameAdded={handleFrameAdded}
      onFrameRemoved={handleFrameRemoved}
      onMetaChanged={handleMetaChanged}
      onEnd={handleEndSession}
      onChangeKey={handleChangeKey}
      onSave={handleSaveSession}
    />
  );
}
