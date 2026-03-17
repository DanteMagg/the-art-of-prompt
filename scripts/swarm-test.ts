/**
 * Swarm test runner — simulates multiple sessions with varied prompts/styles,
 * validates each frame response, and reports categorized errors.
 *
 * Usage:
 *   API_KEY=<your-key> npx tsx scripts/swarm-test.ts
 *   API_KEY=<key> CONCURRENCY=4 npx tsx scripts/swarm-test.ts
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

const ok = (s: string) => `${c.green}✓${c.reset} ${s}`;
const fail = (s: string) => `${c.red}✗${c.reset} ${s}`;
const warn = (s: string) => `${c.yellow}⚠${c.reset} ${s}`;
const info = (s: string) => `${c.cyan}·${c.reset} ${s}`;

// ── Test Scenarios ────────────────────────────────────────────────────────────

interface Scenario {
  name: string;
  style: StyleId;
  prompts: string[];
}

const SCENARIOS: Scenario[] = [
  // Default style
  {
    name: "default / particles",
    style: "default",
    prompts: ["a field of floating particles that breathe slowly"],
  },
  {
    name: "default / geometric grid",
    style: "default",
    prompts: ["a minimal grid of squares that pulse in a wave pattern"],
  },
  {
    name: "default / organic flow",
    style: "default",
    prompts: ["flowing sine wave ribbons in soft cream and charcoal"],
  },
  {
    name: "default / multi-turn evolution",
    style: "default",
    prompts: [
      "a single glowing dot at the center",
      "expand it into a ring of dots",
      "make the ring slowly rotate",
    ],
  },

  // Pixel style
  {
    name: "pixel / sprite scene",
    style: "pixel",
    prompts: ["a pixel art forest with a small campfire"],
  },
  {
    name: "pixel / retro landscape",
    style: "pixel",
    prompts: ["a scrolling pixel art starfield with a tiny rocket ship"],
  },
  {
    name: "pixel / character",
    style: "pixel",
    prompts: ["a pixel art character walking in place"],
  },

  // Geometric style
  {
    name: "geometric / tessellation",
    style: "geometric",
    prompts: ["a Mondrian-style grid of colored rectangles that slowly shift hues"],
  },
  {
    name: "geometric / sacred geometry",
    style: "geometric",
    prompts: ["a flower of life pattern slowly rotating"],
  },
  {
    name: "geometric / bauhaus",
    style: "geometric",
    prompts: ["a Bauhaus composition with bold primary circles and lines in motion"],
  },

  // Organic style
  {
    name: "organic / bioluminescence",
    style: "organic",
    prompts: ["glowing bioluminescent jellyfish drifting upward"],
  },
  {
    name: "organic / coral growth",
    style: "organic",
    prompts: ["a coral reef slowly growing from the bottom"],
  },
  {
    name: "organic / flowing water",
    style: "organic",
    prompts: ["a gentle river with caustic light patterns on the bottom"],
  },

  // Brutalist style
  {
    name: "brutalist / glitch",
    style: "brutalist",
    prompts: ["a glitch art piece with harsh horizontal scan lines shifting"],
  },
  {
    name: "brutalist / concrete",
    style: "brutalist",
    prompts: ["bold black-and-white geometric blocks crashing together"],
  },

  // Neon style
  {
    name: "neon / synthwave grid",
    style: "neon",
    prompts: ["a synthwave perspective grid with neon pink horizon glow"],
  },
  {
    name: "neon / cyberpunk rain",
    style: "neon",
    prompts: ["neon rain falling in a dark cyberpunk city silhouette"],
  },
  {
    name: "neon / circuit trace",
    style: "neon",
    prompts: ["glowing circuit traces growing across a dark background"],
  },

  // Cross-style edge cases
  {
    name: "default / 3D sphere (3D math required)",
    style: "default",
    prompts: ["a 3D sphere rotating with realistic lighting"],
  },
  {
    name: "default / 3D cube (polygon mesh)",
    style: "default",
    prompts: ["a slowly rotating 3D cube with distinct colored faces"],
  },
  {
    name: "default / physics bouncing",
    style: "default",
    prompts: ["colored balls bouncing with realistic gravity and floor collisions"],
  },
  {
    name: "default / particle text",
    style: "default",
    prompts: ["particles that form the word HELLO with at least 500 particles"],
  },
  {
    name: "default / fire smoke",
    style: "default",
    prompts: ["a candle flame with rising smoke particles"],
  },
  {
    name: "default / tree growth",
    style: "default",
    prompts: ["a recursive tree growing from the bottom center with swaying branches"],
  },
  {
    name: "geometric / fractal",
    style: "geometric",
    prompts: ["a Sierpinski triangle fractal drawn with L-system turtle graphics"],
  },
  {
    name: "organic / water ripples",
    style: "organic",
    prompts: ["a water surface with expanding ripple rings when touched"],
  },
];

// ── Validation ────────────────────────────────────────────────────────────────

interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  metrics: {
    htmlSizeKB: number;
    hasCanvas: boolean;
    hasSVG: boolean;
    hasScript: boolean;
    hasExternalDeps: boolean;
    hasPromptUI: boolean;
    hasViewportMeta: boolean;
    hasRAF: boolean;
    hasTryCatch: boolean;
    hasDarkBg: boolean;
  };
}

function validateFrame(html: string, acknowledgment: string, promptText: string): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const htmlSizeKB = Buffer.byteLength(html, "utf8") / 1024;

  const hasCanvas = /<canvas/i.test(html);
  const hasSVG = /<svg/i.test(html);
  const hasScript = /<script/i.test(html);
  const hasExternalDeps = /src=["']https?:\/\//i.test(html) || /href=["']https?:\/\//i.test(html);
  const hasPromptUI =
    /<input/i.test(html) ||
    (/<button/i.test(html) && !/button.*type=["']submit["']/i.test(html) && /<button/i.test(html));
  const hasViewportMeta = /name=["']viewport["']/i.test(html);
  const hasRAF = /requestAnimationFrame/i.test(html);
  const hasTryCatch = /try\s*\{/.test(html);

  // Dark background check (for non-neon styles, a dark bg is a potential violation)
  const darkBgPatterns = [
    /background(?:-color)?:\s*(?:#0{3,6}|#1[0-9a-f]{5}|rgb\(0,\s*0,\s*0\)|black)/i,
    /body\s*\{[^}]*background(?:-color)?:\s*#(?:0[0-9a-f]|1[0-9a-f])/i,
  ];
  const hasDarkBg = darkBgPatterns.some((p) => p.test(html));

  // Hard errors
  if (!html || html.length < 100) {
    errors.push("html field is empty or too short");
  }
  if (!acknowledgment || acknowledgment.trim().length < 5) {
    errors.push("acknowledgment field is missing or too short");
  }
  if (htmlSizeKB > 60) {
    errors.push(`html too large: ${htmlSizeKB.toFixed(1)}KB (max 50KB soft limit)`);
  }
  if (hasExternalDeps) {
    errors.push("html contains external dependencies (CDN src/href)");
  }
  if (!/<html/i.test(html) && !/<body/i.test(html)) {
    errors.push("html missing <html> or <body> tags — may be a partial snippet");
  }

  // Warnings (violations of system prompt rules but not parse failures)
  if (!hasViewportMeta) {
    warnings.push("missing viewport meta tag");
  }
  if (hasScript && !hasRAF && (hasCanvas || hasSVG)) {
    warnings.push("no requestAnimationFrame detected — animation may not loop");
  }
  if (hasScript && !hasTryCatch) {
    warnings.push("no try/catch detected — animation may crash on error");
  }
  if (hasPromptUI) {
    warnings.push("detected <input> or unexpected <button> — may violate no-UI rule");
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    metrics: {
      htmlSizeKB,
      hasCanvas,
      hasSVG,
      hasScript,
      hasExternalDeps,
      hasPromptUI,
      hasViewportMeta,
      hasRAF,
      hasTryCatch,
      hasDarkBg,
    },
  };
}

// ── JSON parsing (mirrors app logic) ─────────────────────────────────────────

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

interface ParsedFrame {
  html: string;
  acknowledgment: string;
  suggestions?: string[];
}

function parseResponse(raw: string): ParsedFrame {
  // Strategy 1: direct
  try {
    const p = JSON.parse(raw);
    if (p.html && p.acknowledgment) return p;
  } catch { /* fall through */ }

  // Strategy 2: extract balanced JSON first, then sanitize
  const extracted = extractBalancedJSON(raw);
  if (extracted) {
    try {
      const p = JSON.parse(extracted);
      if (p.html && p.acknowledgment) return p;
    } catch { /* fall through */ }
    try {
      const p = JSON.parse(sanitizeJSONControlChars(extracted));
      if (p.html && p.acknowledgment) return p;
    } catch { /* fall through */ }
  }

  throw new Error(`JSON parse failed. Raw starts with: ${raw.slice(0, 200)}`);
}

// ── Single frame runner ───────────────────────────────────────────────────────

interface FrameResult {
  promptIndex: number;
  prompt: string;
  durationMs: number;
  ok: boolean;
  parseError?: string;
  validation?: ValidationResult;
  acknowledgment?: string;
}

async function runFrame(
  client: Anthropic,
  systemPrompt: string,
  messages: Anthropic.Messages.MessageParam[],
  prompt: string,
  frameIndex: number
): Promise<{ result: FrameResult; updatedMessages: Anthropic.Messages.MessageParam[] }> {
  const newMessages: Anthropic.Messages.MessageParam[] = [
    ...messages,
    { role: "user", content: prompt },
  ];

  const start = Date.now();
  let raw = "";

  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 8000,
      system: systemPrompt,
      messages: newMessages,
    });

    raw = response.content
      .filter((b): b is Anthropic.Messages.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");

    const parsed = parseResponse(raw);
    const validation = validateFrame(parsed.html, parsed.acknowledgment, prompt);

    const durationMs = Date.now() - start;

    // Append assistant turn for next frame
    const nextMessages: Anthropic.Messages.MessageParam[] = [
      ...newMessages,
      { role: "assistant", content: raw },
    ];

    return {
      result: {
        promptIndex: frameIndex,
        prompt,
        durationMs,
        ok: validation.valid,
        validation,
        acknowledgment: parsed.acknowledgment,
      },
      updatedMessages: nextMessages,
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
}

async function runScenario(
  client: Anthropic,
  scenario: Scenario
): Promise<ScenarioResult> {
  const systemPrompt = buildSystemPrompt(scenario.style);
  let messages: Anthropic.Messages.MessageParam[] = [];
  const frames: FrameResult[] = [];
  const start = Date.now();

  for (let i = 0; i < scenario.prompts.length; i++) {
    const prompt = scenario.prompts[i];
    const { result, updatedMessages } = await runFrame(
      client,
      systemPrompt,
      messages,
      prompt,
      i
    );
    messages = updatedMessages;
    frames.push(result);

    // If first frame fails badly (parse error), skip remaining frames
    if (result.parseError && i === 0) break;
  }

  const passed = frames.every((f) => f.ok);
  return {
    scenario,
    frames,
    totalMs: Date.now() - start,
    passed,
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
      const result = await tasks[idx]();
      results[idx] = result;
      onComplete(result, idx);
    }
  }

  await Promise.all(Array.from({ length: limit }, () => worker()));
  return results;
}

// ── Report ────────────────────────────────────────────────────────────────────

function printReport(results: ScenarioResult[]) {
  const sep = "─".repeat(70);

  console.log(`\n${c.bold}${c.white}${sep}${c.reset}`);
  console.log(`${c.bold}  SWARM TEST REPORT${c.reset}`);
  console.log(`${c.bold}${c.white}${sep}${c.reset}\n`);

  // Per-scenario details
  for (const r of results) {
    const status = r.passed
      ? `${c.green}PASS${c.reset}`
      : `${c.red}FAIL${c.reset}`;
    const time = `${c.dim}(${(r.totalMs / 1000).toFixed(1)}s)${c.reset}`;
    console.log(`${status}  ${c.bold}${r.scenario.name}${c.reset}  ${time}`);

    for (const f of r.frames) {
      const pIdx = `[frame ${f.promptIndex + 1}/${r.scenario.prompts.length}]`;
      if (f.parseError) {
        console.log(`   ${fail(`${pIdx} PARSE ERROR`)}`);
        console.log(`       ${c.red}${f.parseError.slice(0, 120)}${c.reset}`);
      } else if (f.validation) {
        const vStatus = f.validation.valid ? ok(pIdx) : fail(pIdx);
        const size = `${f.validation.metrics.htmlSizeKB.toFixed(1)}KB`;
        const dur = `${f.durationMs}ms`;
        const ack = f.acknowledgment ? ` "${f.acknowledgment.slice(0, 60)}"` : "";
        console.log(`   ${vStatus}  ${c.dim}${size}  ${dur}${ack}${c.reset}`);
        for (const e of f.validation.errors) {
          console.log(`       ${c.red}error: ${e}${c.reset}`);
        }
        for (const w of f.validation.warnings) {
          console.log(`       ${c.yellow}warn: ${w}${c.reset}`);
        }
      }
    }
    console.log("");
  }

  // Summary stats
  console.log(`${c.bold}${c.white}${sep}${c.reset}`);
  console.log(`${c.bold}  SUMMARY${c.reset}\n`);

  const total = results.length;
  const passed = results.filter((r) => r.passed).length;
  const failed = total - passed;

  const allFrames = results.flatMap((r) => r.frames);
  const totalFrames = allFrames.length;
  const parseErrors = allFrames.filter((f) => f.parseError).length;
  const validationErrors = allFrames.filter(
    (f) => !f.parseError && f.validation && !f.validation.valid
  ).length;
  const warnings = allFrames.reduce(
    (sum, f) => sum + (f.validation?.warnings.length ?? 0),
    0
  );

  // Error category breakdown
  const allErrors: Record<string, number> = {};
  for (const f of allFrames) {
    for (const e of f.validation?.errors ?? []) {
      const key = e.split(":")[0].trim();
      allErrors[key] = (allErrors[key] ?? 0) + 1;
    }
  }

  console.log(`  Scenarios  : ${passed}/${total} passed  (${failed} failed)`);
  console.log(`  Frames     : ${totalFrames} total`);
  console.log(`  Parse errs : ${parseErrors}`);
  console.log(`  Valid errs : ${validationErrors}`);
  console.log(`  Warnings   : ${warnings}`);

  if (Object.keys(allErrors).length > 0) {
    console.log(`\n  ${c.bold}Error categories:${c.reset}`);
    for (const [cat, count] of Object.entries(allErrors).sort((a, b) => b[1] - a[1])) {
      console.log(`    ${c.red}${count}x${c.reset}  ${cat}`);
    }
  }

  // Per-style pass rate
  const styleStats: Record<string, { pass: number; total: number }> = {};
  for (const r of results) {
    const s = r.scenario.style;
    if (!styleStats[s]) styleStats[s] = { pass: 0, total: 0 };
    styleStats[s].total++;
    if (r.passed) styleStats[s].pass++;
  }

  console.log(`\n  ${c.bold}Pass rate by style:${c.reset}`);
  for (const [style, stats] of Object.entries(styleStats)) {
    const pct = Math.round((stats.pass / stats.total) * 100);
    const bar = `${"█".repeat(Math.round(pct / 10))}${"░".repeat(10 - Math.round(pct / 10))}`;
    const col = pct === 100 ? c.green : pct >= 50 ? c.yellow : c.red;
    console.log(`    ${col}${bar}${c.reset}  ${style.padEnd(12)} ${stats.pass}/${stats.total} (${pct}%)`);
  }

  const avgMs =
    allFrames.reduce((s, f) => s + f.durationMs, 0) / (allFrames.length || 1);
  console.log(`\n  Avg frame time: ${avgMs.toFixed(0)}ms`);

  const overall = failed === 0 ? `${c.green}${c.bold}ALL PASSED${c.reset}` : `${c.red}${c.bold}${failed} SCENARIO(S) FAILED${c.reset}`;
  console.log(`\n  ${overall}`);
  console.log(`\n${c.bold}${c.white}${sep}${c.reset}\n`);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const client = new Anthropic({ apiKey: API_KEY });

  console.log(`\n${c.bold}${c.cyan}Art of Prompt — Swarm Test${c.reset}`);
  console.log(
    info(
      `Running ${SCENARIOS.length} scenarios with concurrency=${CONCURRENCY} via model=${MODEL}`
    )
  );
  console.log(info(`${SCENARIOS.reduce((s, sc) => s + sc.prompts.length, 0)} total frames\n`));

  const tasks = SCENARIOS.map((scenario) => () => runScenario(client, scenario));

  let completed = 0;
  const results = await runWithConcurrency<ScenarioResult>(
    tasks,
    CONCURRENCY,
    (result, index) => {
      completed++;
      const status = result.passed ? c.green + "✓" : c.red + "✗";
      const frameCount = result.frames.length;
      console.log(
        `${status}${c.reset} [${completed}/${SCENARIOS.length}] ${result.scenario.name}` +
          `  ${c.dim}(${frameCount} frame${frameCount !== 1 ? "s" : ""}, ${(result.totalMs / 1000).toFixed(1)}s)${c.reset}`
      );
    }
  );

  printReport(results);

  const anyFailed = results.some((r) => !r.passed);
  process.exit(anyFailed ? 1 : 0);
}

main().catch((err) => {
  console.error(`${c.red}Fatal error:${c.reset}`, err);
  process.exit(1);
});
