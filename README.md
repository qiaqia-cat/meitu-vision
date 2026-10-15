# 美图视觉

美图视觉 is an AI social growth workspace for overseas creators and cross-border sellers. It turns one uploaded image into platform-aware visual drafts and scored copy candidates for TikTok, Instagram, YouTube Shorts, Pinterest, Shopee, and Etsy. Copy is written by DeepSeek, and the image is understood by Zhipu GLM-4V.

## Stack

- Vue3
- TypeScript
- Vite
- Pinia
- Canvas
- IndexedDB
- vue-i18n
- DeepSeek `deepseek-chat` (copy generation, JSON mode)
- Zhipu GLM-4V `glm-4v-flash` (multimodal image understanding)

## Features

- Upload an image and crop it into the selected platform canvas
- Analyze uploaded image brightness, color temperature, orientation, and dominant color
- Switch between overseas social and commerce templates
- Choose commercial goals, audience personas, and type a free-text product category (left empty for the AI to infer it from the image)
- Generate scored copy candidates with DeepSeek, grounded in image understanding, market insight, and platform playbooks
- Edit text and sticker layers by dragging on the canvas
- Generate image-aware copy that follows TikTok, Instagram, YouTube Shorts, Pinterest, Shopee, and Etsy content styles
- Display platform safe zones for social UI overlays
- Save reusable designs to IndexedDB
- Export the current visual as PNG

## AI Layer

Copy generation is driven by real large models, not canned templates.

- **Text model — DeepSeek `deepseek-chat`.** Called in JSON mode (`response_format: json_object`) with `temperature: 0.8`, so the response is a strict JSON contract instead of free text that has to be scraped.
- **Vision model — Zhipu `glm-4v-flash` (GLM-4V).** Reads the uploaded image and returns subject / scene / mood / product type / selling points / SEO keywords, which then become the source of truth for the copy.
- **Prompt engineering.** `src/utils/prompt.ts` assembles a layered system + user brief:
  1. role prompt — senior overseas social-commerce copywriter, strict-JSON output contract;
  2. design brief — platform canvas + safe zones, market cultural tone, business goal, audience persona, product category;
  3. image insight — local heuristic analysis (brightness, colour temperature, orientation, dominant colour) plus the multimodal vision result;
  4. playbook injection — per-platform formula / winning pattern / risk, and per-market hook / trust cue / taboo;
  5. output contract — 3 non-paraphrasing variants, target language by market, hard length limits (headline 42, caption 160), self-scored click-through confidence.
- **Graceful degradation.** No key / network / timeout / malformed JSON all fall back to the local rule engine, so the page never breaks. The UI shows an "AI mode / offline rules" badge so the state is always visible.
- **Key safety.** API keys are injected only by the Vite dev proxy (`/llm`, `/vision`) and never reach the browser bundle or the repository.

## Run Locally

```bash
npm install
npm run dev
```

## Resume Version

美图视觉: AI overseas social visual localization workspace

Built a Vue3 + TypeScript overseas social growth workspace for creators and cross-border sellers. Implemented image upload, lightweight visual analysis, commercial strategy selection, free-text product category with AI inference, market/platform copy playbooks, scored copy variants, multi-platform canvas templates, draggable text/sticker layers, IndexedDB history, mobile registration, custom avatars, and PNG export.

Integrated real LLM capability: DeepSeek `deepseek-chat` for platform-native copy generation in JSON mode, and Zhipu GLM-4V for multimodal image understanding feeding the copy brief. Designed a layered prompt system (role prompt + design brief + image insight + platform/market playbook injection + strict JSON output contract with length limits and self-scored confidence), plus a fallback rule engine and error taxonomy so the UI degrades gracefully without keys or on timeout. API keys stay in the dev proxy and never enter the bundle. The project focuses on global content production and conversion-oriented localization rather than basic image beautification.
