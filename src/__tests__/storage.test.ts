import { describe, it, expect, beforeEach } from "vitest";
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
  migrateFromLocalStorage,
  migrateFromSessionStorage,
  clearLegacyStorage,
  type Frame,
  type SessionData,
} from "@/lib/storage";

function makeFrame(n: number, html = `<html><body>Frame ${n}</body></html>`): Frame {
  return {
    number: n,
    promptText: `Prompt for frame ${n}`,
    html,
    acknowledgment: `Ack ${n}`,
    suggestions: [`suggestion ${n}a`, `suggestion ${n}b`],
    createdAt: Date.now() + n,
  };
}

function makeSession(frameCount: number, title = "Test Session"): SessionData {
  return {
    title,
    style: "default",
    frames: Array.from({ length: frameCount }, (_, i) => makeFrame(i + 1)),
  };
}

beforeEach(async () => {
  // Clear IDB between tests
  const dbs = await indexedDB.databases();
  for (const db of dbs) {
    if (db.name) indexedDB.deleteDatabase(db.name);
  }
  localStorage.clear();
  sessionStorage.clear();
});

// ── Full write/read cycle ──

describe("saveSession / loadSession", () => {
  it("roundtrips a session with multiple frames", async () => {
    const session = makeSession(5);
    await saveSession(session);
    const loaded = await loadSession();
    expect(loaded).not.toBeNull();
    expect(loaded!.title).toBe("Test Session");
    expect(loaded!.style).toBe("default");
    expect(loaded!.frames).toHaveLength(5);
    for (let i = 0; i < 5; i++) {
      expect(loaded!.frames[i].number).toBe(i + 1);
      expect(loaded!.frames[i].html).toContain(`Frame ${i + 1}`);
      expect(loaded!.frames[i].promptText).toBe(`Prompt for frame ${i + 1}`);
      expect(loaded!.frames[i].acknowledgment).toBe(`Ack ${i + 1}`);
      expect(loaded!.frames[i].suggestions).toEqual([
        `suggestion ${i + 1}a`,
        `suggestion ${i + 1}b`,
      ]);
    }
  });

  it("returns null when no session exists", async () => {
    const loaded = await loadSession();
    expect(loaded).toBeNull();
  });

  it("overwrites previous session", async () => {
    await saveSession(makeSession(3, "First"));
    await saveSession(makeSession(2, "Second"));
    const loaded = await loadSession();
    expect(loaded!.title).toBe("Second");
    expect(loaded!.frames).toHaveLength(2);
  });
});

// ── Autosave ──

describe("saveAutosave / loadAutosave", () => {
  it("session and autosave are independent", async () => {
    await saveSession(makeSession(3, "Session"));
    await saveAutosave(makeSession(5, "Autosave"));

    const sess = await loadSession();
    const auto = await loadAutosave();
    expect(sess!.title).toBe("Session");
    expect(sess!.frames).toHaveLength(3);
    expect(auto!.title).toBe("Autosave");
    expect(auto!.frames).toHaveLength(5);
  });

  it("clearAutosave does not affect session", async () => {
    await saveSession(makeSession(2, "Session"));
    await saveAutosave(makeSession(4, "Autosave"));
    await clearAutosave();

    expect(await loadSession()).not.toBeNull();
    expect(await loadAutosave()).toBeNull();
  });
});

// ── Clear ──

describe("clearSession", () => {
  it("removes session and its frames", async () => {
    await saveSession(makeSession(10));
    await clearSession();
    expect(await loadSession()).toBeNull();
  });
});

// ── Incremental: appendFrame ──

describe("appendFrame", () => {
  it("adds a frame without rewriting existing frames", async () => {
    const session = makeSession(3);
    await saveSession(session);

    const newFrame = makeFrame(4);
    const updated = { ...session, frames: [...session.frames, newFrame] };
    await appendFrame(updated, newFrame);

    const loaded = await loadSession();
    expect(loaded!.frames).toHaveLength(4);
    expect(loaded!.frames[3].number).toBe(4);
    expect(loaded!.frames[3].html).toContain("Frame 4");
  });

  it("works when starting from empty session", async () => {
    const session: SessionData = { title: "Empty", style: "pixel", frames: [] };
    await saveSession(session);

    const frame = makeFrame(1);
    const updated = { ...session, frames: [frame] };
    await appendFrame(updated, frame);

    const loaded = await loadSession();
    expect(loaded!.frames).toHaveLength(1);
    expect(loaded!.frames[0].html).toContain("Frame 1");
  });

  it("handles sequential appends correctly", async () => {
    let session = makeSession(0);
    await saveSession(session);

    for (let i = 1; i <= 20; i++) {
      const frame = makeFrame(i);
      session = { ...session, frames: [...session.frames, frame] };
      await appendFrame(session, frame);
    }

    const loaded = await loadSession();
    expect(loaded!.frames).toHaveLength(20);
    for (let i = 0; i < 20; i++) {
      expect(loaded!.frames[i].number).toBe(i + 1);
      expect(loaded!.frames[i].html).toContain(`Frame ${i + 1}`);
    }
  });
});

// ── Incremental: removeLastFrame ──

describe("removeLastFrame", () => {
  it("removes the last frame", async () => {
    const session = makeSession(5);
    await saveSession(session);

    const updated = { ...session, frames: session.frames.slice(0, -1) };
    await removeLastFrame(updated, 5);

    const loaded = await loadSession();
    expect(loaded!.frames).toHaveLength(4);
    expect(loaded!.frames.map((f) => f.number)).toEqual([1, 2, 3, 4]);
  });

  it("handles removing down to zero frames", async () => {
    const session = makeSession(1);
    await saveSession(session);

    await removeLastFrame({ ...session, frames: [] }, 1);

    const loaded = await loadSession();
    expect(loaded).toBeNull(); // empty frames returns null
  });

  it("append after remove works correctly", async () => {
    const session = makeSession(3);
    await saveSession(session);

    // Remove frame 3
    const afterRemove = { ...session, frames: session.frames.slice(0, -1) };
    await removeLastFrame(afterRemove, 3);

    // Add a new frame 3 with different content
    const newFrame3 = makeFrame(3, "<html><body>Regenerated Frame 3</body></html>");
    const afterAppend = { ...afterRemove, frames: [...afterRemove.frames, newFrame3] };
    await appendFrame(afterAppend, newFrame3);

    const loaded = await loadSession();
    expect(loaded!.frames).toHaveLength(3);
    expect(loaded!.frames[2].html).toContain("Regenerated");
  });
});

// ── Meta-only update ──

describe("saveSessionMeta", () => {
  it("updates style without touching frame HTML", async () => {
    const session = makeSession(3);
    await saveSession(session);

    await saveSessionMeta({ ...session, style: "neon" });

    const loaded = await loadSession();
    expect(loaded!.style).toBe("neon");
    expect(loaded!.frames).toHaveLength(3);
    expect(loaded!.frames[0].html).toContain("Frame 1");
  });
});

// ── Large session stress test ──

describe("scale", () => {
  it("handles 200 frames via sequential appends", async () => {
    const N = 200;
    let session: SessionData = { title: "Scale Test", style: "default", frames: [] };
    await saveSession(session);

    for (let i = 1; i <= N; i++) {
      const frame = makeFrame(i, `<html><body>${"x".repeat(500)}</body></html>`);
      session = { ...session, frames: [...session.frames, frame] };
      await appendFrame(session, frame);
    }

    const loaded = await loadSession();
    expect(loaded!.frames).toHaveLength(N);
    expect(loaded!.frames[0].number).toBe(1);
    expect(loaded!.frames[N - 1].number).toBe(N);
  }, 30000);
});

// ── Migration ──

describe("migrateFromLocalStorage", () => {
  it("reads valid autosave from localStorage", () => {
    const data = {
      title: "Legacy Session",
      frames: [makeFrame(1), makeFrame(2)],
    };
    localStorage.setItem("aop_autosave", JSON.stringify(data));

    const result = migrateFromLocalStorage();
    expect(result).not.toBeNull();
    expect(result!.title).toBe("Legacy Session");
    expect(result!.style).toBe("default");
    expect(result!.frames).toHaveLength(2);
  });

  it("returns null for invalid data", () => {
    localStorage.setItem("aop_autosave", "not json");
    expect(migrateFromLocalStorage()).toBeNull();
  });

  it("returns null for empty frames", () => {
    localStorage.setItem("aop_autosave", JSON.stringify({ title: "T", frames: [] }));
    expect(migrateFromLocalStorage()).toBeNull();
  });
});

describe("migrateFromSessionStorage", () => {
  it("reads valid session from sessionStorage", () => {
    const data = { title: "Tab Session", frames: [makeFrame(1)] };
    sessionStorage.setItem("aop_session", JSON.stringify(data));

    const result = migrateFromSessionStorage();
    expect(result).not.toBeNull();
    expect(result!.title).toBe("Tab Session");
  });
});

describe("clearLegacyStorage", () => {
  it("removes both legacy keys", () => {
    localStorage.setItem("aop_autosave", "data");
    sessionStorage.setItem("aop_session", "data");
    clearLegacyStorage();
    expect(localStorage.getItem("aop_autosave")).toBeNull();
    expect(sessionStorage.getItem("aop_session")).toBeNull();
  });
});
