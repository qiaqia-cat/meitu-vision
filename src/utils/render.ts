import type { DesignLayer } from '@/types/editor'

export interface RenderTarget {
  width: number
  height: number
  accent: string
  marketColors: string[]
}

const imageCache = new Map<string, HTMLImageElement>()

let measureCanvas: HTMLCanvasElement | null = null
function getMeasureCtx(): CanvasRenderingContext2D | null {
  if (!measureCanvas) measureCanvas = document.createElement('canvas')
  return measureCanvas.getContext('2d')
}

function splitTextTokens(text: string): string[] {
  const tokens: string[] = []
  let buffer = ''
  for (const char of text) {
    if (/[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/.test(char)) {
      if (buffer) {
        tokens.push(buffer)
        buffer = ''
      }
      tokens.push(char)
    } else if (char === '\n') {
      if (buffer) {
        tokens.push(buffer)
        buffer = ''
      }
      tokens.push('\n')
    } else if (char === ' ' || char === '\t') {
      if (buffer) {
        tokens.push(buffer)
        buffer = ''
      }
    } else {
      buffer += char
    }
  }
  if (buffer) tokens.push(buffer)
  return tokens
}

function wrapTextLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const tokens = splitTextTokens(text)
  const lines: string[] = []
  let line = ''
  for (const token of tokens) {
    if (token === '\n') {
      lines.push(line)
      line = ''
      continue
    }
    const testLine = line ? `${line} ${token}` : token
    if (ctx.measureText(testLine).width > maxWidth && line) {
      lines.push(line)
      line = token
    } else {
      line = testLine
    }
  }
  lines.push(line)
  return lines.length > 0 ? lines : ['']
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve) => {
    const cached = imageCache.get(src)
    if (cached) {
      resolve(cached)
      return
    }
    const img = new Image()
    img.onload = () => {
      imageCache.set(src, img)
      resolve(img)
    }
    img.onerror = () => resolve(img)
    img.src = src
  })
}

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.arcTo(x + width, y, x + width, y + height, radius)
  ctx.arcTo(x + width, y + height, x, y + height, radius)
  ctx.arcTo(x, y + height, x, y, radius)
  ctx.arcTo(x, y, x + width, y, radius)
  ctx.closePath()
}

function drawBackground(ctx: CanvasRenderingContext2D, target: RenderTarget) {
  const gradient = ctx.createLinearGradient(0, 0, target.width, target.height)
  gradient.addColorStop(0, target.marketColors[0])
  gradient.addColorStop(0.55, '#ffffff')
  gradient.addColorStop(1, `${target.accent}33`)
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, target.width, target.height)

  ctx.fillStyle = `${target.accent}24`
  ctx.beginPath()
  ctx.ellipse(target.width * 0.82, target.height * 0.22, target.width * 0.28, target.height * 0.18, -0.25, 0, Math.PI * 2)
  ctx.fill()

  ctx.fillStyle = '#111827'
  ctx.globalAlpha = 0.08
  ctx.fillRect(target.width * 0.08, target.height * 0.12, target.width * 0.42, 10)
  ctx.fillRect(target.width * 0.08, target.height * 0.12 + 26, target.width * 0.32, 10)
  ctx.globalAlpha = 1
}

async function drawLayer(ctx: CanvasRenderingContext2D, layer: DesignLayer, target: RenderTarget) {
  ctx.save()
  ctx.globalAlpha = layer.opacity
  ctx.translate(layer.x, layer.y)
  ctx.rotate((layer.rotation * Math.PI) / 180)

  if (layer.type === 'image' && layer.imageSrc) {
    const img = await loadImage(layer.imageSrc)
    const width = layer.width ?? target.width
    const height = layer.height ?? target.height
    const imageRatio = img.width / img.height
    const canvasRatio = width / height
    let sx = 0
    let sy = 0
    let sw = img.width
    let sh = img.height

    if (imageRatio > canvasRatio) {
      sw = img.height * canvasRatio
      sx = (img.width - sw) / 2
    } else {
      sh = img.width / canvasRatio
      sy = (img.height - sh) / 2
    }
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, width, height)
  }

  if (layer.type === 'text') {
    const fontSize = layer.fontSize ?? 28
    ctx.font = `${layer.fontStyle ?? 'normal'} ${fontSize}px Inter, Arial, sans-serif`
    ctx.fillStyle = layer.fill ?? '#111827'
    ctx.shadowColor = 'rgba(15, 23, 42, 0.28)'
    ctx.shadowBlur = 18
    ctx.shadowOffsetY = 8
    const maxWidth = layer.width && layer.width > 0 ? layer.width : target.width * 0.76
    const lines = wrapTextLines(ctx, layer.text ?? '', maxWidth)
    lines.forEach((line, index) => {
      ctx.fillText(line, 0, index * fontSize * 1.18)
    })
  }

  if (layer.type === 'sticker') {
    const text = layer.text ?? 'NEW'
    const fontSize = layer.fontSize ?? 30
    ctx.font = `700 ${fontSize}px Inter, Arial, sans-serif`
    const metrics = ctx.measureText(text)
    const boxWidth = metrics.width + 34
    const boxHeight = fontSize + 24
    ctx.fillStyle = layer.fill ?? target.accent
    roundedRect(ctx, 0, -fontSize, boxWidth, boxHeight, 18)
    ctx.fill()
    ctx.fillStyle = '#ffffff'
    ctx.fillText(text, 17, 8)
  }

  ctx.restore()
}

export async function renderLayersToCanvas(layers: DesignLayer[], target: RenderTarget, scale = 1): Promise<HTMLCanvasElement> {
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(target.width * scale)
  canvas.height = Math.round(target.height * scale)
  const ctx = canvas.getContext('2d')
  if (!ctx) return canvas

  ctx.setTransform(scale, 0, 0, scale, 0, 0)
  drawBackground(ctx, target)
  for (const layer of layers) {
    await drawLayer(ctx, layer, target)
  }
  return canvas
}

export async function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      resolve(blob ?? new Blob())
    }, 'image/png')
  })
}

export function measureLayerTextWidth(text: string, fontSize: number, fontStyle = 'normal') {
  const ctx = getMeasureCtx()
  if (!ctx) return text.length * fontSize * 0.58
  ctx.font = `${fontStyle} ${fontSize}px Inter, Arial, sans-serif`
  return ctx.measureText(text).width
}
