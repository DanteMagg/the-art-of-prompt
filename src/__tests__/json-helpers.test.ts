import { describe, it, expect } from "vitest";
import {
  extractBalancedJSON,
  sanitizeJSONControlChars,
  parseClaudeJSON,
} from "@/lib/json-helpers";

// ── extractBalancedJSON ──

describe("extractBalancedJSON", () => {
  it("extracts a simple JSON object", () => {
    const result = extractBalancedJSON('{"a": 1}');
    expect(result).toBe('{"a": 1}');
  });

  it("ignores leading text", () => {
    const result = extractBalancedJSON('Here is the JSON: {"html": "test"}');
    expect(result).toBe('{"html": "test"}');
  });

  it("ignores trailing text", () => {
    const result = extractBalancedJSON('{"html": "test"} Hope this helps!');
    expect(result).toBe('{"html": "test"}');
  });

  it("handles nested braces in strings", () => {
    const input = '{"html": "<div style=\\"{color: red}\\">hi</div>"}';
    const result = extractBalancedJSON(input);
    expect(result).toBe(input);
  });

  it("handles nested objects", () => {
    const input = '{"a": {"b": {"c": 1}}}';
    expect(extractBalancedJSON(input)).toBe(input);
  });

  it("returns null for no braces", () => {
    expect(extractBalancedJSON("no json here")).toBeNull();
  });

  it("returns null for unclosed brace", () => {
    expect(extractBalancedJSON('{"html": "test"')).toBeNull();
  });

  it("handles escaped quotes in strings", () => {
    const input = '{"html": "she said \\"hello\\""}';
    expect(extractBalancedJSON(input)).toBe(input);
  });

  it("handles escaped backslashes", () => {
    const input = '{"html": "path\\\\to\\\\file"}';
    expect(extractBalancedJSON(input)).toBe(input);
  });

  it("stops at first complete object", () => {
    const input = '{"a": 1} {"b": 2}';
    expect(extractBalancedJSON(input)).toBe('{"a": 1}');
  });

  it("handles code fence wrapping", () => {
    const input = '```json\n{"html": "<p>hi</p>", "acknowledgment": "done"}\n```';
    // After stripping code fences (done by caller), we get:
    const stripped = input.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```\s*$/, "");
    expect(extractBalancedJSON(stripped)).toBe('{"html": "<p>hi</p>", "acknowledgment": "done"}');
  });

  it("handles HTML with curly braces inside strings", () => {
    const html = '<style>body{margin:0}</style><script>if(true){console.log("hi")}</script>';
    const input = `{"html": "${html.replace(/"/g, '\\"')}", "acknowledgment": "ok"}`;
    const result = extractBalancedJSON(input);
    expect(result).not.toBeNull();
    const parsed = JSON.parse(result!);
    expect(parsed.html).toContain("body{margin:0}");
  });
});

// ── sanitizeJSONControlChars ──

describe("sanitizeJSONControlChars", () => {
  it("escapes literal newlines in strings", () => {
    const input = '{"a": "line1\nline2"}';
    const result = sanitizeJSONControlChars(input);
    expect(() => JSON.parse(result)).not.toThrow();
    expect(JSON.parse(result).a).toBe("line1\nline2");
  });

  it("escapes literal tabs in strings", () => {
    const input = '{"a": "col1\tcol2"}';
    const result = sanitizeJSONControlChars(input);
    expect(() => JSON.parse(result)).not.toThrow();
  });

  it("escapes carriage returns", () => {
    const input = '{"a": "win\r\nline"}';
    const result = sanitizeJSONControlChars(input);
    expect(() => JSON.parse(result)).not.toThrow();
  });

  it("leaves already-escaped sequences alone", () => {
    const input = '{"a": "already\\nescaped"}';
    const result = sanitizeJSONControlChars(input);
    expect(JSON.parse(result).a).toBe("already\nescaped");
  });

  it("does not modify text outside strings", () => {
    const input = '{\n  "a": "b"\n}';
    const result = sanitizeJSONControlChars(input);
    expect(JSON.parse(result).a).toBe("b");
  });
});

// ── parseClaudeJSON ──

describe("parseClaudeJSON", () => {
  it("parses well-formed JSON", () => {
    const input = JSON.stringify({
      html: "<html><body>Hello</body></html>",
      acknowledgment: "Frame 001",
      suggestions: ["Add color", "Make bigger"],
    });
    const result = parseClaudeJSON(input);
    expect(result.html).toContain("Hello");
    expect(result.acknowledgment).toBe("Frame 001");
    expect(result.suggestions).toEqual(["Add color", "Make bigger"]);
  });

  it("parses JSON with control chars via sanitization", () => {
    // Simulate Claude putting a literal newline inside a string
    const input = '{"html": "<html>\n<body>hi</body>\n</html>", "acknowledgment": "ok"}';
    const result = parseClaudeJSON(input);
    expect(result.html).toContain("<body>hi</body>");
    expect(result.acknowledgment).toBe("ok");
  });

  it("falls back to regex extraction for badly malformed JSON", () => {
    // JSON with unescaped quotes inside HTML that break parsing
    const input = '{"html": "<div attr="val">content</div>", "acknowledgment": "Frame 005"}';
    // This will fail JSON.parse and sanitize, but regex should catch it
    const result = parseClaudeJSON(input);
    expect(result.acknowledgment).toBe("Frame 005");
  });

  it("throws on completely unparseable input", () => {
    expect(() => parseClaudeJSON("not json at all")).toThrow("malformed JSON");
  });

  it("throws when html is missing", () => {
    const input = JSON.stringify({ acknowledgment: "ok" });
    expect(() => parseClaudeJSON(input)).toThrow();
  });

  it("throws when acknowledgment is missing", () => {
    const input = JSON.stringify({ html: "<p>hi</p>" });
    expect(() => parseClaudeJSON(input)).toThrow();
  });

  it("handles HTML with template literals and backticks", () => {
    const html = "<!DOCTYPE html><html><body><script>const x = `hello ${1+1}`;</script></body></html>";
    const input = JSON.stringify({
      html,
      acknowledgment: "Frame with template literals",
      suggestions: ["More code"],
    });
    const result = parseClaudeJSON(input);
    expect(result.html).toContain("hello ${1+1}");
  });

  it("handles very large HTML", () => {
    const bigHtml = "<html><body>" + "x".repeat(100_000) + "</body></html>";
    const input = JSON.stringify({
      html: bigHtml,
      acknowledgment: "Big frame",
    });
    const result = parseClaudeJSON(input);
    expect(result.html.length).toBeGreaterThan(100_000);
  });

  it("handles HTML with all kinds of special characters", () => {
    const html = `<html><body><script>
      const obj = {"key": "value"};
      const arr = [1, 2, 3];
      const str = 'single "quotes"';
      const regex = /test\\/g;
    </script></body></html>`;
    const input = JSON.stringify({
      html,
      acknowledgment: "Special chars",
    });
    const result = parseClaudeJSON(input);
    expect(result.html).toContain("const obj");
  });

  it("handles suggestions being absent", () => {
    const input = JSON.stringify({
      html: "<p>hi</p>",
      acknowledgment: "ok",
    });
    const result = parseClaudeJSON(input);
    expect(result.suggestions).toBeUndefined();
  });
});
