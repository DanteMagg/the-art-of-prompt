/**
 * Swarm test runner — simulates multiple sessions with varied prompts/styles,
 * validates each frame response for parse correctness, code quality, and
 * render-quality signals.
 *
 * Usage:
 *   API_KEY=<your-key> npx tsx scripts/swarm-test.ts
 *   API_KEY=<key> CONCURRENCY=4 MODEL=claude-haiku-4-5-20251001 npx tsx scripts/swarm-test.ts
 */

import Anthropic from "@anthropic-ai/sdk";
import { buildSystemPrompt, STYLE_PRESETS, type StyleId } from "../src/lib/system-prompt";

// ── Config ──────────────────────────────────────────────────────────────────

const API_KEY = process.env.API_KEY ?? "";
const CONCURRENCY = parseInt(process.env.CONCURRENCY ?? "3", 10);
const MODEL = process.env.MODEL ?? "claude-haiku-4-5-20251001";

if (!API_KEY) {
  console.error("Error: API_KEY environment variable is required.");
  process.exit(1);
}

// ── ANSI helpers ─────────────────────────────────────────────────────────────

const c = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  cyan: "\x1b[36m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  white: "\x1b[37m",
};

const ok   = (s: string) => `${c.green}✓${c.reset} ${s}`;
const fail = (s: string) => `${c.red}✗${c.reset} ${s}`;
const warn = (s: string) => `${c.yellow}⚠${c.reset} ${s}`;
const info = (s: string) => `${c.cyan}·${c.reset} ${s}`;

function scoreBar(score: number): string {
  const filled = Math.round(score / 10);
  const color = score >= 80 ? c.green : score >= 50 ? c.yellow : c.red;
  return `${color}${"█".repeat(filled)}${"░".repeat(10 - filled)}${c.reset}`;
}

// ── Test Scenarios ────────────────────────────────────────────────────────────

interface Scenario {
  name: string;
  style: StyleId;
  prompts: string[];
  /** keywords we expect to see evidence of in the output HTML */
  expectKeywords?: string[];
}

const SCENARIOS: Scenario[] = [
  // Default style
  {
    name: "default / particles",
    style: "default",
    prompts: ["a field of floating particles that breathe slowly"],
    expectKeywords: ["particle", "requestAnimationFrame"],
  },
  {
    name: "default / geometric grid",
    style: "default",
    prompts: ["a minimal grid of squares that pulse in a wave pattern"],
    expectKeywords: ["requestAnimationFrame"],
  },
  {
    name: "default / organic flow",
    style: "default",
    prompts: ["flowing sine wave ribbons in soft cream and charcoal"],
    expectKeywords: ["sin", "requestAnimationFrame"],
  },
  {
    name: "default / multi-turn evolution",
    style: "default",
    prompts: [
      "a single glowing dot at the center",
      "expand it into a ring of dots",
      "make the ring slowly rotate",
    ],
    expectKeywords: ["requestAnimationFrame"],
  },

  // Pixel style
  {
    name: "pixel / sprite scene",
    style: "pixel",
    prompts: ["a pixel art forest with a small campfire"],
    expectKeywords: ["fillRect"],
  },
  {
    name: "pixel / retro landscape",
    style: "pixel",
    prompts: ["a scrolling pixel art starfield with a tiny rocket ship"],
    expectKeywords: ["fillRect", "requestAnimationFrame"],
  },
  {
    name: "pixel / character",
    style: "pixel",
    prompts: ["a pixel art character walking in place"],
    expectKeywords: ["fillRect"],
  },

  // Geometric style
  {
    name: "geometric / tessellation",
    style: "geometric",
    prompts: ["a Mondrian-style grid of colored rectangles that slowly shift hues"],
    expectKeywords: ["requestAnimationFrame"],
  },
  {
    name: "geometric / sacred geometry",
    style: "geometric",
    prompts: ["a flower of life pattern slowly rotating"],
    expectKeywords: ["arc", "requestAnimationFrame"],
  },
  {
    name: "geometric / bauhaus",
    style: "geometric",
    prompts: ["a Bauhaus composition with bold primary circles and lines in motion"],
    expectKeywords: ["requestAnimationFrame"],
  },

  // Organic style
  {
    name: "organic / bioluminescence",
    style: "organic",
    prompts: ["glowing bioluminescent jellyfish drifting upward"],
    expectKeywords: ["requestAnimationFrame", "radialGradient"],
  },
  {
    name: "organic / coral growth",
    style: "organic",
    prompts: ["a coral reef slowly growing from the bottom"],
    expectKeywords: ["requestAnimationFrame"],
  },
  {
    name: "organic / flowing water",
    style: "organic",
    prompts: ["a gentle river with caustic light patterns on the bottom"],
    expectKeywords: ["requestAnimationFrame", "sin"],
  },

  // Brutalist style
  {
    name: "brutalist / glitch",
    style: "brutalist",
    prompts: ["a glitch art piece with harsh horizontal scan lines shifting"],
    expectKeywords: ["requestAnimationFrame"],
  },
  {
    name: "brutalist / concrete",
    style: "brutalist",
    prompts: ["bold black-and-white geometric blocks crashing together"],
    expectKeywords: ["requestAnimationFrame"],
  },

  // Neon style
  {
    name: "neon / synthwave grid",
    style: "neon",
    prompts: ["a synthwave perspective grid with neon pink horizon glow"],
    expectKeywords: ["requestAnimationFrame"],
  },
  {
    name: "neon / cyberpunk rain",
    style: "neon",
    prompts: ["neon rain falling in a dark cyberpunk city silhouette"],
    expectKeywords: ["requestAnimationFrame"],
  },
  {
    name: "neon / circuit trace",
    style: "neon",
    prompts: ["glowing circuit traces growing across a dark background"],
    expectKeywords: ["requestAnimationFrame"],
  },

  // Edge cases / hard prompts
  {
    name: "default / 3D sphere",
    style: "default",
    prompts: ["a 3D sphere rotating with realistic lighting"],
    expectKeywords: ["Math.cos", "Math.sin", "requestAnimationFrame"],
  },
  {
    name: "default / 3D cube (polygon mesh)",
    style: "default",
    prompts: ["a slowly rotating 3D cube with distinct colored faces"],
    expectKeywords: ["Math.cos", "Math.sin", "requestAnimationFrame"],
  },
  {
    name: "default / physics bouncing",
    style: "default",
    prompts: ["colored balls bouncing with realistic gravity and floor collisions"],
    expectKeywords: ["requestAnimationFrame"],
  },
  {
    name: "default / particle text",
    style: "default",
    prompts: ["particles that form the word HELLO with at least 500 particles"],
    expectKeywords: ["requestAnimationFrame", "500"],
  },
  {
    name: "default / fire smoke",
    style: "default",
    prompts: ["a candle flame with rising smoke particles"],
    expectKeywords: ["requestAnimationFrame"],
  },
  {
    name: "default / tree growth",
    style: "default",
    prompts: ["a recursive tree growing from the bottom center with swaying branches"],
    expectKeywords: ["requestAnimationFrame", "Math.sin"],
  },
  {
    name: "geometric / fractal",
    style: "geometric",
    prompts: ["a Sierpinski triangle fractal drawn with L-system turtle graphics"],
    expectKeywords: [],
  },
  {
    name: "organic / water ripples",
    style: "organic",
    prompts: ["a water surface with expanding ripple rings when touched"],
    expectKeywords: ["requestAnimationFrame"],
  },
];

// ── JSON parsing ──────────────────────────────────────────────────────────────

function stripCodeFence(text: string): string {
  const t = text.trim();
  if (!t.startsWith("```")) return t;
  const firstNl = t.indexOf("\n");
  if (firstNl === -1) return t;
  const inner = t.slice(firstNl + 1);
  const lastFence = inner.lastIndexOf("\n```");
  return lastFence !== -1 ? inner.slice(0, lastFence).trim() : inner.trim();
}

function extractBalancedJSON(text: string): string | null {
  const start = text.indexOf("{");
  if (start === -1) return null;
  let depth = 0, inStr = false, esc = false;
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

function sanitizeJSONControlChars(json: string): string {
  let out = "", inStr = false, esc = false;
  for (let i = 0; i < json.length; i++) {
    const ch = json[i];
    if (esc) { out += ch; esc = false; continue; }
    if (ch === "\\" && inStr) { out += ch; esc = true; continue; }
    if (ch === '"') { inStr = !inStr; out += ch; continue; }
    if (inStr) {
      const code = ch.charCodeAt(0);
      if (code < 0x20 || code === 0x7f) {
        if (ch === "\n") { out += "\\n"; continue; }
        if (ch === "\r") { out += "\\r"; continue; }
        if (ch === "\t") { out += "\\t"; continue; }
        continue;
      }
    }
    out += ch;
  }
  return out;
}

interface ParsedFrame { html: string; acknowledgment: string; suggestions?: string[] }

function parseResponse(raw: string): ParsedFrame {
  const stripped = stripCodeFence(raw);
  for (const candidate of [raw, stripped]) {
    try { const p = JSON.parse(candidate); if (p.html && p.acknowledgment) return p; } catch { /**/ }
    try { const p = JSON.parse(sanitizeJSONControlChars(candidate)); if (p.html && p.acknowledgment) return p; } catch { /**/ }
    const ex = extractBalancedJSON(candidate);
    if (ex) {
      try { const p = JSON.parse(ex); if (p.html && p.acknowledgment) return p; } catch { /**/ }
      try { const p = JSON.parse(sanitizeJSONControlChars(ex)); if (p.html && p.acknowledgment) return p; } catch { /**/ }
    }
  }
  throw new Error(`JSON parse failed. Raw starts with: ${raw.slice(0, 200)}`);
}

// ── Quality scoring ───────────────────────────────────────────────────────────

interface QualityCheck {
  label: string;
  score: number;   // 0-10 points
  max: number;
  note?: string;
}

interface QualityResult {
  total: number;   // 0-100
  checks: QualityCheck[];
}

function scoreQuality(html: string, style: StyleId, prompt: string, expectKeywords: string[]): QualityResult {
  const checks: QualityCheck[] = [];

  // ── Code structure ──

  const hasRAF      = /requestAnimationFrame/i.test(html);
  const hasTryCatch = /try\s*\{/.test(html);
  const hasViewport = /name=["']viewport["']/i.test(html);
  const hasDoctype  = /<!DOCTYPE html>/i.test(html);
  const hasVarDecl  = /\bvar\b/.test(html);
  const usesConst   = /\bconst\b/.test(html);
  const hasCanvas   = /<canvas/i.test(html);
  const hasSVG      = /<svg/i.test(html);
  const hasExplicitCanvasSize = /canvas\.width\s*=|canvas\.height\s*=|width=["']\d|height=["']\d/.test(html);

  checks.push({ label: "requestAnimationFrame loop", score: hasRAF ? 10 : 0, max: 10, note: hasRAF ? undefined : "no RAF — may be static or use setTimeout" });
  checks.push({ label: "try/catch around animation", score: hasTryCatch ? 8 : 0, max: 8, note: hasTryCatch ? undefined : "missing — runtime errors will crash animation" });
  checks.push({ label: "viewport meta tag", score: hasViewport ? 4 : 0, max: 4 });
  checks.push({ label: "DOCTYPE declaration", score: hasDoctype ? 3 : 0, max: 3 });
  checks.push({ label: "uses const/let (no var)", score: !hasVarDecl ? 5 : usesConst ? 2 : 0, max: 5, note: hasVarDecl ? "uses var — should be const/let" : undefined });
  if (hasCanvas) {
    checks.push({ label: "explicit canvas dimensions", score: hasExplicitCanvasSize ? 5 : 0, max: 5, note: hasExplicitCanvasSize ? undefined : "canvas size not set explicitly" });
  }

  // ── Style compliance ──

  const isNeonStyle = style === "neon";
  const darkBgPatterns = [
    /#0[0-9a-f]{5}|#1[0-2][0-9a-f]{4}/i,   // very dark hex
    /rgba?\(\s*0\s*,\s*0\s*,\s*0/,           // rgb(0,0,0)
    /background(?:-color)?:\s*(?:black|#000)/i,
  ];
  const hasDarkBg = darkBgPatterns.some((p) => p.test(html));
  const creamPatterns = [/#fbf8ef|#fafafa|#f5f5f5|#fff(?:ffe)?|#fffff[0-9a-f]/i, /cream|ivory|off.white/i];
  const hasCreamBg = creamPatterns.some((p) => p.test(html));

  if (isNeonStyle) {
    checks.push({ label: "dark background (neon style)", score: hasDarkBg ? 8 : 0, max: 8, note: hasDarkBg ? undefined : "neon style should have dark bg" });
  } else {
    // For default/pixel/geometric/organic/brutalist — only flag dark bg if no dark keyword in prompt
    const darkPromptKeywords = /\b(dark|night|noir|space|midnight|shadow|glitch|fire|flame|bioluminescen|starfield|lava)\b/i.test(prompt);
    if (!darkPromptKeywords && hasDarkBg) {
      checks.push({ label: "light background (non-dark style)", score: 0, max: 6, note: "dark bg on non-dark prompt — violates default palette rule" });
    } else {
      checks.push({ label: "light background (non-dark style)", score: hasCreamBg ? 6 : 3, max: 6, note: hasCreamBg ? undefined : "cream bg not detected — may be white or near-white (ok if intentional)" });
    }
  }

  // ── Animation quality ──

  const hasAnimKeyframes = /@keyframes/i.test(html);
  const hasCSSTransition = /transition:/i.test(html);
  const hasAnimation = hasRAF || hasAnimKeyframes || hasCSSTransition;
  checks.push({ label: "has animation (RAF/CSS)", score: hasAnimation ? 6 : 0, max: 6, note: hasAnimation ? undefined : "no animation detected — may be static" });

  // Loop cleanup — cancel RAF on unload
  const hasCancelRAF = /cancelAnimationFrame/.test(html);
  checks.push({ label: "cancels RAF on cleanup", score: hasCancelRAF ? 3 : 0, max: 3, note: hasCancelRAF ? undefined : "RAF not cancelled — minor leak on tab close" });

  // ── Self-containment ──

  const hasExternalDeps = /src=["']https?:\/\//i.test(html) || /href=["']https?:\/\//i.test(html);
  checks.push({ label: "no external dependencies", score: hasExternalDeps ? 0 : 8, max: 8, note: hasExternalDeps ? "has external src/href!" : undefined });

  const htmlSizeKB = Buffer.byteLength(html, "utf8") / 1024;
  const sizeScore = htmlSizeKB <= 20 ? 5 : htmlSizeKB <= 35 ? 4 : htmlSizeKB <= 50 ? 2 : 0;
  checks.push({ label: `HTML size (${htmlSizeKB.toFixed(1)}KB)`, score: sizeScore, max: 5, note: htmlSizeKB > 50 ? "exceeds 50KB soft limit" : undefined });

  // ── Prompt fidelity ──

  let fidScore = 0;
  const fidMax = Math.min(expectKeywords.length * 3, 9);
  const missingKeywords: string[] = [];
  for (const kw of expectKeywords) {
    if (html.includes(kw)) fidScore += 3;
    else missingKeywords.push(kw);
  }
  if (expectKeywords.length > 0) {
    checks.push({
      label: `prompt fidelity (${expectKeywords.length} signal${expectKeywords.length > 1 ? "s" : ""})`,
      score: Math.min(fidScore, fidMax),
      max: fidMax,
      note: missingKeywords.length > 0 ? `missing: ${missingKeywords.join(", ")}` : undefined,
    });
  }

  // ── 3D-specific checks ──

  if (/\b3[dD]\b|three.?d/i.test(prompt)) {
    const hasRotationMatrix = /Math\.cos|Math\.sin/.test(html) && /rotate|matrix/i.test(html);
    const hasPerspective = /focalLength|perspect|z\s*\+/.test(html);
    checks.push({ label: "3D rotation math", score: hasRotationMatrix ? 6 : 0, max: 6, note: hasRotationMatrix ? undefined : "no rotation matrix detected — may be CSS fake-3D" });
    checks.push({ label: "perspective projection", score: hasPerspective ? 6 : 0, max: 6, note: hasPerspective ? undefined : "no perspective divide detected" });
  }

  // ── Physics-specific checks ──

  if (/\b(physics|bouncing|gravity|collision|spring|pendulum)\b/i.test(prompt)) {
    const hasGravity = /vy\s*\+=|gravity|accel/i.test(html);
    const hasCollision = /collision|restitution|bounce/i.test(html);
    checks.push({ label: "gravity/physics forces", score: hasGravity ? 5 : 0, max: 5 });
    checks.push({ label: "collision handling", score: hasCollision ? 5 : 0, max: 5 });
  }

  // ── Particle text/shape formation checks (rule 11 — ≥500 required only for explicit text/shape formation) ──

  if (/\b500\b|particles?\s+(form|spell|arrange|into|word|text|shape)|form\w*\s+particles?/i.test(prompt)) {
    const particleCountMatch = html.match(/(?:length|count|num)\s*=\s*(\d+)|new\s+Array\((\d+)\)|for\s*\([^;]+;\s*i\s*<\s*(\d+)/);
    const inferredCount = particleCountMatch
      ? parseInt(particleCountMatch[1] ?? particleCountMatch[2] ?? particleCountMatch[3] ?? "0", 10)
      : 0;
    const has500 = inferredCount >= 500 || /500/.test(html);
    checks.push({ label: "≥500 particles", score: has500 ? 6 : 0, max: 6, note: has500 ? undefined : `inferred count ~${inferredCount} — system prompt requires ≥500` });
  }

  const totalMax = checks.reduce((s, ch) => s + ch.max, 0);
  const totalRaw = checks.reduce((s, ch) => s + ch.score, 0);
  const total = Math.round((totalRaw / totalMax) * 100);

  return { total, checks };
}

// ── Structural validation ─────────────────────────────────────────────────────

interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  htmlSizeKB: number;
}

function validateFrame(html: string, acknowledgment: string): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const htmlSizeKB = Buffer.byteLength(html, "utf8") / 1024;

  if (!html || html.length < 100)     errors.push("html empty or too short");
  if (!acknowledgment?.trim())         errors.push("acknowledgment missing");
  if (htmlSizeKB > 60)                 errors.push(`html too large: ${htmlSizeKB.toFixed(1)}KB`);
  if (/src=["']https?:\/\//i.test(html)) errors.push("external dependency (CDN src)");
  if (!/<html/i.test(html) && !/<body/i.test(html)) errors.push("missing <html>/<body> — partial snippet");

  if (!/name=["']viewport["']/i.test(html)) warnings.push("no viewport meta");
  if (/<input/i.test(html))             warnings.push("contains <input> — may violate no-UI rule");

  return { valid: errors.length === 0, errors, warnings, htmlSizeKB };
}

// ── Frame runner ──────────────────────────────────────────────────────────────

interface FrameResult {
  promptIndex: number;
  prompt: string;
  durationMs: number;
  ok: boolean;
  parseError?: string;
  validation?: ValidationResult;
  quality?: QualityResult;
  acknowledgment?: string;
}

async function runFrame(
  client: Anthropic,
  systemPrompt: string,
  messages: Anthropic.Messages.MessageParam[],
  prompt: string,
  frameIndex: number,
  style: StyleId,
  expectKeywords: string[]
): Promise<{ result: FrameResult; updatedMessages: Anthropic.Messages.MessageParam[] }> {
  const newMessages: Anthropic.Messages.MessageParam[] = [...messages, { role: "user", content: prompt }];
  const start = Date.now();

  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 16000,
      system: systemPrompt,
      messages: newMessages,
    });

    const raw = response.content
      .filter((b): b is Anthropic.Messages.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");

    const parsed = parseResponse(raw);
    const validation = validateFrame(parsed.html, parsed.acknowledgment);
    const quality = scoreQuality(parsed.html, style, prompt, expectKeywords);

    return {
      result: {
        promptIndex: frameIndex,
        prompt,
        durationMs: Date.now() - start,
        ok: validation.valid,
        validation,
        quality,
        acknowledgment: parsed.acknowledgment,
      },
      updatedMessages: [...newMessages, { role: "assistant", content: raw }],
    };
  } catch (err) {
    return {
      result: {
        promptIndex: frameIndex,
        prompt,
        durationMs: Date.now() - start,
        ok: false,
        parseError: err instanceof Error ? err.message : String(err),
      },
      updatedMessages: newMessages,
    };
  }
}

// ── Scenario runner ───────────────────────────────────────────────────────────

interface ScenarioResult {
  scenario: Scenario;
  frames: FrameResult[];
  totalMs: number;
  passed: boolean;
  avgQuality: number;
}

async function runScenario(client: Anthropic, scenario: Scenario): Promise<ScenarioResult> {
  const systemPrompt = buildSystemPrompt(scenario.style);
  let messages: Anthropic.Messages.MessageParam[] = [];
  const frames: FrameResult[] = [];
  const start = Date.now();

  for (let i = 0; i < scenario.prompts.length; i++) {
    const { result, updatedMessages } = await runFrame(
      client, systemPrompt, messages,
      scenario.prompts[i], i, scenario.style,
      scenario.expectKeywords ?? []
    );
    messages = updatedMessages;
    frames.push(result);
    if (result.parseError && i === 0) break;
  }

  const qualityScores = frames.map((f) => f.quality?.total ?? 0);
  const avgQuality = qualityScores.length > 0
    ? Math.round(qualityScores.reduce((a, b) => a + b, 0) / qualityScores.length)
    : 0;

  return {
    scenario,
    frames,
    totalMs: Date.now() - start,
    passed: frames.every((f) => f.ok),
    avgQuality,
  };
}

// ── Concurrency limiter ───────────────────────────────────────────────────────

async function runWithConcurrency<T>(
  tasks: (() => Promise<T>)[],
  limit: number,
  onComplete: (result: T, index: number) => void
): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
  let next = 0;
  async function worker() {
    while (next < tasks.length) {
      const idx = next++;
      results[idx] = await tasks[idx]();
      onComplete(results[idx], idx);
    }
  }
  await Promise.all(Array.from({ length: limit }, () => worker()));
  return results;
}

// ── Report ────────────────────────────────────────────────────────────────────

function printReport(results: ScenarioResult[]) {
  const sep = "─".repeat(72);

  console.log(`\n${c.bold}${c.white}${sep}${c.reset}`);
  console.log(`${c.bold}  SWARM TEST REPORT${c.reset}`);
  console.log(`${c.bold}${c.white}${sep}${c.reset}\n`);

  for (const r of results) {
    const status = r.passed ? `${c.green}PASS${c.reset}` : `${c.red}FAIL${c.reset}`;
    const qBar   = scoreBar(r.avgQuality);
    const time   = `${c.dim}(${(r.totalMs / 1000).toFixed(1)}s)${c.reset}`;
    console.log(`${status}  ${c.bold}${r.scenario.name}${c.reset}  ${qBar} ${r.avgQuality}%  ${time}`);

    for (const f of r.frames) {
      const pLabel = `[frame ${f.promptIndex + 1}/${r.scenario.prompts.length}]`;
      if (f.parseError) {
        console.log(`   ${fail(`${pLabel} PARSE ERROR`)}`);
        console.log(`       ${c.red}${f.parseError.slice(0, 120)}${c.reset}`);
        continue;
      }
      if (!f.validation || !f.quality) continue;

      const vStatus = f.validation.valid ? ok(pLabel) : fail(pLabel);
      const size    = `${f.validation.htmlSizeKB.toFixed(1)}KB`;
      const dur     = `${f.durationMs}ms`;
      const ack     = f.acknowledgment ? ` "${f.acknowledgment.slice(0, 55)}"` : "";
      const qScore  = `${scoreBar(f.quality.total)} ${f.quality.total}%`;
      console.log(`   ${vStatus}  ${qScore}  ${c.dim}${size}  ${dur}${ack}${c.reset}`);

      for (const e of f.validation.errors)   console.log(`       ${c.red}error: ${e}${c.reset}`);
      for (const w of f.validation.warnings) console.log(`       ${c.yellow}warn:  ${w}${c.reset}`);

      // Show quality issues (non-full-score checks)
      const issues = f.quality.checks.filter((ch) => ch.score < ch.max);
      for (const ch of issues) {
        const pct = Math.round((ch.score / ch.max) * 100);
        const col = pct === 0 ? c.red : c.yellow;
        const note = ch.note ? `: ${ch.note}` : "";
        console.log(`       ${col}quality [${pct}%] ${ch.label}${note}${c.reset}`);
      }
    }
    console.log("");
  }

  // ── Summary ──

  console.log(`${c.bold}${c.white}${sep}${c.reset}`);
  console.log(`${c.bold}  SUMMARY${c.reset}\n`);

  const total   = results.length;
  const passed  = results.filter((r) => r.passed).length;
  const allFrames = results.flatMap((r) => r.frames);
  const parseErrors = allFrames.filter((f) => f.parseError).length;
  const validErrors = allFrames.filter((f) => !f.parseError && f.validation && !f.validation.valid).length;
  const warnings    = allFrames.reduce((s, f) => s + (f.validation?.warnings.length ?? 0), 0);
  const avgQuality  = results.length > 0
    ? Math.round(results.reduce((s, r) => s + r.avgQuality, 0) / results.length)
    : 0;

  console.log(`  Scenarios  : ${passed}/${total} passed  (${total - passed} failed)`);
  console.log(`  Frames     : ${allFrames.length} total`);
  console.log(`  Parse errs : ${parseErrors}`);
  console.log(`  Valid errs : ${validErrors}`);
  console.log(`  Warnings   : ${warnings}`);
  console.log(`  Avg quality: ${scoreBar(avgQuality)} ${avgQuality}%`);

  // Per-style
  const styleStats: Record<string, { pass: number; total: number; quality: number[] }> = {};
  for (const r of results) {
    const s = r.scenario.style;
    if (!styleStats[s]) styleStats[s] = { pass: 0, total: 0, quality: [] };
    styleStats[s].total++;
    if (r.passed) styleStats[s].pass++;
    styleStats[s].quality.push(r.avgQuality);
  }

  console.log(`\n  ${c.bold}By style:${c.reset}`);
  for (const [style, stats] of Object.entries(styleStats)) {
    const pct    = Math.round((stats.pass / stats.total) * 100);
    const avgQ   = Math.round(stats.quality.reduce((a, b) => a + b, 0) / stats.quality.length);
    const pBar   = scoreBar(pct);
    const col    = pct === 100 ? c.green : pct >= 50 ? c.yellow : c.red;
    console.log(`    ${pBar}  ${style.padEnd(12)} pass ${col}${stats.pass}/${stats.total}${c.reset}  quality ${scoreBar(avgQ)} ${avgQ}%`);
  }

  // Top quality issues across all frames
  const issueCounts: Record<string, number> = {};
  for (const f of allFrames) {
    for (const ch of f.quality?.checks ?? []) {
      if (ch.score < ch.max) {
        issueCounts[ch.label] = (issueCounts[ch.label] ?? 0) + 1;
      }
    }
  }
  const topIssues = Object.entries(issueCounts).sort((a, b) => b[1] - a[1]).slice(0, 8);
  if (topIssues.length > 0) {
    console.log(`\n  ${c.bold}Most common quality gaps:${c.reset}`);
    for (const [label, count] of topIssues) {
      const col = count >= allFrames.length * 0.5 ? c.red : c.yellow;
      console.log(`    ${col}${count}x${c.reset}  ${label}`);
    }
  }

  const avgMs = allFrames.length > 0
    ? allFrames.reduce((s, f) => s + f.durationMs, 0) / allFrames.length
    : 0;
  console.log(`\n  Avg frame time: ${avgMs.toFixed(0)}ms`);

  const overall = passed === total
    ? `${c.green}${c.bold}ALL PASSED${c.reset}`
    : `${c.red}${c.bold}${total - passed} SCENARIO(S) FAILED${c.reset}`;
  console.log(`\n  ${overall}`);
  console.log(`\n${c.bold}${c.white}${sep}${c.reset}\n`);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const client = new Anthropic({ apiKey: API_KEY });
  const totalFrames = SCENARIOS.reduce((s, sc) => s + sc.prompts.length, 0);

  console.log(`\n${c.bold}${c.cyan}Art of Prompt — Swarm Test${c.reset}`);
  console.log(info(`${SCENARIOS.length} scenarios · ${totalFrames} frames · concurrency=${CONCURRENCY} · model=${MODEL}\n`));

  const tasks = SCENARIOS.map((scenario) => () => runScenario(client, scenario));
  let completed = 0;

  const results = await runWithConcurrency<ScenarioResult>(tasks, CONCURRENCY, (result) => {
    completed++;
    const status = result.passed ? c.green + "✓" : c.red + "✗";
    const q      = `${scoreBar(result.avgQuality)} ${result.avgQuality}%`;
    console.log(
      `${status}${c.reset} [${completed}/${SCENARIOS.length}] ${result.scenario.name}  ${q}` +
      `  ${c.dim}(${result.frames.length} frame${result.frames.length !== 1 ? "s" : ""}, ${(result.totalMs / 1000).toFixed(1)}s)${c.reset}`
    );
  });

  printReport(results);
  process.exit(results.some((r) => !r.passed) ? 1 : 0);
}

main().catch((err) => {
  console.error(`${c.red}Fatal:${c.reset}`, err);
  process.exit(1);
});
