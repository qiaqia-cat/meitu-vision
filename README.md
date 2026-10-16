# 美图视觉

美图视觉 is an AI social growth workspace for overseas creators and cross-border sellers. It turns one uploaded image into platform-aware visual drafts and scored copy candidates for TikTok, Instagram, YouTube Shorts, Pinterest, Shopee, and Etsy. Copy is written by DeepSeek, and the image is understood by Zhipu GLM-4V.

<p align="center">
  <img src="docs/screenshots/01-intro.png" width="720" alt="three.js intro scene" />
</p>

## Stack

**Frontend**

- Vue3
- TypeScript
- Vite
- Pinia
- Canvas 2D — layer compositing, safe zones, PNG export
- three.js — WebGL intro scene
- vue-i18n — 5 UI locales
- IndexedDB — design history and brand kit
- jszip — multi-platform batch export

**Models**

- DeepSeek `deepseek-chat` — copy generation in JSON mode
- Zhipu `glm-4v-flash` — multimodal image understanding

<p align="center">
  <img src="docs/screenshots/02-editor.png" width="720" alt="workspace with AI-generated copy" />
</p>

## Features

**Image & canvas**

- Upload an image and crop it into the selected platform canvas
- Analyze brightness, colour temperature, orientation and dominant colour
- Detect visual quiet zones so text placement avoids the subject
- Switch between overseas social and commerce templates
- Display platform safe zones for social UI overlays
- Edit text and sticker layers by dragging on the canvas
- Export the current visual as PNG

**Copy & compliance**

- Choose commercial goals, audience personas, and type a free-text product category (left empty for the AI to infer it from the image)
- Generate scored copy candidates with DeepSeek, grounded in image understanding, market insight and platform playbooks
- Screen the copy for risky wording with the two-layer compliance guard
- Rewrite flagged terms in one click and re-scan the result

**Multi-platform**

- Reflow one design into TikTok, Instagram, YouTube Shorts, Pinterest, Shopee and Etsy canvases
- Batch-export every reflowed version as a single ZIP

**Workspace**

- Save designs and brand kits to IndexedDB and reopen them for editing
- Switch the interface between English, 简体中文, Español, 日本語 and 한국어
- Sign up with a mobile number and set a custom avatar

## AI Layer

Copy generation is driven by real large models, not canned templates.

- **Text model — DeepSeek `deepseek-chat`.** Called in JSON mode (`response_format: json_object`) with `temperature: 0.8`, so the response is a strict JSON contract instead of free text that has to be scraped.
- **Vision model — Zhipu `glm-4v-flash`.** Reads the uploaded image and returns subject / scene / mood / product type / selling points / SEO keywords, which then become the source of truth for the copy.
- **Prompt engineering.** `src/utils/prompt.ts` assembles a layered system + user brief:
  1. role prompt — senior overseas social-commerce copywriter, strict-JSON output contract;
  2. design brief — platform canvas + safe zones, market cultural tone, business goal, audience persona, product category;
  3. image insight — local heuristic analysis (brightness, colour temperature, orientation, dominant colour) plus the multimodal vision result;
  4. playbook injection — per-platform formula / winning pattern / risk, and per-market hook / trust cue / taboo;
  5. output contract — 3 non-paraphrasing variants, target language by market, hard length limits (headline 42, caption 160), self-scored click-through confidence.
- **Graceful degradation.** No key / network / timeout / malformed JSON all fall back to the local rule engine, so the page never breaks. The UI shows an "AI mode / offline rules" badge so the state is always visible.
- **Key safety.** API keys are injected only by the Vite dev proxy (`/llm`, `/vision`) and never reach the browser bundle or the repository.

## Compliance guard

<p align="center">
  <img src="docs/screenshots/03-compliance.png" width="720" alt="two-layer compliance check" />
</p>

Copy is screened for risky wording before it can leave the studio.

- **Layer 1 — local rule library.** Regex rules covering the Chinese Advertising Law (absolute terms, medical efficacy, earnings promises), FTC / EU 655-2013 claim rules, Japan 薬機法 wording, and platform-specific bans (Etsy / Shopee IP terms, TikTok engagement bait, off-platform contact). Runs offline, zero latency, no key required.
- **Layer 2 — DeepSeek semantic review.** Catches what a word list cannot: implied efficacy, unsubstantiated comparisons, and promises that only read as safe in isolation. Results are cached per copy + market + platform.
- **Merge & false-positive control.** Semantic hits that overlap or repeat a lexical hit are dropped, and context exceptions keep 第一天 / 第一次 from being flagged as absolute claims.
- **One-click fix.** Every finding carries replacement wording — applying it rewrites the copy, updates the canvas layer and re-scans.
- **Export gate.** Opening multi-platform export reports how many high-risk terms remain before anything is rendered.
- **Report export.** Download a TXT compliance report for the checked copy.

## Security note

For security reasons, no API keys are committed to this repository — `DEEPSEEK_API_KEY` is intentionally excluded, and so is `ZHIPU_API_KEY`.

Keys live in a local, git-ignored `.env.local` and are injected only by the Vite dev proxy, so they never enter the browser bundle, the build output, or git history. To run the AI path, copy `.env.local.example` to `.env.local` and drop in your own key. **The project runs fine without them** — it just falls back to its local rule engine instead of calling a model.

## Run Locally

**Prerequisites**

- Node.js `^20.19.0 || >=22.12.0` — required by Vite 7
- npm 10 or newer

**1 · Install dependencies**

```bash
npm ci
```

**2 · Configure keys (optional)**

```bash
cp .env.local.example .env.local
```

On Windows: `copy .env.local.example .env.local`. Then edit the file:

```bash
DEEPSEEK_API_KEY=sk-your-own-key
ZHIPU_API_KEY=your-own-key
```

> Vite reads `.env.local` only at startup, so **restart `npm run dev`** after editing it.

**3 · Start the dev server**

```bash
npm run dev
```

Then open http://localhost:5173. The `/llm` and `/vision` routes are dev-proxy only — a static build served without that proxy will always take the offline path.
