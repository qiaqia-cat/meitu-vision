import type { DesignLayer, PlatformTemplate } from '@/types/editor'

const MIN_FONT = 16
const MAX_FONT = 120

function clampFont(size: number) {
  return Math.max(MIN_FONT, Math.min(MAX_FONT, Math.round(size)))
}

export function reflowLayerToPlatform(layer: DesignLayer, from: PlatformTemplate, to: PlatformTemplate): DesignLayer {
  if (layer.type === 'image') {
    return {
      ...layer,
      x: 0,
      y: 0,
      width: to.width,
      height: to.height
    }
  }

  const widthScale = to.width / from.width
  const heightScale = to.height / from.height
  const nextFontSize = clampFont((layer.fontSize ?? 28) * widthScale)

  let x = (layer.x / from.width) * to.width
  let y = (layer.y / from.height) * to.height

  if (layer.id === 'headline' || layer.id === 'caption') {
    y = Math.max(to.safeTop + nextFontSize, Math.min(y, to.height - to.safeBottom - nextFontSize * 1.5))
    x = Math.min(Math.max(x, to.width * 0.06), to.width * 0.7)
  } else {
    x = Math.min(Math.max(x, 0), Math.max(0, to.width - 120))
    y = Math.min(Math.max(y, to.safeTop * 0.5), to.height - 80)
  }

  return {
    ...layer,
    x: Math.round(x),
    y: Math.round(y),
    fontSize: nextFontSize,
    width: layer.width ? Math.round(layer.width * widthScale) : undefined
  }
}

export function reflowLayersToPlatform(layers: DesignLayer[], from: PlatformTemplate, to: PlatformTemplate): DesignLayer[] {
  return layers.map((layer) => reflowLayerToPlatform(layer, from, to))
}

export function estimateLayerHeight(layer: DesignLayer): number {
  if (layer.type === 'image') return layer.height ?? 0
  const fontSize = layer.fontSize ?? 28
  return fontSize * 1.4
}
