import type { ImageInsight, QuietZone } from '@/types/editor'

export interface QuietZonePlatform {
  width: number
  height: number
  safeTop: number
  safeBottom: number
}

function toHex(value: number) {
  return value.toString(16).padStart(2, '0')
}

export function analyzeImage(src: string): Promise<ImageInsight> {
  return new Promise((resolve) => {
    const image = new Image()
    image.onload = () => {
      const canvas = document.createElement('canvas')
      const size = 80
      canvas.width = size
      canvas.height = size
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        resolve(createFallbackInsight())
        return
      }

      ctx.drawImage(image, 0, 0, size, size)
      const data = ctx.getImageData(0, 0, size, size).data
      let red = 0
      let green = 0
      let blue = 0
      let count = 0

      for (let index = 0; index < data.length; index += 16) {
        red += data[index]
        green += data[index + 1]
        blue += data[index + 2]
        count += 1
      }

      red = Math.round(red / count)
      green = Math.round(green / count)
      blue = Math.round(blue / count)

      const luminance = 0.299 * red + 0.587 * green + 0.114 * blue
      const brightness = luminance > 178 ? 'bright' : luminance < 88 ? 'dark' : 'balanced'
      const temperature = red - blue > 24 ? 'warm' : blue - red > 24 ? 'cool' : 'neutral'
      const ratio = image.width / image.height
      const orientation = ratio > 1.15 ? 'landscape' : ratio < 0.85 ? 'portrait' : 'square'
      const dominantColor = `#${toHex(red)}${toHex(green)}${toHex(blue)}`

      resolve({
        brightness,
        temperature,
        orientation,
        dominantColor,
        mood: buildMood(brightness, temperature),
        subjectHint: buildSubjectHint(orientation, brightness)
      })
    }
    image.onerror = () => resolve(createFallbackInsight())
    image.src = src
  })
}

function buildMood(brightness: ImageInsight['brightness'], temperature: ImageInsight['temperature']) {
  if (brightness === 'bright' && temperature === 'warm') return 'sunny and energetic'
  if (brightness === 'bright' && temperature === 'cool') return 'clean and fresh'
  if (brightness === 'dark') return 'cinematic and premium'
  if (temperature === 'warm') return 'friendly and inviting'
  if (temperature === 'cool') return 'modern and calm'
  return 'balanced and versatile'
}

function buildSubjectHint(orientation: ImageInsight['orientation'], brightness: ImageInsight['brightness']) {
  if (orientation === 'portrait') return 'creator portrait or vertical product shot'
  if (orientation === 'landscape') return 'lifestyle scene or campaign banner'
  if (brightness === 'bright') return 'clean product or beauty visual'
  return 'social cover visual'
}

function createFallbackInsight(): ImageInsight {
  return {
    brightness: 'balanced',
    temperature: 'neutral',
    orientation: 'square',
    dominantColor: '#64748b',
    mood: 'balanced and versatile',
    subjectHint: 'social cover visual'
  }
}

const QUIET_GRID = 32
const QUIET_SAMPLE = 128

function luminanceAt(data: Uint8ClampedArray, width: number, x: number, y: number) {
  const index = (y * width + x) * 4
  return 0.299 * data[index] + 0.587 * data[index + 1] + 0.114 * data[index + 2]
}

function computeQuietZones(image: HTMLImageElement, platform: QuietZonePlatform): QuietZone[] {
  const canvas = document.createElement('canvas')
  canvas.width = QUIET_SAMPLE
  canvas.height = QUIET_SAMPLE
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return []

  ctx.drawImage(image, 0, 0, QUIET_SAMPLE, QUIET_SAMPLE)
  const { data } = ctx.getImageData(0, 0, QUIET_SAMPLE, QUIET_SAMPLE)

  const cell = QUIET_SAMPLE / QUIET_GRID
  const energy: number[][] = []
  for (let gy = 0; gy < QUIET_GRID; gy += 1) {
    const row: number[] = []
    for (let gx = 0; gx < QUIET_GRID; gx += 1) {
      let sum = 0
      let count = 0
      const startX = gx * cell
      const startY = gy * cell
      for (let py = 0; py < cell; py += 1) {
        for (let px = 0; px < cell; px += 1) {
          const x = Math.min(QUIET_SAMPLE - 1, startX + px)
          const y = Math.min(QUIET_SAMPLE - 1, startY + py)
          const right = luminanceAt(data, QUIET_SAMPLE, Math.min(QUIET_SAMPLE - 1, x + 1), y)
          const down = luminanceAt(data, QUIET_SAMPLE, x, Math.min(QUIET_SAMPLE - 1, y + 1))
          const here = luminanceAt(data, QUIET_SAMPLE, x, y)
          sum += Math.abs(right - here) + Math.abs(down - here)
          count += 1
        }
      }
      row.push(count > 0 ? sum / count : 0)
    }
    energy.push(row)
  }

  const topFrac = platform.safeTop / platform.height
  const bottomFrac = platform.safeBottom / platform.height
  const winW = Math.round(QUIET_GRID * 0.68)
  const winH = Math.max(4, Math.round(QUIET_GRID * 0.13))
  const gyMin = Math.max(0, Math.ceil(QUIET_GRID * topFrac))
  const gyMax = Math.min(QUIET_GRID - winH, Math.floor(QUIET_GRID * (1 - bottomFrac)))

  if (gyMax < gyMin) return []

  interface Candidate {
    gx: number
    gy: number
    mean: number
  }
  const candidates: Candidate[] = []
  for (let gy = gyMin; gy <= gyMax; gy += 1) {
    for (let gx = 0; gx <= QUIET_GRID - winW; gx += 2) {
      let sum = 0
      for (let wy = gy; wy < gy + winH; wy += 1) {
        for (let wx = gx; wx < gx + winW; wx += 1) {
          sum += energy[wy][wx]
        }
      }
      candidates.push({ gx, gy, mean: sum / (winW * winH) })
    }
  }

  if (candidates.length === 0) return []
  candidates.sort((a, b) => a.mean - b.mean)

  const cellW = platform.width / QUIET_GRID
  const cellH = platform.height / QUIET_GRID
  const headlineFontSize = Math.max(28, Math.min(72, Math.round(platform.width / 13)))
  const captionFontSize = Math.max(18, Math.round(headlineFontSize * 0.55))

  const toZone = (candidate: Candidate, fontSize: number): QuietZone => ({
    x: Math.round(candidate.gx * cellW + cellW),
    y: Math.round(candidate.gy * cellH),
    width: Math.round(winW * cellW - cellW * 2),
    height: Math.round(winH * cellH),
    fontSize
  })

  const headlineCandidate = candidates[0]
  const headlineZone = toZone(headlineCandidate, headlineFontSize)

  const captionCandidate = candidates.find((item) => {
    const overlapX = Math.max(0, Math.min(item.gx + winW, headlineCandidate.gx + winW) - Math.max(item.gx, headlineCandidate.gx))
    const overlapY = Math.max(0, Math.min(item.gy + winH, headlineCandidate.gy + winH) - Math.max(item.gy, headlineCandidate.gy))
    return overlapX * overlapY === 0
  })

  const captionZone = captionCandidate
    ? toZone(captionCandidate, captionFontSize)
    : {
        x: headlineZone.x,
        y: headlineZone.y + headlineZone.height + headlineFontSize * 0.6,
        width: headlineZone.width,
        height: headlineZone.height,
        fontSize: captionFontSize
      }

  return [headlineZone, captionZone]
}

export function findQuietZones(src: string, platform: QuietZonePlatform): Promise<QuietZone[]> {
  return new Promise((resolve) => {
    const image = new Image()
    image.onload = () => {
      try {
        resolve(computeQuietZones(image, platform))
      } catch {
        resolve([])
      }
    }
    image.onerror = () => resolve([])
    image.src = src
  })
}
