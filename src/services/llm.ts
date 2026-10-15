export interface LLMMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface LLMUsageInfo {
  model: string
  promptTokens?: number
  completionTokens?: number
}

export class LLMError extends Error {
  readonly kind: 'no-key' | 'network' | 'timeout' | 'api' | 'parse'

  constructor(kind: LLMError['kind'], message: string) {
    super(message)
    this.name = 'LLMError'
    this.kind = kind
  }
}

export function isLLMConfigured(): boolean {
  return typeof __LLM_ENABLED__ !== 'undefined' ? __LLM_ENABLED__ : false
}

export function isVisionConfigured(): boolean {
  return typeof __VISION_ENABLED__ !== 'undefined' ? __VISION_ENABLED__ : false
}

const TIMEOUT_MS = 45000

async function requestChat(messages: LLMMessage[], jsonMode: boolean): Promise<{ content: string; usage: LLMUsageInfo }> {
  if (!isLLMConfigured()) {
    throw new LLMError('no-key', 'DeepSeek API key is not configured.')
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

  let response: Response
  try {
    response = await fetch('/llm/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages,
        temperature: 0.8,
        ...(jsonMode ? { response_format: { type: 'json_object' } } : {})
      })
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new LLMError('timeout', 'LLM request timed out.')
    }
    throw new LLMError('network', error instanceof Error ? error.message : 'Network error.')
  } finally {
    clearTimeout(timer)
  }

  if (!response.ok) {
    let detail = `HTTP ${response.status}`
    try {
      const body = (await response.json()) as { error?: { message?: string } }
      if (body.error?.message) detail = body.error.message
    } catch {
      /* ignore body parse failure */
    }
    throw new LLMError('api', detail)
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>
    model?: string
    usage?: { prompt_tokens?: number; completion_tokens?: number }
  }

  const content = data.choices?.[0]?.message?.content
  if (!content) {
    throw new LLMError('parse', 'Empty response from model.')
  }

  return {
    content,
    usage: {
      model: data.model ?? 'deepseek-chat',
      promptTokens: data.usage?.prompt_tokens,
      completionTokens: data.usage?.completion_tokens
    }
  }
}

export async function chatJSON<T>(messages: LLMMessage[]): Promise<T> {
  const { content } = await requestChat(messages, true)

  const cleaned = content
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim()

  try {
    return JSON.parse(cleaned) as T
  } catch {
    throw new LLMError('parse', 'Model returned invalid JSON.')
  }
}

export async function chatText(messages: LLMMessage[]): Promise<string> {
  const { content } = await requestChat(messages, false)
  return content
}

// --- Vision (Zhipu GLM-4V) --------------------------------------------------

export interface VisionPayload {
  subject: string
  scene: string
  mood: string
  productType: string
  sellingPoints: string[]
  keywords: string[]
}

const VISION_MODEL = 'glm-4v-flash'
const VISION_PROMPT =
  'You are a marketing image analyst. Look at the image carefully and return strict JSON: ' +
  '{"subject":"<what is shown, ≤12 words, specific>","scene":"<where/when, ≤12 words>","mood":"<3-5 words>","productType":"<one short category>","sellingPoints":["<3-5 short phrases>"],"keywords":["<5-8 single-word SEO tags>"]}. ' +
  'Be specific to what you see (object, animal, food, person, product). No generic filler.'

interface VisionRawResponse {
  choices?: Array<{ message?: { content?: string } }>
  model?: string
}

/**
 * Send an image to GLM-4V and parse a marketing-oriented description.
 * Returns null when no key is set or the call fails — callers should fall
 * back to the heuristic insight rather than throwing.
 */
export async function analyzeImageWithVision(imageDataUrl: string): Promise<VisionPayload | null> {
  if (!isVisionConfigured()) return null

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 60000)

  let response: Response
  try {
    response = await fetch('/vision/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        model: VISION_MODEL,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'image_url', image_url: { url: imageDataUrl } },
              { type: 'text', text: VISION_PROMPT }
            ]
          }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.4
      })
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      console.warn('[vision] request timed out')
    } else {
      console.warn('[vision] network error', error)
    }
    return null
  } finally {
    clearTimeout(timer)
  }

  if (!response.ok) {
    console.warn('[vision] HTTP', response.status, await response.text().catch(() => ''))
    return null
  }

  const data = (await response.json()) as VisionRawResponse
  const content = data.choices?.[0]?.message?.content
  if (!content) return null

  try {
    const cleaned = content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
    const parsed = JSON.parse(cleaned) as Record<string, unknown>
    return {
      subject: String(parsed.subject ?? '').slice(0, 200).trim(),
      scene: String(parsed.scene ?? '').slice(0, 200).trim(),
      mood: String(parsed.mood ?? '').slice(0, 120).trim(),
      productType: String(parsed.productType ?? '').slice(0, 80).trim(),
      sellingPoints: Array.isArray(parsed.sellingPoints)
        ? parsed.sellingPoints.slice(0, 6).map((item) => String(item).slice(0, 80))
        : [],
      keywords: Array.isArray(parsed.keywords)
        ? parsed.keywords.slice(0, 10).map((item) => String(item).slice(0, 40))
        : []
    }
  } catch (error) {
    console.warn('[vision] failed to parse JSON', error)
    return null
  }
}
