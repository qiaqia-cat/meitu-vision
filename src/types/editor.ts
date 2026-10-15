export type PlatformId = 'tiktok' | 'instagramPost' | 'instagramStory' | 'youtubeShorts' | 'pinterest' | 'shopee' | 'etsy'

export type MarketId = 'northAmerica' | 'latinAmerica' | 'japanKorea' | 'southeastAsia' | 'europe'

export type LayerType = 'image' | 'text' | 'sticker'

export type BusinessGoal = 'awareness' | 'engagement' | 'conversion' | 'retention'

export type AudiencePersona = 'creator' | 'beautyBuyer' | 'smallSeller' | 'student' | 'lifestyleUser'


export interface PlatformTemplate {
  id: PlatformId
  ratio: string
  width: number
  height: number
  safeTop: number
  safeBottom: number
  accent: string
}

export interface MarketProfile {
  id: MarketId
  colors: string[]
  language: 'en' | 'es' | 'ja'
}

export interface DesignLayer {
  id: string
  type: LayerType
  name: string
  x: number
  y: number
  width?: number
  height?: number
  rotation: number
  text?: string
  fontSize?: number
  fill?: string
  fontStyle?: string
  imageSrc?: string
  sticker?: string
  opacity: number
}

export interface QuietZone {
  x: number
  y: number
  width: number
  height: number
  fontSize: number
}

export interface VisionInsight {
  subject: string
  scene: string
  mood: string
  productType: string
  sellingPoints: string[]
  keywords: string[]
  source: 'llm'
}

export interface ImageInsight {
  brightness: 'bright' | 'balanced' | 'dark'
  temperature: 'warm' | 'cool' | 'neutral'
  orientation: 'portrait' | 'landscape' | 'square'
  dominantColor: string
  mood: string
  subjectHint: string
  quietZones?: QuietZone[]
  // Populated when a vision model is configured and reachable. Falls back to
  // heuristic subjectHint/mood otherwise.
  vision?: VisionInsight
}

export interface GeneratedCopy {
  headline: string
  caption: string
  cta: string
  hashtags: string[]
  score: number
  reason: string
  structure: string
  prompt: string
}

export interface CopyStrategy {
  goal: BusinessGoal
  persona: AudiencePersona
  /** Free-text category hint. Empty string = let the AI infer it from the image. */
  category: string
}

export type ComplianceKind = 'legal' | 'platform' | 'claim' | 'sensitive' | 'disclosure'

export type Severity = 'high' | 'medium' | 'low'

export type ComplianceLevel = 'safe' | 'caution' | 'risky'

/** A single flagged term inside a piece of copy. */
export interface ComplianceFinding {
  /** Stable id: rule id + offset, used as the v-for key. */
  id: string
  /** The exact text matched in the user's copy. */
  term: string
  kind: ComplianceKind
  severity: Severity
  /** Regulation or platform policy the finding is based on. */
  basis: string
  /** Human-readable explanation, in the UI language. */
  reason?: string
  /** Wording offered by the one-click fix. */
  suggestion: string
  /** Which layer of the engine produced it. */
  source: 'lexicon' | 'llm'
  /** Offsets into the original (non-normalized) copy. */
  start: number
  end: number
  /** Which copy field it sits in, when scanning a generated variant. */
  field?: 'headline' | 'caption' | 'cta' | 'hashtag'
}

export interface ComplianceReport {
  text: string
  /** 0-100 safety score, deducted from findings. */
  score: number
  level: ComplianceLevel
  findings: ComplianceFinding[]
  /** ai = lexical + semantic review, lexicon = rule library only. */
  mode: 'ai' | 'lexicon'
  note?: string
}

export interface SavedDesign {
  id: string
  title: string
  platformId: PlatformId
  marketId: MarketId
  layers: DesignLayer[]
  savedAt: string
}
