<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'
import { marketProfiles, platformTemplates, stickers } from '@/data/templates'
import { audiencePersonas, businessGoals } from '@/data/strategy'
import { useEditorStore } from '@/stores/editor'
import { useBrandStore } from '@/stores/brand'
import { LOCALE_STORAGE_KEY, SUPPORTED_LOCALES, setLocale, type LocaleCode } from '@/i18n'
import type { PublicUser } from '@/types/auth'
import type { AudiencePersona, BusinessGoal, DesignLayer, MarketId, PlatformId } from '@/types/editor'
import { getSessionUser, logoutUser } from '@/utils/auth'
import AuthPanel from '@/components/AuthPanel.vue'
import IntroScene from '@/components/IntroScene.vue'
import MultiPlatformExport from '@/components/MultiPlatformExport.vue'
import CompliancePanel from '@/components/CompliancePanel.vue'

const { t, locale } = useI18n()

const editor = useEditorStore()
const {
  layers,
  selectedLayerId,
  selectedLayer,
  platform,
  market,
  platformId,
  marketId,
  savedDesigns,
  imageSrc,
  imageInsight,
  generatedCopy,
  copyVariants,
  copyStrategy,
  copyLoading,
  copyMode,
  stageScale,
  stageWidth,
  stageHeight
} = storeToRefs(editor)

const brand = useBrandStore()
const showMultiExport = ref(false)

const canvasRef = ref<HTMLCanvasElement | null>(null)
const fileInputRef = ref<HTMLInputElement | null>(null)
const promptText = ref('')
const hasEntered = ref(false)
const currentUser = ref<PublicUser | null>(null)
const isDragging = ref(false)
const interactionMode = ref<'move' | 'resize' | 'rotate' | null>(null)

// Guided workflow: 0 upload → 1 pick platform/market → 2 generate copy → 3 export.
const workflowStep = computed(() => {
  if (!imageSrc.value) return 0
  if (!generatedCopy.value) return 2
  return 3
})
const stepDone = computed(() => [
  Boolean(imageSrc.value),
  Boolean(imageSrc.value),
  Boolean(generatedCopy.value),
  false
])
const dragOffset = ref({ x: 0, y: 0 })
const transformStart = ref({
  x: 0,
  y: 0,
  width: 0,
  height: 0,
  fontSize: 0,
  rotation: 0,
  centerX: 0,
  centerY: 0
})
const imageCache = new Map<string, HTMLImageElement>()
const handleSize = 18
const selectionPadding = 8

// --- Off-screen canvas for text measurement (must match drawLayer fonts) ---
let measureCanvas: HTMLCanvasElement | null = null
function getMeasureCtx(): CanvasRenderingContext2D | null {
  if (!measureCanvas) measureCanvas = document.createElement('canvas')
  return measureCanvas.getContext('2d')
}

// --- Tokeniser that handles both space-separated and CJK text ---
function splitTextTokens(text: string): string[] {
  const tokens: string[] = []
  let buffer = ''
  for (const char of text) {
    if (/[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/.test(char)) {
      if (buffer) { tokens.push(buffer); buffer = '' }
      tokens.push(char)
    } else if (char === '\n') {
      if (buffer) { tokens.push(buffer); buffer = '' }
      tokens.push('\n')
    } else if (char === ' ' || char === '\t') {
      if (buffer) { tokens.push(buffer); buffer = '' }
    } else {
      buffer += char
    }
  }
  if (buffer) tokens.push(buffer)
  return tokens
}

// --- Shared line-breaking logic used by both measurement and drawing ---
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

interface LocalBounds {
  x: number
  y: number
  width: number
  height: number
}

// --- Bounds in the layer's local coordinate system (before translate/rotate) ---
function getLayerLocalBounds(layer: DesignLayer): LocalBounds {
  if (layer.type === 'image') {
    return {
      x: 0,
      y: 0,
      width: layer.width ?? platform.value.width,
      height: layer.height ?? platform.value.height
    }
  }

  if (layer.type === 'sticker') {
    const ctx = getMeasureCtx()
    const text = layer.text ?? 'NEW'
    const fontSize = layer.fontSize ?? 30
    let boxWidth = 92
    if (ctx) {
      ctx.font = `700 ${fontSize}px Inter, Arial, sans-serif`
      boxWidth = ctx.measureText(text).width + 34
    }
    const boxHeight = fontSize + 24
    return {
      x: -selectionPadding,
      y: -fontSize - selectionPadding,
      width: boxWidth + selectionPadding * 2,
      height: boxHeight + selectionPadding * 2
    }
  }

  // text layer
  const ctx = getMeasureCtx()
  const fontSize = layer.fontSize ?? 28
  const lineHeight = fontSize * 1.18
  const maxWidth = platform.value.width * 0.76
  let textWidth = 0
  let numLines = 1

  if (ctx) {
    ctx.font = `${layer.fontStyle ?? 'normal'} ${fontSize}px Inter, Arial, sans-serif`
    const lines = wrapTextLines(ctx, layer.text ?? '', maxWidth)
    numLines = Math.max(lines.length, 1)
    textWidth = Math.max(...lines.map((l) => ctx.measureText(l).width), 0)
  } else {
    textWidth = (layer.text?.length ?? 1) * fontSize * 0.58
  }

  return {
    x: -selectionPadding,
    y: -fontSize * 0.82 - selectionPadding,
    width: Math.max(textWidth, 40) + selectionPadding * 2,
    height: fontSize + lineHeight * (numLines - 1) + selectionPadding * 2
  }
}

// --- Coordinate transforms between layer-local and screen space ---
function layerLocalToScreen(layer: DesignLayer, lx: number, ly: number) {
  const rad = (layer.rotation * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  return {
    x: layer.x + lx * cos - ly * sin,
    y: layer.y + lx * sin + ly * cos
  }
}

function screenToLayerLocal(layer: DesignLayer, sx: number, sy: number) {
  const rad = (layer.rotation * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  const dx = sx - layer.x
  const dy = sy - layer.y
  return {
    x: dx * cos + dy * sin,
    y: -dx * sin + dy * cos
  }
}

const selectedText = computed({
  get: () => selectedLayer.value?.text ?? '',
  set: (value: string) => {
    if (selectedLayer.value) editor.updateLayer(selectedLayer.value.id, { text: value })
  }
})

const selectedFill = computed({
  get: () => selectedLayer.value?.fill ?? '#ffffff',
  set: (value: string) => {
    if (selectedLayer.value) editor.updateLayer(selectedLayer.value.id, { fill: value })
  }
})

const selectedFontSize = computed({
  get: () => selectedLayer.value?.fontSize ?? 24,
  set: (value: number) => {
    if (selectedLayer.value) editor.updateLayer(selectedLayer.value.id, { fontSize: Number(value) })
  }
})

const selectedOpacity = computed({
  get: () => Math.round((selectedLayer.value?.opacity ?? 1) * 100),
  set: (value: number) => {
    if (selectedLayer.value) editor.updateLayer(selectedLayer.value.id, { opacity: Number(value) / 100 })
  }
})

function resolvePoint(event: PointerEvent) {
  const canvas = canvasRef.value
  if (!canvas) return { x: 0, y: 0 }
  const rect = canvas.getBoundingClientRect()
  return {
    x: (event.clientX - rect.left) / stageScale.value,
    y: (event.clientY - rect.top) / stageScale.value
  }
}

function hitTest(point: { x: number; y: number }) {
  const ordered = [...layers.value].reverse()
  return ordered.find((layer) => {
    const lp = screenToLayerLocal(layer, point.x, point.y)
    const lb = getLayerLocalBounds(layer)
    return lp.x >= lb.x && lp.x <= lb.x + lb.width && lp.y >= lb.y && lp.y <= lb.y + lb.height
  })
}

function onPointerDown(event: PointerEvent) {
  const point = resolvePoint(event)
  if (selectedLayer.value) {
    const activeHandle = hitSelectionHandle(point, selectedLayer.value)
    if (activeHandle === 'delete') {
      editor.deleteLayer(selectedLayer.value.id)
      return
    }
    if (activeHandle === 'resize' || activeHandle === 'rotate') {
      interactionMode.value = activeHandle
      isDragging.value = true
      primeTransform(point, selectedLayer.value)
      canvasRef.value?.setPointerCapture(event.pointerId)
      return
    }
  }

  const layer = hitTest(point)
  if (!layer) return
  selectedLayerId.value = layer.id
  interactionMode.value = 'move'
  isDragging.value = true
  dragOffset.value = {
    x: point.x - layer.x,
    y: point.y - layer.y
  }
  canvasRef.value?.setPointerCapture(event.pointerId)
}

function onPointerMove(event: PointerEvent) {
  if (!isDragging.value || !selectedLayer.value) return
  const point = resolvePoint(event)

  if (interactionMode.value === 'move') {
    editor.updateLayer(selectedLayer.value.id, {
      x: Math.round(point.x - dragOffset.value.x),
      y: Math.round(point.y - dragOffset.value.y)
    })
  }

  if (interactionMode.value === 'resize') {
    resizeLayer(point, selectedLayer.value)
  }

  if (interactionMode.value === 'rotate') {
    rotateLayer(point, selectedLayer.value)
  }
}

function onPointerUp(event: PointerEvent) {
  isDragging.value = false
  interactionMode.value = null
  canvasRef.value?.releasePointerCapture(event.pointerId)
}

function getSelectionHandles(layer: DesignLayer) {
  const lb = getLayerLocalBounds(layer)
  const localCorners = {
    delete: { x: lb.x + lb.width, y: lb.y },
    rotate: { x: lb.x + lb.width / 2, y: lb.y - 36 },
    resize: { x: lb.x + lb.width, y: lb.y + lb.height }
  }
  return {
    delete: layerLocalToScreen(layer, localCorners.delete.x, localCorners.delete.y),
    rotate: layerLocalToScreen(layer, localCorners.rotate.x, localCorners.rotate.y),
    resize: layerLocalToScreen(layer, localCorners.resize.x, localCorners.resize.y),
    localBounds: lb
  }
}

function hitSelectionHandle(point: { x: number; y: number }, layer: DesignLayer) {
  const handles = getSelectionHandles(layer)
  const entries = [
    ['delete', handles.delete],
    ['rotate', handles.rotate],
    ['resize', handles.resize]
  ] as const
  const found = entries.find(([, handle]) => {
    return Math.hypot(point.x - handle.x, point.y - handle.y) <= handleSize
  })
  return found?.[0] ?? null
}

function primeTransform(point: { x: number; y: number }, layer: DesignLayer) {
  const lb = getLayerLocalBounds(layer)
  transformStart.value = {
    x: point.x,
    y: point.y,
    width: lb.width,
    height: lb.height,
    fontSize: layer.fontSize ?? 28,
    rotation: layer.rotation,
    centerX: layer.x,
    centerY: layer.y
  }
}

function resizeLayer(point: { x: number; y: number }, layer: DesignLayer) {
  const lp = screenToLayerLocal(layer, point.x, point.y)
  const lb = getLayerLocalBounds(layer)

  if (layer.type === 'image') {
    const nextWidth = Math.max(48, lp.x - lb.x)
    const nextHeight = Math.max(48, lp.y - lb.y)
    editor.updateLayer(layer.id, {
      width: Math.round(nextWidth),
      height: Math.round(nextHeight)
    })
    return
  }

  const nextWidth = Math.max(48, lp.x - lb.x)
  const nextHeight = Math.max(48, lp.y - lb.y)
  const widthRatio = nextWidth / Math.max(transformStart.value.width, 1)
  const heightRatio = nextHeight / Math.max(transformStart.value.height, 1)
  const ratio = Math.max(0.45, Math.min(2.8, (widthRatio + heightRatio) / 2))
  editor.updateLayer(layer.id, {
    fontSize: Math.round(transformStart.value.fontSize * ratio)
  })
}

function rotateLayer(point: { x: number; y: number }, layer: DesignLayer) {
  const startAngle = Math.atan2(transformStart.value.y - transformStart.value.centerY, transformStart.value.x - transformStart.value.centerX)
  const nextAngle = Math.atan2(point.y - transformStart.value.centerY, point.x - transformStart.value.centerX)
  const delta = ((nextAngle - startAngle) * 180) / Math.PI
  editor.updateLayer(layer.id, {
    rotation: Math.round(transformStart.value.rotation + delta)
  })
}

function onUpload(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = () => {
    void editor.setImage(String(reader.result))
  }
  reader.readAsDataURL(file)
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
    img.src = src
  })
}

function drawBackground(ctx: CanvasRenderingContext2D, width: number, height: number) {
  const gradient = ctx.createLinearGradient(0, 0, width, height)
  gradient.addColorStop(0, market.value.colors[0])
  gradient.addColorStop(0.55, '#ffffff')
  gradient.addColorStop(1, `${platform.value.accent}33`)
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, width, height)

  ctx.fillStyle = `${platform.value.accent}24`
  ctx.beginPath()
  ctx.ellipse(width * 0.82, height * 0.22, width * 0.28, height * 0.18, -0.25, 0, Math.PI * 2)
  ctx.fill()

  ctx.fillStyle = '#111827'
  ctx.globalAlpha = 0.08
  ctx.fillRect(width * 0.08, height * 0.12, width * 0.42, 10)
  ctx.fillRect(width * 0.08, height * 0.12 + 26, width * 0.32, 10)
  ctx.globalAlpha = 1
}

async function drawLayer(ctx: CanvasRenderingContext2D, layer: DesignLayer) {
  ctx.save()
  ctx.globalAlpha = layer.opacity
  ctx.translate(layer.x, layer.y)
  ctx.rotate((layer.rotation * Math.PI) / 180)

  if (layer.type === 'image' && layer.imageSrc) {
    const img = await loadImage(layer.imageSrc)
    const width = layer.width ?? platform.value.width
    const height = layer.height ?? platform.value.height
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
    ctx.font = `${layer.fontStyle ?? 'normal'} ${layer.fontSize ?? 28}px Inter, Arial, sans-serif`
    ctx.fillStyle = layer.fill ?? '#111827'
    ctx.shadowColor = 'rgba(15, 23, 42, 0.28)'
    ctx.shadowBlur = 18
    ctx.shadowOffsetY = 8
    wrapText(ctx, layer.text ?? '', 0, 0, platform.value.width * 0.76, (layer.fontSize ?? 28) * 1.18)
  }

  if (layer.type === 'sticker') {
    const text = layer.text ?? 'NEW'
    const fontSize = layer.fontSize ?? 30
    ctx.font = `700 ${fontSize}px Inter, Arial, sans-serif`
    const metrics = ctx.measureText(text)
    const boxWidth = metrics.width + 34
    const boxHeight = fontSize + 24
    ctx.fillStyle = layer.fill ?? platform.value.accent
    roundedRect(ctx, 0, -fontSize, boxWidth, boxHeight, 18)
    ctx.fill()
    ctx.fillStyle = '#ffffff'
    ctx.fillText(text, 17, 8)
  }

  ctx.restore()
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number) {
  const lines = wrapTextLines(ctx, text, maxWidth)
  lines.forEach((line, index) => {
    ctx.fillText(line, x, y + index * lineHeight)
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

async function renderCanvas(exportScale = stageScale.value, showEditorChrome = true) {
  const canvas = canvasRef.value
  if (!canvas) return
  const width = platform.value.width
  const height = platform.value.height
  canvas.width = width * exportScale
  canvas.height = height * exportScale
  canvas.style.width = `${width * stageScale.value}px`
  canvas.style.height = `${height * stageScale.value}px`
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  ctx.setTransform(exportScale, 0, 0, exportScale, 0, 0)
  ctx.clearRect(0, 0, width, height)
  drawBackground(ctx, width, height)
  for (const layer of layers.value) {
    await drawLayer(ctx, layer)
  }
  if (showEditorChrome) {
    drawSafeZone(ctx, width, height)
  }
  if (showEditorChrome && selectedLayer.value) {
    drawSelection(ctx, selectedLayer.value)
  }
}

function drawSafeZone(ctx: CanvasRenderingContext2D, width: number, height: number) {
  ctx.save()
  ctx.strokeStyle = `${platform.value.accent}99`
  ctx.setLineDash([16, 12])
  ctx.lineWidth = 3
  ctx.strokeRect(32, platform.value.safeTop, width - 64, height - platform.value.safeTop - platform.value.safeBottom)
  ctx.restore()
}

function drawSelection(ctx: CanvasRenderingContext2D, layer: DesignLayer) {
  const { localBounds: lb, delete: deleteHandle, rotate, resize } = getSelectionHandles(layer)
  ctx.save()

  // Draw dashed rect and rotate-line inside the layer's local coordinate system
  // so they follow translation AND rotation.
  ctx.translate(layer.x, layer.y)
  ctx.rotate((layer.rotation * Math.PI) / 180)

  ctx.strokeStyle = '#2563eb'
  ctx.fillStyle = '#ffffff'
  ctx.lineWidth = 3
  ctx.setLineDash([10, 8])
  ctx.strokeRect(lb.x, lb.y, lb.width, lb.height)
  ctx.setLineDash([])

  ctx.strokeStyle = '#2563eb'
  ctx.beginPath()
  ctx.moveTo(lb.x + lb.width / 2, lb.y)
  ctx.lineTo(lb.x + lb.width / 2, lb.y - 36)
  ctx.stroke()

  ctx.restore()

  // Handles are drawn in screen space so their labels stay upright.
  drawHandle(ctx, deleteHandle.x, deleteHandle.y, '#ef4444', 'x')
  drawHandle(ctx, rotate.x, rotate.y, '#2563eb', '↻')
  drawHandle(ctx, resize.x, resize.y, '#2563eb', '↘')
}

function drawHandle(ctx: CanvasRenderingContext2D, x: number, y: number, color: string, label: string) {
  ctx.save()
  ctx.fillStyle = color
  ctx.strokeStyle = '#ffffff'
  ctx.lineWidth = 4
  ctx.beginPath()
  ctx.arc(x, y, handleSize, 0, Math.PI * 2)
  ctx.fill()
  ctx.stroke()
  ctx.fillStyle = '#ffffff'
  ctx.font = '700 20px Inter, Arial, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(label, x, y - 1)
  ctx.restore()
}

async function exportPng() {
  await renderCanvas(1, false)
  const canvas = canvasRef.value
  if (!canvas) return
  const link = document.createElement('a')
  link.download = `meitu-vision-${platform.value.id}-${market.value.id}.png`
  link.href = canvas.toDataURL('image/png')
  link.click()
  await nextTick()
  await renderCanvas()
}

async function applyAiCopy() {
  promptText.value = await editor.applyAiCopy()
}

async function saveBrand() {
  await brand.save()
}

async function applyBrand() {
  await brand.apply()
}

function onAuthenticated(user: PublicUser) {
  currentUser.value = user
}

function logout() {
  logoutUser()
  currentUser.value = null
}

function changeLocale(next: LocaleCode) {
  setLocale(next)
}

// Re-fit the canvas stage to whatever space the canvas-wrap actually has
// available. Recomputed on mount, on window resize, and whenever the user
// switches platform (different aspect ratio → different fit).
const canvasWrapRef = ref<HTMLElement | null>(null)

function fitStage() {
  const wrap = canvasWrapRef.value
  if (!wrap) return
  // Leave room for canvas-wrap padding (12px each side, matches CSS).
  const PAD = 24
  const availW = Math.max(80, wrap.clientWidth - PAD)
  const availH = Math.max(80, wrap.clientHeight - PAD)
  if (availW <= 0 || availH <= 0) return
  const fit = Math.min(availW / platform.value.width, availH / platform.value.height, 1)
  editor.setStageScale(fit)
}

// Coalesce renderCanvas calls to one per animation frame. Drag updates the
// selected layer on every pointermove (60fps); without this guard we were
// calling renderCanvas 60 times/sec on top of a deep watch, which caused
// visible jitter when interacting with the stage.
let renderQueued = false
function scheduleRender() {
  if (renderQueued) return
  renderQueued = true
  requestAnimationFrame(() => {
    renderQueued = false
    void renderCanvas()
  })
}

watch([layers, platformId, marketId], scheduleRender, { deep: true })

// Re-fit on any meaningful layout change: window resize, panel toggle,
// language switch (step bar / button labels change width).
let resizeObserver: ResizeObserver | null = null
let windowResizeHandler: (() => void) | null = null

onMounted(async () => {
  currentUser.value = await getSessionUser()
  await editor.loadDesigns()
  await brand.load()
  fitStage()
  // Re-measure once after first paint in case fonts/loading changed the wrap.
  requestAnimationFrame(fitStage)
  if (canvasWrapRef.value && 'ResizeObserver' in window) {
    resizeObserver = new ResizeObserver(() => fitStage())
    resizeObserver.observe(canvasWrapRef.value)
  }
  windowResizeHandler = () => fitStage()
  window.addEventListener('resize', windowResizeHandler)
  await renderCanvas()
})

onBeforeUnmount(() => {
  if (resizeObserver) resizeObserver.disconnect()
  if (windowResizeHandler) window.removeEventListener('resize', windowResizeHandler)
})

// Platform switch → different aspect ratio → re-fit immediately so the new
// platform doesn't blow past the canvas-wrap before the next ResizeObserver tick.
watch(platformId, () => {
  fitStage()
})

// Quick sanity ref so the LOCALE_STORAGE_KEY import isn't tree-shaken
void LOCALE_STORAGE_KEY
void SUPPORTED_LOCALES
</script>

<template>
  <IntroScene v-if="!hasEntered" @enter="hasEntered = true" />
  <AuthPanel v-else-if="!currentUser" @authenticated="onAuthenticated" />
  <main v-else class="app-shell">
    <aside class="side-panel">
      <section class="brand">
        <div>
          <p>{{ t('common.appName') }}</p>
          <h1>{{ t('common.tagline') }}</h1>
        </div>
        <span class="brand-avatar">
          <img v-if="currentUser.avatarDataUrl" :src="currentUser.avatarDataUrl" alt="" />
          <strong v-else>{{ t('common.logoFallback') }}</strong>
        </span>
      </section>

      <section class="panel-section lang-section">
        <h2>{{ t('lang.label') }}</h2>
        <div class="lang-grid" role="radiogroup" :aria-label="t('lang.switchTitle')">
          <button
            v-for="code in SUPPORTED_LOCALES"
            :key="code"
            class="lang-pill"
            :class="{ active: locale === code }"
            role="radio"
            :aria-checked="locale === code"
            :title="t(`lang.${code}`)"
            @click="changeLocale(code)"
          >
            {{ t(`lang.${code}`) }}
          </button>
        </div>
      </section>

      <section class="panel-section">
        <h2>{{ t('section.platform') }}</h2>
        <div class="template-list">
          <button
            v-for="item in platformTemplates"
            :key="item.id"
            class="template-button"
            :class="{ active: item.id === platformId }"
            @click="editor.setPlatform(item.id as PlatformId)"
          >
            <span :style="{ backgroundColor: item.accent }"></span>
            <strong>{{ t(`platforms.${item.id}.name`) }}</strong>
            <small>{{ item.ratio }} · {{ t(`platforms.${item.id}.channel`) }}</small>
          </button>
        </div>
      </section>

      <section class="panel-section">
        <h2>{{ t('section.market') }}</h2>
        <div class="market-grid">
          <button
            v-for="item in marketProfiles"
            :key="item.id"
            :class="{ active: item.id === marketId }"
            @click="editor.setMarket(item.id as MarketId)"
          >
            {{ t(`markets.${item.id}.name`) }}
          </button>
        </div>
      </section>

      <section class="panel-section">
        <h2>{{ t('section.commercialStrategy') }}</h2>
        <label class="select-field">
          {{ t('field.goal') }}
          <select
            :value="copyStrategy.goal"
            @change="editor.updateStrategy({ goal: ($event.target as HTMLSelectElement).value as BusinessGoal })"
          >
            <option v-for="item in businessGoals" :key="item.id" :value="item.id">
              {{ t(`goals.${item.id}.name`) }} · {{ t(`goals.${item.id}.metric`) }}
            </option>
          </select>
        </label>
        <label class="select-field">
          {{ t('field.audience') }}
          <select
            :value="copyStrategy.persona"
            @change="editor.updateStrategy({ persona: ($event.target as HTMLSelectElement).value as AudiencePersona })"
          >
            <option v-for="item in audiencePersonas" :key="item.id" :value="item.id">
              {{ t(`personas.${item.id}`) }}
            </option>
          </select>
        </label>
        <label class="select-field">
          {{ t('field.category') }}
          <input
            class="category-input"
            type="text"
            :value="copyStrategy.category"
            :placeholder="t('field.categoryPlaceholder')"
            maxlength="40"
            @input="editor.updateStrategy({ category: ($event.target as HTMLInputElement).value })"
          />
          <small v-if="imageInsight?.vision?.productType" class="category-auto">
            {{ t('field.categoryAuto') }}{{ imageInsight.vision.productType }}
          </small>
          <small v-else class="category-auto muted">{{ t('field.categoryHint') }}</small>
        </label>
      </section>

      <section class="panel-section">
        <h2>{{ t('section.assets') }}</h2>
        <button class="primary-action" @click="fileInputRef?.click()">{{ t('action.uploadImage') }}</button>
        <input ref="fileInputRef" class="hidden-input" type="file" accept="image/*" @change="onUpload" />
        <div class="sticker-row">
          <button v-for="item in stickers" :key="item" @click="editor.addSticker(item)">
            {{ item }}
          </button>
        </div>
      </section>

      <section class="panel-section">
        <h2>{{ t('brand.section') }}</h2>
        <label class="select-field">
          {{ t('brand.brandName') }}
          <input v-model="brand.kit.brandName" />
        </label>
        <div class="brand-colors">
          <label v-for="(color, index) in brand.kit.colors" :key="index" class="brand-color-item">
            <input v-model="brand.kit.colors[index]" type="color" />
          </label>
        </div>
        <div class="brand-actions">
          <button class="primary-action" @click="applyBrand">{{ t('brand.apply') }}</button>
          <button @click="saveBrand">{{ t('brand.save') }}</button>
        </div>
      </section>
    </aside>

    <section class="workspace">
      <header class="topbar">
        <div>
          <p>{{ t(`markets.${marketId}.name`) }} · {{ t(`markets.${marketId}.tone`) }}</p>
          <h2>{{ t(`platforms.${platformId}.name`) }} <span>{{ platform.width }} × {{ platform.height }}</span></h2>
        </div>
        <div class="topbar-actions">
          <span class="user-chip">
            <img v-if="currentUser.avatarDataUrl" :src="currentUser.avatarDataUrl" alt="" />
            <strong v-else>{{ t('common.logoFallback') }}</strong>
            {{ currentUser.displayName }} · {{ currentUser.phone }}
          </span>
          <button class="primary-action" :disabled="copyLoading" @click="applyAiCopy">
            {{ copyLoading ? t('multi.generating') : t('action.generateCopy') }}
          </button>
          <button @click="showMultiExport = true">{{ t('action.multiExport') }}</button>
          <button @click="editor.persistDesign">{{ t('common.save') }}</button>
          <button class="dark-action" @click="exportPng">{{ t('action.exportPng') }}</button>
          <button @click="logout">{{ t('common.logout') }}</button>
        </div>
      </header>

      <ol class="step-bar">
        <li
          v-for="(label, index) in (['upload', 'market', 'copy', 'export'] as const)"
          :key="label"
          :class="{ done: stepDone[index], active: workflowStep === index }"
        >
          <span class="step-index">{{ stepDone[index] ? '✓' : index + 1 }}</span>
          {{ t(`steps.${label}`) }}
        </li>
      </ol>

      <div ref="canvasWrapRef" class="canvas-wrap">
        <div v-if="!imageSrc" class="canvas-empty">
          <span class="empty-badge">1</span>
          <h3>{{ t('canvas.emptyTitle') }}</h3>
          <p>{{ t('canvas.emptyHint') }}</p>
          <button class="primary-action" @click="fileInputRef?.click()">{{ t('action.uploadImage') }}</button>
        </div>
        <canvas
          ref="canvasRef"
          class="design-canvas"
          :style="{ width: `${stageWidth}px`, height: `${stageHeight}px` }"
          @pointerdown="onPointerDown"
          @pointermove="onPointerMove"
          @pointerup="onPointerUp"
        />
      </div>

      <footer class="prompt-strip">
        <strong>{{ t('prompt.label') }}</strong>
        <p>{{ promptText }}</p>
        <span v-if="copyMode === 'llm'" class="copy-mode-badge llm">{{ t('common.aiMode') }}</span>
        <span v-else-if="copyMode === 'offline'" class="copy-mode-badge offline">{{ t('common.offlineMode') }}</span>
        <span v-if="generatedCopy" class="copy-meta">
          {{ generatedCopy.cta }} · {{ generatedCopy.hashtags.join(' ') }}
        </span>
      </footer>
    </section>

    <aside class="side-panel right-panel">
      <section class="panel-section">
        <h2>{{ t('section.layer') }}</h2>
        <div v-if="selectedLayer" class="field-stack">
          <button
            v-if="selectedLayer.type !== 'image'"
            class="danger-action"
            @click="editor.deleteLayer(selectedLayer.id)"
          >
            {{ t('action.deleteLayer') }}
          </button>
          <label>
            {{ t('field.name') }}
            <input :value="selectedLayer.name" @input="editor.updateLayer(selectedLayer.id, { name: ($event.target as HTMLInputElement).value })" />
          </label>
          <label v-if="selectedLayer.type !== 'image'">
            {{ t('field.text') }}
            <textarea v-model="selectedText" rows="4" />
          </label>
          <label v-if="selectedLayer.type !== 'image'">
            {{ t('field.color') }}
            <input v-model="selectedFill" type="color" />
          </label>
          <label v-if="selectedLayer.type !== 'image'">
            {{ t('field.fontSize') }}
            <input v-model="selectedFontSize" type="range" min="16" max="96" />
          </label>
          <label>
            {{ t('field.opacity') }}
            <input v-model="selectedOpacity" type="range" min="20" max="100" />
          </label>
          <label>
            {{ t('field.rotation') }}
            <input
              :value="selectedLayer.rotation"
              type="range"
              min="-30"
              max="30"
              @input="editor.updateLayer(selectedLayer.id, { rotation: Number(($event.target as HTMLInputElement).value) })"
            />
          </label>
        </div>
      </section>

      <section class="panel-section">
        <h2>{{ t('section.imageInsight') }}</h2>
        <div v-if="imageInsight" class="insight-card">
          <span class="color-dot" :style="{ backgroundColor: imageInsight.dominantColor }"></span>
          <p><strong>{{ t('insight.mood') }}</strong>{{ imageInsight.mood }}</p>
          <p><strong>{{ t('insight.subject') }}</strong>{{ imageInsight.subjectHint }}</p>
          <p><strong>{{ t('insight.visual') }}</strong>{{ imageInsight.brightness }} · {{ imageInsight.temperature }} · {{ imageInsight.orientation }}</p>
          <template v-if="imageInsight.vision">
            <p class="vision-badge">
              <span class="vision-dot"></span>
              {{ t('insight.visionTag') }}
            </p>
            <p v-if="imageInsight.vision.scene"><strong>{{ t('insight.scene') }}</strong>{{ imageInsight.vision.scene }}</p>
            <p v-if="imageInsight.vision.sellingPoints.length">
              <strong>{{ t('insight.angles') }}</strong>{{ imageInsight.vision.sellingPoints.join(' · ') }}
            </p>
            <div v-if="imageInsight.vision.keywords.length" class="keyword-row">
              <span v-for="keyword in imageInsight.vision.keywords" :key="keyword" class="keyword-pill">
                {{ keyword }}
              </span>
            </div>
          </template>
        </div>
        <p v-else class="muted">{{ t('empty.noInsight') }}</p>
      </section>

      <section class="panel-section">
        <h2>{{ t('section.copy') }}</h2>
        <div class="copy-variant-list">
          <button v-for="copy in copyVariants" :key="copy.headline" @click="editor.applyCopyVariant(copy)">
            <span>{{ copy.score }}%</span>
            <strong>{{ copy.headline }}</strong>
            <small>{{ copy.structure }}</small>
            <em>{{ copy.reason }}</em>
          </button>
          <p v-if="!copyVariants.length" class="muted">{{ t('empty.noCopy') }}</p>
        </div>
      </section>

      <CompliancePanel />

      <section class="panel-section">
        <h2>{{ t('section.layers') }}</h2>
        <div class="layer-list">
          <button
            v-for="layer in [...layers].reverse()"
            :key="layer.id"
            :class="{ active: layer.id === selectedLayerId }"
            @click="selectedLayerId = layer.id"
          >
            <span>{{ layer.type }}</span>
            {{ layer.name }}
          </button>
        </div>
      </section>

      <section class="panel-section">
        <h2>{{ t('section.history') }}</h2>
        <div class="history-list">
          <button v-for="design in savedDesigns" :key="design.id" @click="editor.restoreDesign(design)">
            <strong>{{ design.title }}</strong>
            <small>{{ new Date(design.savedAt).toLocaleString() }}</small>
          </button>
          <p v-if="!savedDesigns.length" class="muted">{{ t('empty.noHistory') }}</p>
        </div>
      </section>
    </aside>

    <MultiPlatformExport v-if="showMultiExport" @close="showMultiExport = false" />
  </main>
</template>
