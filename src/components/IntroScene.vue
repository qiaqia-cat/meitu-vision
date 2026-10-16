<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import * as THREE from 'three'

const emit = defineEmits<{
  enter: []
}>()

const { t, locale } = useI18n()

const canvasRef = ref<HTMLCanvasElement | null>(null)
const headlineRef = ref<HTMLElement | null>(null)
let renderer: THREE.WebGLRenderer | null = null
let scene: THREE.Scene | null = null
let camera: THREE.PerspectiveCamera | null = null
let animationId = 0
let headlineObserver: ResizeObserver | null = null
const cards: THREE.Mesh[] = []
const platforms = ['TikTok', 'Instagram Post', 'Instagram Story', 'YouTube Shorts', 'Pinterest', 'Shopee', 'Etsy']

const HEADLINE_MIN_FONT = 24

/**
 * Keep the landing headline on one line in every locale: measure the real
 * text width (the centered overflow makes scrollWidth useless here), scale
 * the font down to fit, and fall back to balanced wrapping if even the
 * minimum size cannot fit.
 */
function fitHeadline() {
  const el = headlineRef.value
  if (!el) return
  el.style.fontSize = ''
  el.style.whiteSpace = 'nowrap'
  el.style.removeProperty('text-wrap')
  const base = parseFloat(getComputedStyle(el).fontSize)
  const avail = el.clientWidth
  if (!avail) return
  el.style.width = 'max-content'
  let textW = el.getBoundingClientRect().width
  if (textW > avail + 1) {
    let size = Math.max(HEADLINE_MIN_FONT, Math.floor(base * (avail / textW)))
    el.style.fontSize = `${size}px`
    while (el.getBoundingClientRect().width > avail + 1 && size > HEADLINE_MIN_FONT) {
      size -= 1
      el.style.fontSize = `${size}px`
    }
    textW = el.getBoundingClientRect().width
  }
  el.style.width = ''
  if (textW > avail + 1) {
    el.style.whiteSpace = 'normal'
    el.style.setProperty('text-wrap', 'balance')
  }
}

function createTextTexture(title: string, subtitle = 'localized visual') {
  const canvas = document.createElement('canvas')
  canvas.width = 768
  canvas.height = 1056
  const ctx = canvas.getContext('2d')
  if (!ctx) return new THREE.CanvasTexture(canvas)

  const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height)
  gradient.addColorStop(0, '#ff4fa3')
  gradient.addColorStop(0.48, '#111118')
  gradient.addColorStop(1, '#f8c5dc')
  ctx.fillStyle = gradient
  roundRect(ctx, 0, 0, canvas.width, canvas.height, 54)
  ctx.fill()

  ctx.strokeStyle = 'rgba(255,255,255,0.38)'
  ctx.lineWidth = 9
  roundRect(ctx, 28, 28, canvas.width - 56, canvas.height - 56, 44)
  ctx.stroke()

  ctx.fillStyle = 'rgba(255,255,255,0.12)'
  ctx.beginPath()
  ctx.arc(602, 210, 148, 0, Math.PI * 2)
  ctx.fill()

  ctx.fillStyle = '#fff7fb'
  ctx.font = '700 74px Inter, Arial, sans-serif'
  wrapCanvasText(ctx, title, 80, 420, 610, 88)

  ctx.fillStyle = '#ffd7e8'
  ctx.font = '500 34px Inter, Arial, sans-serif'
  ctx.fillText(subtitle.toUpperCase(), 84, 725)

  ctx.fillStyle = '#ffffff'
  ctx.font = '700 42px Inter, Arial, sans-serif'
  ctx.fillText('MEITU VISION', 84, 900)

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 8
  return texture
}

function createWordmarkTexture() {
  const canvas = document.createElement('canvas')
  canvas.width = 1024
  canvas.height = 512
  const ctx = canvas.getContext('2d')
  if (!ctx) return new THREE.CanvasTexture(canvas)

  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.fillStyle = 'rgba(255, 79, 163, 0.16)'
  ctx.beginPath()
  ctx.ellipse(512, 256, 405, 138, 0, 0, Math.PI * 2)
  ctx.fill()

  ctx.strokeStyle = 'rgba(255, 215, 232, 0.62)'
  ctx.lineWidth = 5
  ctx.beginPath()
  ctx.ellipse(512, 256, 420, 150, 0, 0, Math.PI * 2)
  ctx.stroke()

  ctx.fillStyle = '#fff7fb'
  ctx.font = '800 118px Inter, Arial, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('MEITU', 512, 238)

  ctx.fillStyle = '#ff9ec8'
  ctx.font = '500 30px Inter, Arial, sans-serif'
  ctx.fillText('AI VISUAL LOCALIZATION', 512, 342)

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.arcTo(x + width, y, x + width, y + height, radius)
  ctx.arcTo(x + width, y + height, x, y + height, radius)
  ctx.arcTo(x, y + height, x, y, radius)
  ctx.arcTo(x, y, x + width, y, radius)
  ctx.closePath()
}

function wrapCanvasText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number) {
  const words = text.split(' ')
  let line = ''
  let currentY = y
  words.forEach((word, index) => {
    const next = line ? `${line} ${word}` : word
    if (ctx.measureText(next).width > maxWidth && index > 0) {
      ctx.fillText(line, x, currentY)
      line = word
      currentY += lineHeight
    } else {
      line = next
    }
  })
  ctx.fillText(line, x, currentY)
}

function resize() {
  if (!renderer || !camera || !canvasRef.value) return
  const width = canvasRef.value.clientWidth
  const height = canvasRef.value.clientHeight
  renderer.setSize(width, height, false)
  camera.aspect = width / height
  camera.updateProjectionMatrix()
  fitHeadline()
}

function initScene() {
  if (!canvasRef.value) return
  scene = new THREE.Scene()
  scene.fog = new THREE.Fog('#050508', 8, 18)

  camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100)
  camera.position.set(0, 0.35, 10.5)

  renderer = new THREE.WebGLRenderer({
    canvas: canvasRef.value,
    antialias: true,
    alpha: true,
    preserveDrawingBuffer: true
  })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.outputColorSpace = THREE.SRGBColorSpace

  const ambient = new THREE.AmbientLight('#ffc4dd', 1.8)
  scene.add(ambient)

  const key = new THREE.PointLight('#ff4fa3', 90, 18)
  key.position.set(2.8, 3, 5)
  scene.add(key)

  const rim = new THREE.PointLight('#ffffff', 35, 14)
  rim.position.set(-3.5, -1, 4)
  scene.add(rim)

  const wordmark = new THREE.Mesh(
    new THREE.PlaneGeometry(4.6, 2.3),
    new THREE.MeshBasicMaterial({
      map: createWordmarkTexture(),
      transparent: true
    })
  )
  wordmark.position.set(0, 0.1, 0)
  scene.add(wordmark)

  rebuildCards()

  resize()
  animate()
}

function rebuildCards() {
  const activeScene = scene
  if (!activeScene) return
  // dispose existing
  for (const card of cards) {
    activeScene.remove(card)
    card.geometry.dispose()
    const mat = card.material as THREE.MeshStandardMaterial
    mat.map?.dispose()
    mat.dispose()
  }
  cards.length = 0

  const radius = 4.65
  platforms.forEach((platform, index) => {
    const angle = (index / platforms.length) * Math.PI * 2
    const texture = createTextTexture(platform, index > 4 ? 'commerce template' : 'social template')
    const card = new THREE.Mesh(
      new THREE.PlaneGeometry(1.48, 2.04),
      new THREE.MeshStandardMaterial({
        map: texture,
        roughness: 0.52,
        metalness: 0.18,
        side: THREE.DoubleSide
      })
    )
    card.position.set(Math.cos(angle) * radius, Math.sin(angle) * 0.92, Math.sin(angle) * radius)
    card.rotation.set(-0.08, -angle + Math.PI / 2, Math.sin(angle) * 0.18)
    card.userData.baseAngle = angle
    cards.push(card)
    activeScene.add(card)
  })
}

function updateHeadlineGlow(event: MouseEvent) {
  if (!headlineRef.value) return
  const rect = headlineRef.value.getBoundingClientRect()
  const x = ((event.clientX - rect.left) / rect.width) * 100
  const y = ((event.clientY - rect.top) / rect.height) * 100
  headlineRef.value.style.setProperty('--mx', `${Math.max(0, Math.min(100, x))}%`)
  headlineRef.value.style.setProperty('--my', `${Math.max(0, Math.min(100, y))}%`)
}

function animate() {
  if (!renderer || !scene || !camera) return
  const time = performance.now() * 0.00042
  cards.forEach((card, index) => {
    const angle = card.userData.baseAngle + time
    const radius = 4.65
    card.position.x = Math.cos(angle) * radius
    card.position.z = Math.sin(angle) * radius
    card.position.y = Math.sin(angle * 1.3 + index) * 0.35
    card.rotation.y = -angle + Math.PI / 2
    card.rotation.z = Math.sin(angle * 1.2) * 0.22
  })
  renderer.render(scene, camera)
  animationId = requestAnimationFrame(animate)
}

onMounted(() => {
  initScene()
  fitHeadline()
  window.addEventListener('resize', resize)
  window.addEventListener('mousemove', updateHeadlineGlow)
  // webfont metrics differ from the fallback, refit once fonts are ready
  if (document.fonts?.ready) {
    void document.fonts.ready.then(fitHeadline)
  }
  headlineObserver = new ResizeObserver(fitHeadline)
  if (headlineRef.value) {
    headlineObserver.observe(headlineRef.value)
  }
})

watch(locale, () => {
  void nextTick(fitHeadline)
})

onBeforeUnmount(() => {
  cancelAnimationFrame(animationId)
  window.removeEventListener('resize', resize)
  window.removeEventListener('mousemove', updateHeadlineGlow)
  headlineObserver?.disconnect()
  headlineObserver = null
  renderer?.dispose()
  cards.splice(0, cards.length)
})
</script>

<template>
  <section class="intro-shell">
    <canvas ref="canvasRef" class="intro-canvas" />
    <h1 ref="headlineRef" class="intro-headline">{{ t('intro.headline') }}</h1>
    <div class="intro-content">
      <p>{{ t('intro.subtitle') }}</p>
      <button @click="emit('enter')">{{ t('intro.enter') }}</button>
    </div>
  </section>
</template>
