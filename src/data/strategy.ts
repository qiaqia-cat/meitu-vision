import type { AudiencePersona, BusinessGoal, MarketId, PlatformId } from '@/types/editor'

export const businessGoals: Array<{ id: BusinessGoal }> = [
  { id: 'awareness' },
  { id: 'engagement' },
  { id: 'conversion' },
  { id: 'retention' }
]

export const audiencePersonas: Array<{ id: AudiencePersona }> = [
  { id: 'creator' },
  { id: 'beautyBuyer' },
  { id: 'smallSeller' },
  { id: 'student' },
  { id: 'lifestyleUser' }
]

export const marketInsights: Record<MarketId, { hook: string; trustCue: string; avoid: string }> = {
  northAmerica: {
    hook: 'clear benefit, fast result, creator authenticity',
    trustCue: 'before-after clarity and practical use cases',
    avoid: 'overly decorative text without proof'
  },
  latinAmerica: {
    hook: 'warm emotion, social sharing, energetic deal language',
    trustCue: 'community tone and visible value',
    avoid: 'cold luxury language without approachability'
  },
  japanKorea: {
    hook: 'clean detail, subtle polish, soft beauty language',
    trustCue: 'precise visual quality and low-noise design',
    avoid: 'loud claims or cluttered layouts'
  },
  southeastAsia: {
    hook: 'mobile-first value, bright deal cues, fast transformation',
    trustCue: 'clear price/value signal and simple CTA',
    avoid: 'too much abstract branding'
  },
  europe: {
    hook: 'editorial quality, restraint, sustainability or craft detail',
    trustCue: 'specific material, process, or taste cue',
    avoid: 'aggressive hype or exaggerated urgency'
  }
}

export const platformPlaybooks: Record<PlatformId, { formula: string; winningPattern: string; risk: string }> = {
  tiktok: {
    formula: 'Hook + transformation + quick CTA',
    winningPattern: 'first 2 seconds must promise a visible result',
    risk: 'generic beautiful wording gets ignored'
  },
  instagramPost: {
    formula: 'Aesthetic headline + save-worthy caption + niche hashtags',
    winningPattern: 'polished visual identity and aspirational caption',
    risk: 'too many sales words reduce premium feel'
  },
  instagramStory: {
    formula: 'Short line + tap/swipe CTA + direct benefit',
    winningPattern: 'conversation tone and instant action',
    risk: 'small text near UI safe zones'
  },
  youtubeShorts: {
    formula: 'Curiosity headline + result reveal + watch CTA',
    winningPattern: 'thumbnail text must create a before-after question',
    risk: 'long captions do not read on mobile'
  },
  pinterest: {
    formula: 'Searchable title + evergreen idea + save CTA',
    winningPattern: 'keywords and inspiration language drive saves',
    risk: 'trend-only wording has short shelf life'
  },
  shopee: {
    formula: 'Product benefit + deal cue + buy CTA',
    winningPattern: 'price/value language and clear product promise',
    risk: 'pretty visuals without conversion signal'
  },
  etsy: {
    formula: 'Craft detail + uniqueness + explore CTA',
    winningPattern: 'story, material, and niche identity build trust',
    risk: 'mass-market wording weakens handmade value'
  }
}
