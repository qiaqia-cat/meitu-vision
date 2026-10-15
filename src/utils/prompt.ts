import { marketInsights, platformPlaybooks } from '@/data/strategy'
import { i18n } from '@/i18n'
import { chatJSON, type LLMMessage } from '@/services/llm'
import type { CopyStrategy, GeneratedCopy, ImageInsight, MarketId, MarketProfile, PlatformId, PlatformTemplate } from '@/types/editor'

const t = i18n.global.t

const platformStyles: Record<PlatformId, { angle: string; cta: string; hashtags: string[] }> = {
  tiktok: {
    angle: 'hook-first, short, energetic',
    cta: 'Watch the glow-up',
    hashtags: ['#TikTokMadeMeTryIt', '#GlowUp', '#CreatorTools']
  },
  instagramPost: {
    angle: 'polished, aspirational, lifestyle-led',
    cta: 'Save this look',
    hashtags: ['#InstaDesign', '#VisualStory', '#ContentCreator']
  },
  instagramStory: {
    angle: 'quick, conversational, swipe-friendly',
    cta: 'Tap to try',
    hashtags: ['#StoryReady', '#DailyPost', '#QuickDesign']
  },
  youtubeShorts: {
    angle: 'bold, curiosity-driven, thumbnail-friendly',
    cta: 'See the result',
    hashtags: ['#Shorts', '#BeforeAfter', '#CreativeWorkflow']
  },
  pinterest: {
    angle: 'searchable, evergreen, inspiration-focused',
    cta: 'Pin this idea',
    hashtags: ['#PinterestIdeas', '#DesignInspo', '#VisualPlanning']
  },
  shopee: {
    angle: 'deal-oriented, clear, product-benefit-first',
    cta: 'Shop the deal',
    hashtags: ['#ShopeeFinds', '#BestDeal', '#ShopNow']
  },
  etsy: {
    angle: 'handmade, niche, detail-rich',
    cta: 'Explore the listing',
    hashtags: ['#EtsySeller', '#SmallBusiness', '#MadeWithCare']
  }
}

/**
 * Offline fallback copy — written as real marketing sentences, not internal
 * parameter strings. The old fallback concatenated image-analysis jargon
 * ("balanced and versatile social cover visual...") which read like debug
 * output. Users without an LLM key still deserve usable, human copy.
 */
const categoryCopy: Record<
  'en' | 'es' | 'ja',
  Record<string, { action: string; inspire: string; caption: string }>
> = {
  en: {
    generic: {
      action: 'Made to stop the scroll',
      inspire: 'The find worth sharing',
      caption: 'Clean look, honest detail, effortless vibe — exactly what your audience saves and shares.'
    },
    beauty: {
      action: 'Glow that sells itself',
      inspire: 'Your daily glow moment',
      caption: 'Real texture, soft light, honest color — the kind of clean look that stops the scroll.'
    },
    fashion: {
      action: 'Wear it. Film it. Post it.',
      inspire: 'One look, three ways to style it',
      caption: 'Clean lines, warm tones, effortless fit — styled for the feed your audience already loves.'
    },
    food: {
      action: 'Tastes as good as it looks',
      inspire: 'The bite everyone will ask about',
      caption: 'Fresh from the kitchen, shot at golden hour. Swipe up before it sells out.'
    },
    home: {
      action: 'Make space feel like home',
      inspire: 'Small change, big cozy upgrade',
      caption: 'Soft light, warm wood, calm corners — a room reset your followers will save.'
    },
    digitalProduct: {
      action: 'Download it. Try it today.',
      inspire: 'The tool creators keep recommending',
      caption: 'Instant download, lifetime updates, works on any device. Try it free this week.'
    },
    handmade: {
      action: 'Made by hand, made to last',
      inspire: 'Every piece has a story',
      caption: 'Small batch, careful details, one-of-a-kind finish — shipped straight from the studio.'
    }
  },
  es: {
    generic: {
      action: 'Hecho para detener el scroll',
      inspire: 'Ese hallazgo que merece compartirse',
      caption: 'Look limpio, detalle honesto, vibra natural: lo que tu audiencia guarda y comparte.'
    },
    beauty: {
      action: 'Un brillo que se vende solo',
      inspire: 'Tu momento de glow diario',
      caption: 'Textura real, luz suave, color honesto: ese look limpio que detiene el scroll.'
    },
    fashion: {
      action: 'Póntelo. Grábalo. Publícalo.',
      inspire: 'Un look, tres estilos',
      caption: 'Líneas limpias, tonos cálidos, calce perfecto — pensado para el feed que tu audiencia ya ama.'
    },
    food: {
      action: 'Sabe tan bien como se ve',
      inspire: 'El bocado que todos van a preguntar',
      caption: 'Recién hecho, a la hora dorada. Pide el tuyo antes de que se agote.'
    },
    home: {
      action: 'Que tu casa se sienta hogar',
      inspire: 'Cambio chico, vuelco gigante',
      caption: 'Luz suave, madera cálida, rincones en calma: un reset que van a guardar todos.'
    },
    digitalProduct: {
      action: 'Descárgalo y pruébalo hoy',
      inspire: 'La herramienta que los creadores recomiendan',
      caption: 'Descarga inmediata, actualizaciones de por vida, funciona en cualquier dispositivo.'
    },
    handmade: {
      action: 'Hecho a mano, hecho para durar',
      inspire: 'Cada pieza tiene su historia',
      caption: 'Series cortas, detalles cuidados, acabado único — enviado directo del taller.'
    }
  },
  ja: {
    generic: {
      action: 'スクロールを止める一枚',
      inspire: 'シェアしたくなる発見',
      caption: '清潔感のある仕上がりと誠実なディテール。保存して反映したくなるビジュアル。'
    },
    beauty: {
      action: '魅せる艶、そのまま商品力',
      inspire: '今日の輝きをワンショット',
      caption: '自然な質感と柔らかい光。色的に誠実で、思わず止まる清潔感のある仕上がり。'
    },
    fashion: {
      action: '着て、撮って、投稿する',
      inspire: 'ひとつの服、3つの着こなし',
      caption: 'きれいめシルエットと暖色トーン。フォロワーが好きなフィードに自然に溶け込む一枚。'
    },
    food: {
      action: '見た目そのまま、おいしさ直送',
      inspire: 'みんなが聞いてくる一品',
      caption: 'できたてをゴールデンアワーで撮影。売り切れる前にチェックしてください。'
    },
    home: {
      action: 'おうちがもっと居心地よく',
      inspire: '小さな変更で大きく変わる',
      caption: '柔らかい光と暖かい木の質感。保存したくなる部屋のリセット例です。'
    },
    digitalProduct: {
      action: '今すぐダウンロードして試す',
      inspire: 'クリエイターが本当に勧める道具',
      caption: '即時ダウンロード、永久アップデート、どのデバイスでも動作。今週無料で試せます。'
    },
    handmade: {
      action: '手づくりの、長く使える一品',
      inspire: 'ひとつひとつに物語がある',
      caption: '少量生産、丁寧な仕上げ、世界にひとつだけ。工房から直接お届けします。'
    }
  }
}

function buildHeadline(categoryHint: string, language: 'en' | 'es' | 'ja', goal: CopyStrategy['goal']) {
  const known = categoryHint.trim().length > 0 ? categoryCopy[language][categoryHint.trim()] : undefined
  const entry = known ?? categoryCopy[language].generic
  // Action-flavored for bottom-funnel goals, inspiration-flavored otherwise.
  return goal === 'conversion' || goal === 'retention' ? entry.action : entry.inspire
}

export function generateCopy(
  platform: PlatformTemplate,
  market: MarketProfile,
  insight?: ImageInsight,
  strategy: CopyStrategy = { goal: 'conversion', persona: 'smallSeller', category: '' }
): GeneratedCopy {
  const visual = insight ?? {
    brightness: 'balanced',
    temperature: 'neutral',
    orientation: 'square',
    dominantColor: '#64748b',
    mood: 'balanced and versatile',
    subjectHint: 'social cover visual'
  }
  const style = platformStyles[platform.id]
  const playbook = platformPlaybooks[platform.id]
  const marketInsight = marketInsights[market.id]
  const headline = buildHeadline(strategy.category, market.language, strategy.goal)
  const caption = categoryCopy[market.language][strategy.category.trim()]?.caption ?? categoryCopy[market.language].generic.caption
  const score = scoreCopy(platform.id, strategy.goal, visual)

  return {
    headline,
    caption,
    cta: style.cta,
    hashtags: style.hashtags,
    score,
    reason: t('copy.fallbackReason'),
    structure: playbook.formula,
    prompt: [
      `Image insight: ${visual.brightness}, ${visual.temperature}, ${visual.orientation}, dominant color ${visual.dominantColor}.`,
      `Platform style: ${t(`platforms.${platform.id}.name`)}, ${style.angle}.`,
      `Market: ${t(`markets.${market.id}.name`)}, tone ${t(`markets.${market.id}.tone`)}.`,
      `Business goal: ${strategy.goal}. Persona: ${strategy.persona}. Category: ${strategy.category}.`,
      `Keep text readable inside ${platform.ratio} safe zones.`
    ].join(' ')
  }
}

export function generateCopyVariants(
  platform: PlatformTemplate,
  market: MarketProfile,
  insight: ImageInsight | undefined,
  strategy: CopyStrategy
) {
  const goals = [strategy.goal, 'engagement', 'conversion'] as const
  return goals.map((goal, index) => {
    const next = generateCopy(platform, market, insight, { ...strategy, goal })
    return {
      ...next,
      score: Math.min(98, next.score - index * 3 + (goal === strategy.goal ? 4 : 0))
    }
  })
}

function scoreCopy(platformId: PlatformId, goal: CopyStrategy['goal'], insight: ImageInsight) {
  let score = 78
  if (goal === 'conversion' && (platformId === 'shopee' || platformId === 'etsy')) score += 10
  if (goal === 'engagement' && (platformId === 'tiktok' || platformId === 'instagramStory')) score += 8
  if (goal === 'awareness' && (platformId === 'instagramPost' || platformId === 'pinterest')) score += 7
  if (insight.brightness !== 'balanced') score += 4
  if (insight.orientation === 'portrait' && ['tiktok', 'instagramStory', 'youtubeShorts'].includes(platformId)) score += 5
  return Math.min(score, 96)
}

const MARKET_OUTPUT_LANGUAGE: Record<MarketId, string> = {
  northAmerica: 'English',
  latinAmerica: 'Spanish',
  japanKorea: 'Japanese',
  southeastAsia: 'English',
  europe: 'English'
}

const UI_LANGUAGE_LABEL: Record<string, string> = {
  en: 'English',
  es: 'Spanish',
  ja: 'Japanese',
  ko: 'Korean',
  zh: 'Simplified Chinese'
}

interface LLMCopyVariantPayload {
  headline?: unknown
  caption?: unknown
  cta?: unknown
  hashtags?: unknown
  score?: unknown
  reason?: unknown
  structure?: unknown
}

function buildCopyMessages(
  platform: PlatformTemplate,
  market: MarketProfile,
  insight: ImageInsight | undefined,
  strategy: CopyStrategy
): LLMMessage[] {
  const visual = insight ?? {
    brightness: 'balanced',
    temperature: 'neutral',
    orientation: 'square',
    dominantColor: '#64748b',
    mood: 'balanced and versatile',
    subjectHint: 'social cover visual'
  }
  const playbook = platformPlaybooks[platform.id]
  const marketInsight = marketInsights[market.id]
  const outputLanguage = MARKET_OUTPUT_LANGUAGE[market.id]
  const uiLanguage = UI_LANGUAGE_LABEL[i18n.global.locale.value] ?? 'English'
  const t = i18n.global.t

  const system = [
    'You are a senior overseas social-commerce copywriter for creators and cross-border sellers.',
    'You write platform-native marketing copy that follows each platform winning pattern and each market cultural tone.',
    'Always reply with strict JSON only, no markdown fences, no commentary.'
  ].join(' ')

  const visionBlock = visual.vision
    ? [
        '- Visual understanding (multimodal model):',
        `  * Subject: ${visual.vision.subject || visual.subjectHint}`,
        `  * Scene: ${visual.vision.scene}`,
        `  * Mood: ${visual.vision.mood}`,
        `  * Product type: ${visual.vision.productType}`,
        visual.vision.sellingPoints.length
          ? `  * Selling points: ${visual.vision.sellingPoints.join(' / ')}`
          : '',
        visual.vision.keywords.length
          ? `  * SEO keywords: ${visual.vision.keywords.join(', ')}`
          : '',
        'Use the visual understanding above as the source of truth about what the image actually shows. Do NOT drift back to the brightness/temperature heuristic when writing copy.'
      ]
        .filter(Boolean)
        .join('\n')
    : null

  const categoryHint = strategy.category.trim()
  const categoryLine = categoryHint
    ? `- Product category (seller-specified hint): ${categoryHint}. Follow this hint unless the visual understanding clearly contradicts it.`
    : visual.vision
      ? '- Product category: not specified — infer the most accurate category from the visual understanding below.'
      : '- Product category: not specified — infer the most plausible category from the image insight below.'

  const brief = [
    'Design brief:',
    `- Platform: ${t(`platforms.${platform.id}.name`)} (${t(`platforms.${platform.id}.channel`)}), canvas ${platform.ratio}, keep text clear of UI safe zones.`,
    `- Market: ${t(`markets.${market.id}.name`)}, tone: ${t(`markets.${market.id}.tone`)}.`,
    `- Business goal: ${strategy.goal}. Audience persona: ${strategy.persona}.`,
    categoryLine,
    `- Image insight: brightness ${visual.brightness}, temperature ${visual.temperature}, orientation ${visual.orientation}, dominant color ${visual.dominantColor}. Overall mood: ${visual.mood}. Subject: ${visual.subjectHint}.`,
    visionBlock,
    `- Platform playbook: formula "${playbook.formula}"; winning pattern: ${playbook.winningPattern}; risk to avoid: ${playbook.risk}.`,
    `- Market playbook: hook "${marketInsight.hook}"; trust cue "${marketInsight.trustCue}"; avoid "${marketInsight.avoid}".`,
    '',
    `Write 3 distinct copy variants (different angles, not paraphrases) for this cover.`,
    `ALL creative text (headline, caption, cta, hashtags) MUST be written in ${outputLanguage}.`,
    'Rules: headline max 42 characters, punchy cover-ready. Caption max 160 characters. cta is a short action phrase. 3-5 hashtags that feel native to the platform. score = integer 0-100, your honest click-through confidence for this platform + market + goal combo. reason = one sentence in ' + uiLanguage + ' explaining why it works. structure = the template it follows, in ' + uiLanguage + '.',
    '',
    'Return JSON exactly shaped as:',
    '{"variants":[{"headline":"","caption":"","cta":"","hashtags":["#tag"],"score":0,"reason":"","structure":""}]}'
  ]
    .filter(Boolean)
    .join('\n')

  return [
    { role: 'system', content: system },
    { role: 'user', content: brief }
  ]
}

function sanitizeVariant(raw: LLMCopyVariantPayload, fallback: GeneratedCopy): GeneratedCopy {
  const str = (value: unknown, fb: string, max = 400) =>
    typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : fb

  const hashtags = Array.isArray(raw.hashtags)
    ? raw.hashtags
        .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
        .map((item) => item.trim())
        .slice(0, 6)
    : []

  const scoreRaw = typeof raw.score === 'number' ? raw.score : Number(raw.score)
  const score = Number.isFinite(scoreRaw)
    ? Math.max(0, Math.min(100, Math.round(scoreRaw)))
    : fallback.score

  return {
    headline: str(raw.headline, fallback.headline, 80),
    caption: str(raw.caption, fallback.caption, 240),
    cta: str(raw.cta, fallback.cta, 60),
    hashtags: hashtags.length > 0 ? hashtags : fallback.hashtags,
    score,
    reason: str(raw.reason, fallback.reason, 300),
    structure: str(raw.structure, fallback.structure, 200),
    prompt: fallback.prompt
  }
}

export async function generateLLMCopyVariants(
  platform: PlatformTemplate,
  market: MarketProfile,
  insight: ImageInsight | undefined,
  strategy: CopyStrategy
): Promise<GeneratedCopy[]> {
  const fallbackVariants = generateCopyVariants(platform, market, insight, strategy)
  const messages = buildCopyMessages(platform, market, insight, strategy)
  const data = await chatJSON<{ variants?: LLMCopyVariantPayload[] }>(messages)
  const rawVariants = Array.isArray(data.variants) ? data.variants : []

  if (rawVariants.length === 0) {
    throw new Error('LLM returned no variants.')
  }

  return rawVariants
    .slice(0, 3)
    .map((raw, index) => sanitizeVariant(raw, fallbackVariants[index] ?? fallbackVariants[0]))
}
