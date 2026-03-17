import { describe, it, expect } from "vitest";
import { TEMPLATES, resolveTemplate } from "@/lib/templates";

describe("TEMPLATES", () => {
  it("has at least 5 templates including blank", () => {
    expect(TEMPLATES.length).toBeGreaterThanOrEqual(5);
    expect(TEMPLATES.find((t) => t.id === "blank")).toBeDefined();
  });

  it("blank template has empty html", () => {
    const blank = TEMPLATES.find((t) => t.id === "blank")!;
    expect(blank.html).toBe("");
  });

  it("non-blank templates have valid HTML", () => {
    for (const t of TEMPLATES.filter((t) => t.id !== "blank")) {
      expect(t.html.length).toBeGreaterThan(100);
      expect(t.html).toContain("<!DOCTYPE html>");
      expect(t.html).toContain("<canvas");
      expect(t.html).toContain("</script>");
    }
  });

  it("every non-blank template has all 5 style variants", () => {
    const styles = ["pixel", "geometric", "organic", "brutalist", "neon"];
    for (const t of TEMPLATES.filter((t) => t.id !== "blank")) {
      for (const style of styles) {
        expect(t.variants?.[style], `${t.id} missing variant ${style}`).toBeDefined();
        expect(t.variants![style].length).toBeGreaterThan(100);
      }
    }
  });
});

describe("resolveTemplate", () => {
  const particles = TEMPLATES.find((t) => t.id === "particles")!;

  it("returns default html for default style", () => {
    const resolved = resolveTemplate(particles, "default");
    expect(resolved.html).toBe(particles.html);
  });

  it("returns variant html for non-default style", () => {
    const resolved = resolveTemplate(particles, "neon");
    expect(resolved.html).not.toBe(particles.html);
    expect(resolved.html).toContain("#0a0a14"); // neon dark bg
  });

  it("returns default html for unknown style", () => {
    const resolved = resolveTemplate(particles, "nonexistent");
    expect(resolved.html).toBe(particles.html);
  });

  it("blank template stays blank regardless of style", () => {
    const blank = TEMPLATES.find((t) => t.id === "blank")!;
    expect(resolveTemplate(blank, "neon").html).toBe("");
    expect(resolveTemplate(blank, "pixel").html).toBe("");
  });

  it("pixel variants use pixelated rendering", () => {
    for (const t of TEMPLATES.filter((t) => t.id !== "blank")) {
      const resolved = resolveTemplate(t, "pixel");
      expect(resolved.html).toContain("image-rendering:pixelated");
    }
  });

  it("neon variants have dark backgrounds", () => {
    for (const t of TEMPLATES.filter((t) => t.id !== "blank")) {
      const resolved = resolveTemplate(t, "neon");
      expect(resolved.html).toContain("#0a0a14");
    }
  });

  it("brutalist variants use black and white", () => {
    for (const t of TEMPLATES.filter((t) => t.id !== "blank")) {
      const resolved = resolveTemplate(t, "brutalist");
      expect(resolved.html).toContain("#fff");
      expect(resolved.html).toContain("#000");
    }
  });

  it("all variant HTMLs are valid (have doctype, script, canvas)", () => {
    const styles = ["pixel", "geometric", "organic", "brutalist", "neon"];
    for (const t of TEMPLATES.filter((t) => t.id !== "blank")) {
      for (const style of styles) {
        const resolved = resolveTemplate(t, style);
        expect(resolved.html, `${t.id}/${style}: missing doctype`).toContain("<!DOCTYPE html>");
        expect(resolved.html, `${t.id}/${style}: missing script`).toContain("<script>");
      }
    }
  });
});
