# The Art of Prompt — Product Requirements Document

---

## System Overview

*The Art of Prompt* is an interactive physical art installation, realized as a web app, that embodies the PromptWorm/broken telephone mechanic. Participants approach the installation, submit a single natural language prompt to Claude (Anthropic’s LLM), and watch as their idea subtly evolves a minimalist, geometric, animated digital artifact in real-time. Each prompt (and resulting artifact state) is captured as a numbered frame for stop-motion video export, creating a visual history of collaborative creativity. No user accounts, no prompt history, and a Claude-branded aesthetic put the evolving artifact at the center. Designed for public, sequential interaction at exhibitions or artistic events.

### Architecture Pattern

* **Type:** Serverless Monolith (Next.js App Router on Vercel, single database, serverless API routes)

* **Key components:**

  * Frontend (Next.js React app, branded UI, iframe artifact renderer)

  * Backend API (API routes for Claude calls, session management, exports)

  * Database (Neon Postgres, Drizzle ORM management)

  * Background Jobs (stop-motion export worker)

  * External Services (Anthropic Claude API, Cloudflare R2 for image/frame storage)

### System Diagram

* **Frontend:** Communicates with backend API routes via REST (fetch/AJAX)

* **/api/frames:** Handles prompt submission, artifact evolution, frame DB insert

* **Claude API:** Invoked server-side; prior artifact HTML + user prompt → new HTML & note

* **Puppeteer + Chromium:** Headless browser captures PNG of rendered artifact

* **Cloudflare R2:** Stores all frame PNGs

* **Database:** Stores sessions, frames, prompts, system prompt, export jobs

* **Export Job Worker:** (API or separate worker) Fetches all PNGs, uses ffmpeg to build MP4/GIF, writes back to R2

* **Admin UI & Gallery:** Accesses live frame data, triggers and downloads exports

*Data flow:*  

Prompt → Backend → Claude API → DB (artifact HTML saved) → Puppeteer screenshots → Upload to R2 → DB updated with screenshot URL → Frontend re-renders artifact in iframe.

---

## Data Model

### Entity Format

```
Session
  - id: uuid (PK)
  - title: text
  - status: enum ('active', 'ended', 'exporting', 'exported')
  - createdAt: timestamptz
  - endedAt: timestamptz (nullable)

```

`Frame`

* `id: uuid (PK)`

* `sessionId: uuid (FK: Session)`

* `frameNumber: int (unique per session, indexed)`

* `promptText: text`

* `artifactHtml: text`

* `acknowledgment: text`

* `screenshotUrl: text (nullable)`

* `createdAt: timestamptz`

`SystemPrompt`

* `id: uuid (PK)`

* `content: text`

* `isActive: boolean (default true)`

* `createdAt: timestamptz`

`ExportJob`

* `id: uuid (PK)`

* `sessionId: uuid (FK: Session)`

* `format: enum ('mp4', 'gif', 'zip')`

* `status: enum ('pending', 'processing', 'done', 'error')`

* `outputUrl: text (nullable)`

* `createdAt: timestamptz`

* `updatedAt: timestamptz`

* `errorMessage: text (nullable)`  

### Relationships

* **Session → Frame:** One-to-many (Session has many Frames)

* **Frame → Session:** Many-to-one (Frame belongs to Session)

* **Session → ExportJob:** One-to-many (Session can have multiple export jobs)

* **SystemPrompt:** Singleton active row; referenced on each frame generation

*Indexes & Constraints:*

* `Frame.frameNumber` unique per Session (composite key)

* `Session.status` for querying active session

* `ExportJob.status` indexed for polling/export workflow

---

## API Design

### Sessions

```
POST /api/sessions
  Auth: admin-pin
  Body: { title: string }
  Response: { session: { id, title, status, createdAt } }

```

`PATCH /api/sessions/:id/end`  

`Auth: admin-pin`  

`Response: { success: true }`  

### Frames

```
POST /api/frames
  Auth: public
  Body: { sessionId: uuid, promptText: string }
  Response: { frame: { id, frameNumber, acknowledgment, artifactHtml, screenshotUrl } }

```

`GET /api/frames/latest?sessionId=uuid`  

`Auth: public`  

`Response: { frame: { id, frameNumber, artifactHtml, acknowledgment, screenshotUrl } }`

`GET /api/frames?sessionId=uuid`  

`Auth: admin-pin`  

`Response: { frames: [ ... ] }`  

### Exports

```
POST /api/exports
  Auth: admin-pin
  Body: { sessionId: uuid, format: 'mp4' | 'gif' | 'zip' }
  Response: { exportJob: { id, status } }

```

`GET /api/exports/:id`  

`Auth: admin-pin`  

`Response: { exportJob: { status, outputUrl, errorMessage? } }`  

*Notes:*

* **Rate limiting:** In-memory lock or Redis guard on `/api/frames` per session to block concurrent submits. Return 429 if locked.

* **Pagination:** All frames for session are ordered by `frameNumber`. No pagination required (≤100 frames/session).

* **Error response:** `{ error: string }`, 4xx or 5xx as appropriate.

---

## Auth & Permissions

### Authentication

* **Provider:** Custom PIN (stored server-side env or DB, bcrypt hash)

* **Methods:** Admin enters PIN via modal before accessing /admin or export endpoints.

* **Session handling:** Short-lived encrypted cookie for admin auth (HttpOnly, server-access only).

### Authorization

* **Roles:**

  * *participant* (public): Can submit prompts, view evolving artifact.

  * *admin* (PIN): Can start/end sessions, export, access gallery and management features.

* **Enforcement:** Next.js middleware checks auth for `/admin` and export API routes.

* **Public routes:** `/`, `/render`, main frames API

### Multi-tenancy

* No multi-session support. Only one *active* session at a time; others may be browsed in gallery but not continued.

---

## Third-Party Services

### Anthropic Claude API

* **Service:** Artifact generation via LLM

* **SDK/Library:** `@anthropic-ai/sdk`

* **Config:** `ANTHROPIC_API_KEY`

* **Failure handling:** If request fails, error shown to user/admin; prompt can be re-attempted.

### Cloudflare R2

* **Service:** Frame PNG storage

* **SDK/Library:** `@aws-sdk/client-s3` (R2 compatible)

* **Config:** `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_ENDPOINT`

* **Failure handling:** If upload fails, frame HTML still stored; screenshotUrl is null; warning displayed in admin.

### Puppeteer w/ @sparticuz/chromium

* **Service:** Headless screenshot in serverless

* **SDK/Library:** `puppeteer`, `@sparticuz/chromium-min`

* **Config:** Chromium path, memory/time limits via Vercel settings

* **Failure handling:** Log errors, skip screenshot (never blocks artifact evolution).

### ffmpeg

* **Service:** Stop-motion video/gif/image archive creation

* **SDK/Library:** `@ffmpeg/ffmpeg` (WASM-based for Vercel), fallback to Railway worker

* **Config:** None required if using WASM; else, worker handles secret

* **Failure handling:** ExportJob marked error, admin notified

### (Optional) Sentry

* **Service:** Error monitoring

* **SDK/Library:** `@sentry/nextjs`

* **Config:** `SENTRY_DSN`

---

## Frontend Architecture

### Tech Choices

* **Framework:** Next.js 14 (App Router, server actions)

* **Component library:** shadcn/ui

* **Styling:** Tailwind CSS

* **State management:** React Query (for API/data), simple useState/useReducer elsewhere

### Page Structure

* `/` — Main prompt interface: left panel (Claude logo, session title, frame counter, prompt input), right panel (iframe live artifact)

* `/admin` — Admin dashboard (PIN gated): start/end session, frame monitor, export controls

* `/gallery` — Filmstrip view: browse all frames in completed sessions, frame thumbnails, prompt/notes shown on hover

* `/render` — Artifact renderer: renders the HTML artifact securely in a sandboxed full-page div (used for iframe and for accurate screenshot)

### Data Fetching Strategy

* **Server components:** For initial page render, session and admin data fetch

* **Client components:** For prompt input, loading states, frame polling (React Query)

* **Caching:** Stale-while-revalidate on gallery, no caching on live session views

* **Global loading/error:** Overlay for busy states (e.g., Prompt submit disables form, artifact iframe shows pulsing orange border while loading/artifact transitions)

---

## Infrastructure & Deployment

### Hosting

* **Frontend:** Vercel (Next.js project)

* **Backend:** Serverless (same as frontend, Vercel serverless API routes)

* **Database:** Neon (Postgres, serverless, Drizzle ORM)

### CI/CD Pipeline

* **Build/test:** Github Actions on PR, type/lint check

* **Preview deployments:** Vercel preview envs on branch/PR

* **Production deploy:** Merge to `main` auto-deploys to Vercel prod

### Environments

* **Development:** Local Next.js w/ Neon test DB, local .env

* **Staging:** \[Optional\] Mirror production config for final test

* **Production:** Vercel deployment, production Neon, production R2, secrets managed in Vercel UI

* **Monitoring:** (Optional) Sentry integrated

### Environment Variables

**Database**

* `DATABASE_URL` (secret)

**Anthropic**

* `ANTHROPIC_API_KEY` (secret)

**Cloudflare R2**

* `R2_ACCESS_KEY_ID` (secret)

* `R2_SECRET_ACCESS_KEY` (secret)

* `R2_BUCKET` (public if needed, or secret)

* `R2_ENDPOINT` (public)

**Admin PIN**

* `ADMIN_PIN_HASH` (secret; bcrypt hash of admin PIN)

**Feature Flags / Misc**

* `SESSION_MAX_FRAMES=100` (public)

* `EXPORT_FPS` (public, defaults to 2 for stop-motion)

**Sentry (optional)**

* `SENTRY_DSN` (secret)

---

## Overview

*The Art of Prompt* is an interactive web-based art installation designed for physical exhibitions and events. Inspired by the "PromptWorm" and broken telephone games, the core mechanic involves one participant at a time contributing a single prompt to Claude, which incrementally evolves a geometric and minimalist animated artifact. Each contribution is automatically captured as a high-quality screenshot (PNG) and stored sequentially as a frame. The visual evolution, always building upon itself, can later be exported as a stop-motion video (MP4), GIF, or ZIP archive, reflecting a collaborative, emergent artwork. The installation places the artifact center-stage with a Claude/Anthropic-branded, minimalist UI—no user accounts, no visible history, the focus is on the evolving creation itself.

**Purpose:** Facilitate ephemeral, collaborative creativity anchored in generative AI and computational art.  

**Context:** For use in galleries or events; participants approach, submit a prompt, witness instant evolution, and pass to the next.  

**Goal:** Produce a visual artifact and time-lapse artifact of collaborative generative play with a strong sense of narrative evolution.

---

## Goals & Success Criteria

* **Effortless participation:** Any attendee can walk up, write a single prompt, submit, and watch the artifact evolve within \~10 seconds.

* **Perfect capture:** Every frame is automatically captured on every prompt submission with zero missed frames.

* **Seamless export:** Admin can export all frames as a cohesive MP4 stop-motion video (or GIF/ZIP) in one click.

* **Robust performance:** System reliably supports \~100 prompts per session.

* **Cumulative evolution:** Artifact is always incrementally built; no resets or abrupt state changes mid-session.

* **Artistic UI:** Interface elevates the artifact visually: minimal, branded, and devoid of unnecessary controls.

* **Success Metrics:**

  * Zero missed frames per session

  * Export works flawlessly on first attempt

  * Participant dwell time per prompt > 30 seconds

---

## User Roles & Flows

### PARTICIPANT (public, no authentication)

1. Approaches installation and sees current artifact state in motion.

2. Reads current frame number; session title is visible.

3. Types a single prompt in the provided textarea (no prompt history).

4. Clicks submit.

5. Input disables, loading state appears; artifact updates within \~10 seconds.

6. Frame acknowledgment (e.g., "Frame 012 — added a pulsing ring of dots") appears briefly.

7. Next participant repeats the process (laptop is physically passed).

**Note:** Previous prompt history not shown. Only current visual state and frame number are displayed.

### ADMIN (PIN gated, `/admin`)

1. Navigates to `/admin` and enters PIN to access dashboard.

2. Starts new session via form (enters session title).

3. During live session, dashboard displays: session status, current frame count, last prompt, and screenshot thumbnail.

4. Can end session at any time.

5. Initiates export (selects format: MP4, GIF, ZIP), monitors export job status, and downloads output when ready.

6. Optionally accesses `/gallery` to browse all frames (filmstrip view with thumbnails, frame numbers, prompt notes).

---

## Feature Requirements

### 1\. PROMPT INTERFACE

* Full-screen, two-panel layout:  

  * **Left panel (30%):**

    * Claude logo SVG (top)

    * Session title

    * Live frame counter (e.g. "Frame 012")

    * Minimal textarea (placeholder: "Describe one change...")

    * Submit button (accent color, 2px rounded)

  * **Right panel (70%):**

    * Sandboxed iframe, edge-to-edge, zero border/padding, displaying current artifact.

* On form submit:  

  * Input disables, loading state shown (pulsing border on iframe).

  * Re-enable after frame update.

* No prompt history or additional controls/displayed past frames.

* No interactions in artifact iframe—display only.

### 2\. ARTIFACT ENGINE

* `POST /api/frames` route receives `{ sessionId, promptText }`

  * Fetches current active SystemPrompt (from DB)

  * Fetches previous frame's HTML

  * Calls Claude API (model: `claude-sonnet-4-5`) with system prompt + prev HTML + user prompt

  * Claude returns `{ html: string, acknowledgment: string }`

  * Frame saved to DB (prompt, acknowledgment, artifactHtml)

  * Triggers Puppeteer screenshot pipeline

  * Returns new Frame object (with frame number, acknowledgment, screenshot URL if ready)

* **System prompt:** Strictly enforces 7 constraints (see below).

### 3\. AUTO-CAPTURE PIPELINE

* On every successful Claude generation:  

  * Puppeteer (+ @sparticuz/chromium-min) renders artifact HTML at 1280x720 in a headless browser.

  * Waits 500ms for JS/CSS motion to initialize/settle.

  * Takes PNG screenshot.

  * Uploads PNG to Cloudflare R2 at `frames/{sessionId}/frame-{padded frameNumber}.png`

  * Frame DB record updated with `screenshotUrl`

  * If screenshot fails: logs error, still saves frame HTML (screenshotUrl = null).

### 4\. ADMIN & SESSION MANAGEMENT

* `/admin` (PIN protected):  

  * Start session (title input).

  * Live dashboard: session status, frame count, last frame thumbnail, last prompt.

  * End session button (locks prompt input on `/`).

  * Export panel: format selector (MP4/GIF/ZIP), trigger export, poll status.

  * Download button appears when export is ready.

* `/gallery` page for post-session review:  

  * Filmstrip of frame thumbnails for completed sessions.

  * Hover to show frame number, prompt note.

### 5\. STOP-MOTION EXPORT

* `POST /api/exports` creates new ExportJob  

  * Background job fetches all PNGs (via R2) in frame order for the chosen session.

  * Generates MP4 (default 2fps), GIF, or ZIP (just PNGs).

  * Result uploaded to R2 (public download link).

  * Admin polls job status (`GET /api/exports/:id`) until `status = done` and download link is available.

---

## Claude System Prompt (Locked)

> You are a generative art system evolving a visual artifact based on sequential prompt instructions, always building upon its current state.
>
> 1. **SUBTLE MOTION** — The artifact should exhibit slow, autonomous animation (breathing, pulsing, gentle drift); pixel or dot-based rendering is preferred. Do not use cursor-only effects. The piece must feel alive even when untouched.
>
> 2. **MINIMALIST** — The appearance must be clean, geometric, and sparse. Use pixel grid snapping, layered opacity, and forms that subtly "breathe." For aesthetic inspiration, see thewayofcode.com.
>
> 3. **INCREMENTAL** — You must always evolve and build on the existing visual. *Never* wipe or start fresh; do not replace, only evolve.
>
> 4. **NO PROMPT UI** — *Never* add input boxes, buttons, or controls to the artifact. The only interface is this chat.
>
> 5. **ACKNOWLEDGE EACH TURN** — After updating the artifact, output a brief plain-text note confirming what changed and the current frame number (e.g., "Frame 003 — added a grid of dots").
>
> 6. **BROKEN TELEPHONE** — Each participant sees only the current artifact, never the full history; interpret each prompt literally and do not over-correct past changes.
>
> 7. Render the artifact as a **single, self-contained HTML file** with all CSS and JS inline. No external dependencies. Canvas or SVG is preferred. Default to a dark background (#0a0a0a).
>
> **Output as JSON with two fields:**
>
> * `html` — the full artifact HTML string
>
> * `acknowledgment` — the brief frame note

---

## UI & Visual Design

* **Color Palette:**

  * Background: `#0a0a0a`

  * Surface: `#111111`

  * Border: `#222222`

  * Accent: `#d97706` (Anthropic orange)

  * Text primary: `#f5f5f5`

  * Text muted: `#666666`

* **Typography:**

  * Labels/UI: Geist Sans

  * Prompt textarea & acknowledgment: Geist Mono (monospace for generative/code art feel)

* **Branding:**

  * Claude logo SVG in top-left of left panel

  * "The Art of Prompt" wordmark below, small/quiet, Geist Sans

* **Layout:**

  * Terminal/control panel feel: no gradients, no shadows

  * Flat, sharp-edged panels; only submit button has a 2px radius

  * Artifact iframe is edge-to-edge on the right side; no border or padding

* **Loading State:**

  * Loading = pulsing border around artifact iframe in accent orange

  * Frame counter flashes briefly on increment

* **Gallery:**

  * Dark filmstrip, ordered by frame.

  * Thumbnails show frame screenshot; on hover, overlay with frame number and prompt note.

---

## Technical Implementation Notes

**1. Project Setup**

* Next.js 14 with App Router (TypeScript)

* Tailwind CSS for utility styles

* shadcn/ui for components

* Install:  

  * `@anthropic-ai/sdk` (Claude API)

  * `@aws-sdk/client-s3` (Cloudflare R2 uploads)

  * `puppeteer` and `@sparticuz/chromium-min` (screenshots)

  * `fluent-ffmpeg` (if used in worker env)

  * `drizzle-orm`, `@neondatabase/serverless` (Neon Postgres)

  * `react-query` (data fetching/cache on client)

**2. Database**

* Drizzle ORM, schema at `/db/schema.ts`

* Four tables: Session, Frame, SystemPrompt, ExportJob

* Manage schema and migration via drizzle-kit

* Seed script for inserting locked SystemPrompt

**3. Puppeteer on Vercel**

* Use `@sparticuz/chromium-min`

* In `/api/frames`, set chromium's `executablePath` appropriately

* `maxDuration = 60` and increased memory in Vercel config

* Screenshots generated in isolated `/render` route for accuracy

**4. Artifact Rendering**

* `/render`: Receives artifactHtml (POST or base64 param), renders in fullscreen div

* Main iframe uses `/render` endpoint with latest frame HTML

* Iframe set `sandbox="allow-scripts"`

**5. Concurrency**

* In-memory lock (single Vercel instance) or Redis lock to prevent double submission per session

* If locked, `/api/frames` returns 429 (rate limited)

**6. ffmpeg on Vercel**

* *Note*: ffmpeg binary not native on Vercel serverless

* Use `@ffmpeg/ffmpeg` (WebAssembly) for compatibility

* Heavy exports can be offloaded to a Railway or Fly.io worker; flag this in technical handoff

**7. Environment Setup**

* Provide `.env.local.example` listing:  

  * `DATABASE_URL`

  * `ANTHROPIC_API_KEY`

  * `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_ENDPOINT`

  * `ADMIN_PIN_HASH`

  * `SESSION_MAX_FRAMES`

  * `EXPORT_FPS`

  * `SENTRY_DSN` (optional)

---

## Out of Scope

* Multi-session concurrent support (only one active session at a time)

* User authentication beyond admin PIN

* Mobile-responsive layout (desktop/laptop only for installation)

* Real-time multiplayer sync (sequential, one-at-a-time interaction)

* Prompt moderation/content filtering

* Undo/redo of prompts or frame editing

* Ability to edit previous frames

* Social sharing features

* Custom theming beyond Claude/Anthropic visual brand

---