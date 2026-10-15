import type { ComplianceKind, MarketId, PlatformId, Severity } from '@/types/editor'

/**
 * A single compliance rule.
 *
 * `pattern` is a non-global RegExp; the engine clones it with the `g` flag each
 * pass so `lastIndex` never leaks between scans.
 *
 * `markets` / `platforms` narrow when a rule applies — an empty list means the
 * rule is universal. This is what lets the same word be legal in one market and
 * risky in another.
 *
 * `exceptions` guards against the classic substring false positive: 第一 is an
 * absolute claim, but 第一天 / 第一次 is not.
 */
export interface ComplianceRule {
  id: string
  kind: ComplianceKind
  severity: Severity
  pattern: RegExp
  /** Regulation / policy the rule comes from. */
  basis: string
  /** Replacement wording offered by the one-click fix. */
  suggestion: string
  markets?: MarketId[]
  platforms?: PlatformId[]
  exceptions?: string[]
}

export const complianceRules: ComplianceRule[] = [
  // --- Absolute superiority (EN) -------------------------------------------
  {
    id: 'en-absolute',
    kind: 'legal',
    severity: 'high',
    pattern: /\b(?:100\s*%|world'?s best|best in the world|number one|#1|no\.?\s*1|the best|perfect|flawless|unbeatable)\b/i,
    basis: 'FTC / ASA — unsubstantiated absolute superiority claim',
    suggestion: 'a top pick',
    markets: ['northAmerica', 'europe', 'southeastAsia']
  },
  {
    id: 'en-guarantee',
    kind: 'legal',
    severity: 'high',
    pattern: /\b(?:guaranteed?|guarantee(?:d)? results?|100\s*%\s*guaranteed)\b/i,
    basis: 'FTC — outcome guarantee without evidence',
    suggestion: 'designed to',
    markets: ['northAmerica', 'europe']
  },

  // --- Health & medical claims (EN) ----------------------------------------
  {
    id: 'en-medical',
    kind: 'claim',
    severity: 'high',
    pattern: /\b(?:cure|cures|curing|heal|heals|healing|treats?|treating|treatment|anti-?aging|clinically proven|fda[\s-]?approved|medical grade|therapeutic|removes? wrinkles?)\b/i,
    basis: 'FTC health claim rules / EU 655/2013 — efficacy claim needs proof',
    suggestion: 'helps improve the look of'
  },
  {
    id: 'en-side-effect',
    kind: 'claim',
    severity: 'high',
    pattern: /\b(?:no side effects?|side[- ]effect free|zero irritation guaranteed)\b/i,
    basis: 'EU 655/2013 — absolute safety claim is not permitted',
    suggestion: 'gentle on skin'
  },

  // --- Instant / permanent promises ----------------------------------------
  {
    id: 'en-instant',
    kind: 'claim',
    severity: 'medium',
    pattern: /\b(?:instant(?:ly)?(?:\s+results?)?|permanent(?:ly)?|forever|lifetime|one[- ]time fix|never fades?)\b/i,
    basis: 'Advertising standards — over-promising duration or speed',
    suggestion: 'visible in about two weeks'
  },

  // --- Financial promises ---------------------------------------------------
  {
    id: 'en-financial',
    kind: 'legal',
    severity: 'high',
    pattern: /\b(?:guaranteed (?:income|returns?|profit)|risk[- ]free|zero risk|passive income|get rich|double your money|financial freedom)\b/i,
    basis: 'Consumer protection — misleading earnings claim',
    suggestion: 'extra income'
  },

  // --- Platform rules: brands & IP ------------------------------------------
  {
    id: 'platform-ip',
    kind: 'platform',
    severity: 'high',
    pattern: /\b(?:disney|harry potter|pok[eé]mon|sanrio|marvel|nike|adidas|louis vuitton|gucci|chanel|herm[eè]s|barbie|taylor swift)\b/i,
    basis: 'Etsy / Shopee IP policy — trademarked characters and brands',
    suggestion: '(use your own design name)',
    platforms: ['etsy', 'shopee']
  },

  // --- Platform rules: engagement bait & off-platform -----------------------
  {
    id: 'platform-bait',
    kind: 'platform',
    severity: 'medium',
    pattern: /\b(?:free followers?|buy (?:likes?|followers?)|follow for follow|f4f|like for like|follow loop)\b/i,
    basis: 'TikTok / Instagram community guidelines — engagement manipulation',
    suggestion: 'tap follow for weekly drops',
    platforms: ['tiktok', 'instagramPost', 'instagramStory', 'youtubeShorts']
  },
  {
    id: 'platform-offsite',
    kind: 'platform',
    severity: 'medium',
    pattern: /\b(?:whats\s?app|wechat|telegram|line id|dm me for (?:link|price)|contact me outside)\b/i,
    basis: 'Shopee / Etsy policy — diverting transactions off platform',
    suggestion: 'order through the store',
    platforms: ['shopee', 'etsy']
  },

  // --- Restricted categories ------------------------------------------------
  {
    id: 'sensitive-category',
    kind: 'sensitive',
    severity: 'high',
    pattern: /\b(?:casino|betting|gambling|vape|sexual enhancement|weight loss pill|miracle cure)\b/i,
    basis: 'Platform restricted / regulated categories — review before publishing',
    suggestion: '(reword without the regulated term)'
  },

  // --- China Advertising Law: absolute terms --------------------------------
  {
    id: 'zh-absolute',
    kind: 'legal',
    severity: 'high',
    pattern: /(?:第一|唯一|最佳|最优|最好|最强|最便宜|最先进|顶级|极品|国家级|世界级|绝对|100%|百分百|永久|永远)/,
    basis: '《广告法》第九条 — 禁用绝对化用语',
    suggestion: '广受欢迎',
    exceptions: ['第一天', '第一次', '第一批', '第一时间', '第一眼', '第一步', '第一口', '第一站']
  },
  {
    id: 'zh-price',
    kind: 'legal',
    severity: 'high',
    pattern: /(?:全网最低|全网最便宜|史上最低|全网独家)/,
    basis: '《广告法》第九条 — 禁用绝对化价格宣称',
    suggestion: '价格更友好'
  },

  // --- China Advertising Law: medical efficacy ------------------------------
  {
    id: 'zh-medical',
    kind: 'claim',
    severity: 'high',
    pattern: /(?:治疗|治愈|根治|疗效|消炎|抗菌|杀菌|抗癌|祛痘|美白|减肥|瘦身|排毒|丰胸|壮阳|无副作用|不反弹|药效|疗效显著)/,
    basis: '《广告法》第十七条 — 非医疗广告不得涉及疾病治疗功能',
    suggestion: '帮助改善外观'
  },

  // --- China Advertising Law: earnings & superstition -----------------------
  {
    id: 'zh-earning',
    kind: 'legal',
    severity: 'high',
    pattern: /(?:保本|稳赚|零风险|躺赚|月入过万|包赚|稳赢|无风险)/,
    basis: '《广告法》第二十五条 — 禁止对未来收益作保证性承诺',
    suggestion: '有机会获得额外收入'
  },
  {
    id: 'zh-superstition',
    kind: 'sensitive',
    severity: 'medium',
    pattern: /(?:风水|转运|辟邪|旺财|开光|招财进宝)/,
    basis: '《广告法》第九条 — 不得含有迷信内容',
    suggestion: '带来好心情'
  },

  // --- Japan 薬機法 (japanKorea) --------------------------------------------
  {
    id: 'jp-yakki',
    kind: 'legal',
    severity: 'high',
    pattern: /(?:効く|治る|完治|美白|痩せる|アンチエイジング|医療用|医薬品|副作用なし|絶対に効く)/,
    basis: '薬機法 — 医薬品的な効能表現は不可',
    suggestion: 'うるおいを保つ',
    markets: ['japanKorea']
  },

  // --- EU cosmetic & green claims (europe) ----------------------------------
  {
    id: 'eu-cosmetic',
    kind: 'legal',
    severity: 'high',
    pattern: /\b(?:dermatologically tested|hypoallergenic|clinically tested|medical device|organic certified)\b/i,
    basis: 'EU 655/2013 — claim must be backed by documented evidence',
    suggestion: 'tested in our studio',
    markets: ['europe']
  },
  {
    id: 'eu-green',
    kind: 'legal',
    severity: 'medium',
    pattern: /\b(?:eco[- ]friendly|100\s*%\s*green|carbon neutral|chemical[- ]free|non[- ]toxic)\b/i,
    basis: 'EU Green Claims Directive — vague environmental claims are restricted',
    suggestion: 'made with recycled paper packaging',
    markets: ['europe']
  },

  // --- LatAm Spanish exaggeration ------------------------------------------
  {
    id: 'es-exaggeration',
    kind: 'legal',
    severity: 'high',
    pattern: /\b(?:el mejor|la mejor|100\s*%\s*garantizado|milagros[oa]|cura definitiva|sin riesgo|ingresos garantizados)\b/i,
    basis: 'Normas de publicidad engañosa LatAm — promesa sin respaldo',
    suggestion: 'una excelente opción',
    markets: ['latinAmerica']
  },
  {
    id: 'es-medical',
    kind: 'claim',
    severity: 'high',
    pattern: /\b(?:cura|sana|elimina arrugas|rejuveneced?or|antienvejecimiento)\b/i,
    basis: 'Normas sanitarias LatAm — afirmación de eficacia requiere registro',
    suggestion: 'mejora la apariencia de',
    markets: ['latinAmerica']
  }
]

/**
 * Rules that apply to a given market + platform pair.
 * Universal rules (no market/platform restriction) are always included.
 */
export function rulesFor(marketId: MarketId, platformId: PlatformId): ComplianceRule[] {
  return complianceRules.filter((rule) => {
    const marketOk = !rule.markets || rule.markets.includes(marketId)
    const platformOk = !rule.platforms || rule.platforms.includes(platformId)
    return marketOk && platformOk
  })
}
