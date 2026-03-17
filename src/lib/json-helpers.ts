/** Extracts the first complete {...} object by tracking brace depth.
 *  Stops exactly at the closing brace, ignoring any trailing prose. */
export function extractBalancedJSON(text: string): string | null {
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
export function sanitizeJSONControlChars(json: string): string {
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
        continue;
      }
    }
    out += ch;
  }
  return out;
}

/** Strips a markdown code fence (```json ... ```) wrapping the entire response. */
export function stripCodeFence(text: string): string {
  const t = text.trim();
  if (!t.startsWith("```")) return t;
  const firstNl = t.indexOf("\n");
  if (firstNl === -1) return t;
  const inner = t.slice(firstNl + 1);
  const lastFence = inner.lastIndexOf("\n```");
  return lastFence !== -1 ? inner.slice(0, lastFence).trim() : inner.trim();
}

/** Attempts to parse a Claude JSON response through multiple fallback strategies. */
export function parseClaudeJSON(jsonStr: string): {
  html: string;
  acknowledgment: string;
  suggestions?: string[];
} {
  const stripped = stripCodeFence(jsonStr);

  // Strategy 1: Direct parse (try both original and stripped)
  for (const candidate of [jsonStr, stripped]) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed.html && parsed.acknowledgment) return parsed;
    } catch { /* fall through */ }
  }

  // Strategy 2: Sanitize control chars (try both)
  for (const candidate of [jsonStr, stripped]) {
    try {
      const parsed = JSON.parse(sanitizeJSONControlChars(candidate));
      if (parsed.html && parsed.acknowledgment) return parsed;
    } catch { /* fall through */ }
  }

  // Strategy 3: Field-order-independent regex extraction.
  // Captures up to the next field boundary — handles any ordering of fields.
  const unescape = (s: string) =>
    s.replace(/\\n/g, "\n").replace(/\\r/g, "\r").replace(/\\t/g, "\t")
     .replace(/\\"/g, '"').replace(/\\\\/g, "\\");

  const extractField = (src: string, name: string): string | null => {
    const re = new RegExp(`"${name}"\\s*:\\s*"((?:[^"\\\\]|\\\\[\\s\\S])*)"`, "s");
    const m = src.match(re);
    return m ? unescape(m[1]) : null;
  };

  const extractArray = (src: string, name: string): string[] | null => {
    const re = new RegExp(`"${name}"\\s*:\\s*(\\[[\\s\\S]*?\\])`, "s");
    const m = src.match(re);
    if (!m) return null;
    try { return JSON.parse(m[1]); } catch { return null; }
  };

  const src = stripped.length < jsonStr.length ? stripped : jsonStr;
  const htmlVal = extractField(src, "html");
  const ackVal = extractField(src, "acknowledgment");
  if (htmlVal && ackVal) {
    return {
      html: htmlVal,
      acknowledgment: ackVal,
      suggestions: extractArray(jsonStr, "suggestions") ?? undefined,
    };
  }

  throw new Error("Claude returned malformed JSON. Try again.");
}
