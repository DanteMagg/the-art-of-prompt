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

/** Attempts to parse a Claude JSON response through multiple fallback strategies. */
export function parseClaudeJSON(jsonStr: string): {
  html: string;
  acknowledgment: string;
  suggestions?: string[];
} {
  // Strategy 1: Direct parse
  try {
    const parsed = JSON.parse(jsonStr);
    if (parsed.html && parsed.acknowledgment) return parsed;
  } catch { /* fall through */ }

  // Strategy 2: Sanitize control chars
  try {
    const parsed = JSON.parse(sanitizeJSONControlChars(jsonStr));
    if (parsed.html && parsed.acknowledgment) return parsed;
  } catch { /* fall through */ }

  // Strategy 3: Regex extraction
  const htmlMatch = jsonStr.match(/"html"\s*:\s*"([\s\S]*?)"\s*,\s*"acknowledgment"/);
  const ackMatch = jsonStr.match(/"acknowledgment"\s*:\s*"([\s\S]*?)"\s*[,}]/);
  if (htmlMatch?.[1] && ackMatch?.[1]) {
    return {
      html: htmlMatch[1].replace(/\\n/g, "\n").replace(/\\"/g, '"').replace(/\\\\/g, "\\"),
      acknowledgment: ackMatch[1].replace(/\\n/g, "\n").replace(/\\"/g, '"'),
    };
  }

  throw new Error("Claude returned malformed JSON. Try again.");
}
