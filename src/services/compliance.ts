import { chatJSON, isLLMConfigured, LLMError } from '@/services/llm'
import { rulesFor } from '@/data/complianceRules'
import { i18n } from '@/i18n'
import type {
  ComplianceFinding,
  ComplianceLevel,
  ComplianceReport,
  MarketId,
  PlatformId,
  Severity
} from '@/types/editor'

export interface ComplianceContext {
  platformId: PlatformId
  marketId: MarketId
  platformName: string
  marketName: string
  /** Free-text category, may be empty. */
  category: string
}

const UI_LANGUAGE_LABEL: Record<string, string> = {
  en: 'English',
  es: 'Spanish',
  ja: 'Japanese',
  ko: 'Korean',
  zh: 'Simplified Chinese'
}

const SEVERITY_WEIGHT: Record<Severity, number> = {
  high: 18,
  medium: 7,
  low: 2
}

const SEVERITY_RANK: Record<Severity, number> = {
  low: 0,
  medium: 1,
  high: 2
}

/**
 * Lower-case and fold full-width ASCII (Ａ → A) while keeping a strict 1:1
 * character mapping, so offsets stay valid against the original text.
 */
function normalize(text: string): string {
  let out = ''
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index)
    if (code >= 0xff01 && code <= 0xff5e) {
      out += String.fromCharCode(code - 0xfee0)
    } else {
      out += text[index].toLowerCase()
    }
  }
  return out
}

/** Substring match that tolerates the exception words sitting next to a hit. */
function isExcepted(text: string, exceptions: string[] | undefined, start: number): boolean {
  if (!exceptions?.length) return false
  return exceptions.some((word) => text.startsWith(word, start) || (start > 0 && text.startsWith(word, start - 1)))
}

/** Drop overlapping hits, keeping the more severe one. */
function dedupe(findings: ComplianceFinding[]): ComplianceFinding[] {
  const sorted = [...findings].sort(
    (a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] || a.start - b.start
  )
  const kept: ComplianceFinding[] = []
  for (const finding of sorted) {
    const overlaps = kept.some((other) => finding.start < other.end && other.start < finding.end)
    if (!overlaps) kept.push(finding)
  }
  return kept.sort((a, b) => a.start - b.start)
}

/**
 * Layer 1 — local rule library.
 * Zero latency, works with no API key, and returns exact offsets for highlighting.
 */
export function scanLocal(text: string, context: ComplianceContext): ComplianceFinding[] {
  if (!text.trim()) return []

  const normalized = normalize(text)
  const findings: ComplianceFinding[] = []

  for (const rule of rulesFor(context.marketId, context.platformId)) {
    const flags = rule.pattern.flags.includes('g') ? rule.pattern.flags : `${rule.pattern.flags}g`
    const regex = new RegExp(rule.pattern.source, flags)
    let match = regex.exec(normalized)

    while (match !== null) {
      if (match[0].length === 0) {
        regex.lastIndex += 1
        match = regex.exec(normalized)
        continue
      }

      const start = match.index
      const end = start + match[0].length

      if (!isExcepted(text, rule.exceptions, start)) {
        findings.push({
          id: `${rule.id}@${start}`,
          term: text.slice(start, end),
          kind: rule.kind,
          severity: rule.severity,
          basis: rule.basis,
          suggestion: rule.suggestion,
          source: 'lexicon',
          start,
          end
        })
      }

      match = regex.exec(normalized)
    }
  }

  return dedupe(findings)
}

// --- Layer 2: semantic review ----------------------------------------------

interface LLMAuditPayload {
  findings?: Array<{
    term?: unknown
    severity?: unknown
    basis?: unknown
    reason?: unknown
    suggestion?: unknown
  }>
}

const AUDIT_CACHE = new Map<string, ComplianceFinding[]>()
const AUDIT_CACHE_LIMIT = 60

function toSeverity(value: unknown): Severity {
  const raw = typeof value === 'string' ? value.toLowerCase().trim() : ''
  if (raw === 'high' || raw === 'medium' || raw === 'low') return raw
  return 'medium'
}

function cacheKey(text: string, context: ComplianceContext): string {
  return `${context.marketId}|${context.platformId}|${normalize(text)}`
}

function remember(key: string, findings: ComplianceFinding[]): ComplianceFinding[] {
  if (AUDIT_CACHE.size >= AUDIT_CACHE_LIMIT) {
    const oldest = AUDIT_CACHE.keys().next().value
    if (oldest !== undefined) AUDIT_CACHE.delete(oldest)
  }
  AUDIT_CACHE.set(key, findings)
  return findings
}

/**
 * Layer 2 — DeepSeek semantic review.
 *
 * Catches what a word list cannot: implied efficacy, unsubstantiated
 * comparisons, and promises that only read as safe in isolation.
 * Returns null on any failure (no key, timeout, bad JSON) so callers can
 * silently fall back to Layer 1.
 */
export async function auditWithLLM(text: string, context: ComplianceContext): Promise<ComplianceFinding[] | null> {
  if (!isLLMConfigured()) return null

  const cached = AUDIT_CACHE.get(cacheKey(text, context))
  if (cached) return cached

  const uiLanguage = UI_LANGUAGE_LABEL[i18n.global.locale.value as string] ?? 'English'

  const system = [
    `You are an advertising compliance reviewer for the ${context.marketName} market,`,
    `publishing on ${context.platformName}. You know local advertising law, consumer-protection rules`,
    'and that platform community policy.',
    'Flag only wording that is objectively risky: unsubstantiated superlatives, medical or health',
    'efficacy claims, guaranteed financial outcomes, regulated or restricted categories, missing ad',
    'disclosure, or platform-policy violations.',
    'Ignore subjective opinion and ordinary marketing enthusiasm.',
    'Reply with strict JSON only:',
    `{"findings":[{"term":"<exact substring copied from the text>","severity":"high|medium|low","basis":"<rule or policy>","reason":"<one sentence in ${uiLanguage}>","suggestion":"<replacement wording, same language as the text>"}]}.`,
    'If the text is safe, return {"findings":[]}.'
  ].join(' ')

  const user = [
    `Product category: ${context.category.trim() || 'unspecified'}`,
    'Copy to review:',
    '"""',
    text,
    '"""'
  ].join('\n')

  try {
    const payload = await chatJSON<LLMAuditPayload>([
      { role: 'system', content: system },
      { role: 'user', content: user }
    ])

    const normalized = normalize(text)
    const findings: ComplianceFinding[] = (payload.findings ?? [])
      .slice(0, 12)
      .map((item, index): ComplianceFinding | null => {
        const term = typeof item.term === 'string' ? item.term.trim().slice(0, 60) : ''
        if (!term) return null

        const start = normalized.indexOf(normalize(term))
        const located = start >= 0
        return {
          id: `llm@${index}`,
          term: located ? text.slice(start, start + term.length) : term,
          kind: 'claim' as const,
          severity: toSeverity(item.severity),
          basis: typeof item.basis === 'string' && item.basis.trim() ? item.basis.trim().slice(0, 160) : 'Advertising standards review',
          reason: typeof item.reason === 'string' && item.reason.trim() ? item.reason.trim().slice(0, 200) : undefined,
          suggestion: typeof item.suggestion === 'string' && item.suggestion.trim() ? item.suggestion.trim().slice(0, 120) : '(reword the claim)',
          source: 'llm' as const,
          start: located ? start : 0,
          end: located ? start + term.length : 0
        }
      })
      .filter((item): item is ComplianceFinding => item !== null)

    return remember(cacheKey(text, context), findings)
  } catch (error) {
    if (!(error instanceof LLMError)) console.warn('[compliance] semantic review failed', error)
    return null
  }
}

// --- Merging & scoring ------------------------------------------------------

/**
 * Merge both layers. A semantic hit is dropped when it overlaps a lexical hit
 * or repeats the same wording, so the user never sees duplicate warnings.
 */
export function mergeFindings(local: ComplianceFinding[], semantic: ComplianceFinding[]): ComplianceFinding[] {
  const merged = [...local]

  for (const finding of semantic) {
    const duplicate = merged.some((other) => {
      const overlapsRange = finding.start < other.end && other.start < finding.end
      const left = other.term.toLowerCase()
      const right = finding.term.toLowerCase()
      return overlapsRange || left.includes(right) || right.includes(left)
    })
    if (!duplicate) merged.push(finding)
  }

  return merged.sort((a, b) => a.start - b.start)
}

function levelFor(score: number): ComplianceLevel {
  if (score >= 85) return 'safe'
  if (score >= 60) return 'caution'
  return 'risky'
}

export function scoreFindings(findings: ComplianceFinding[]): { score: number; level: ComplianceLevel } {
  const penalty = findings.reduce((total, finding) => total + SEVERITY_WEIGHT[finding.severity], 0)
  const score = Math.max(0, 100 - penalty)
  return { score, level: levelFor(score) }
}

/**
 * Full compliance pass: Layer 1 always runs, Layer 2 when a key exists.
 * Never throws — an unreachable model just downgrades the report to lexicon mode.
 */
export async function auditCopy(
  text: string,
  context: ComplianceContext,
  options: { useAI?: boolean } = {}
): Promise<ComplianceReport> {
  const local = scanLocal(text, context)
  const useAI = options.useAI !== false

  if (!useAI || !isLLMConfigured()) {
    const { score, level } = scoreFindings(local)
    return {
      text,
      score,
      level,
      findings: local,
      mode: 'lexicon',
      note: isLLMConfigured() ? undefined : 'no-key'
    }
  }

  const semantic = await auditWithLLM(text, context)
  if (!semantic) {
    const { score, level } = scoreFindings(local)
    return { text, score, level, findings: local, mode: 'lexicon', note: 'ai-unavailable' }
  }

  const findings = mergeFindings(local, semantic)
  const { score, level } = scoreFindings(findings)
  return { text, score, level, findings, mode: 'ai' }
}

/** Replace a flagged span with its suggested wording. */
export function applyFix(text: string, finding: ComplianceFinding): string {
  if (finding.end <= finding.start) return text
  return `${text.slice(0, finding.start)}${finding.suggestion}${text.slice(finding.end)}`
}

/** Render the copy with <mark> around flagged spans — used by the panel preview. */
export function highlightSegments(
  text: string,
  findings: ComplianceFinding[]
): Array<{ text: string; flagged: boolean; severity: Severity | null }> {
  const segments: Array<{ text: string; flagged: boolean; severity: Severity | null }> = []
  let cursor = 0

  for (const finding of findings) {
    if (finding.end <= finding.start || finding.start < cursor) continue
    if (finding.start > cursor) {
      segments.push({ text: text.slice(cursor, finding.start), flagged: false, severity: null })
    }
    segments.push({ text: text.slice(finding.start, finding.end), flagged: true, severity: finding.severity })
    cursor = finding.end
  }

  if (cursor < text.length) {
    segments.push({ text: text.slice(cursor), flagged: false, severity: null })
  }

  return segments
}
