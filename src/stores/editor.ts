import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { marketProfiles, platformTemplates } from '@/data/templates'
import type {
  AudiencePersona,
  BusinessGoal,
  ComplianceFinding,
  ComplianceReport,
  CopyStrategy,
  DesignLayer,
  GeneratedCopy,
  ImageInsight,
  MarketId,
  PlatformId,
  QuietZone,
  SavedDesign
} from '@/types/editor'
import { generateCopy, generateCopyVariants, generateLLMCopyVariants } from '@/utils/prompt'
import { analyzeImage, findQuietZones } from '@/utils/imageAnalysis'
import { analyzeImageWithVision, isLLMConfigured, isVisionConfigured } from '@/services/llm'
import { applyFix, auditCopy, scanLocal, scoreFindings } from '@/services/compliance'
import type { ComplianceContext } from '@/services/compliance'
import { getDesigns, saveDesign } from '@/utils/idb'
import { i18n } from '@/i18n'

const t = i18n.global.t

const initialLayers: DesignLayer[] = [
  {
    id: 'headline',
    type: 'text',
    name: t('layer.headline'),
    x: 80,
    y: 140,
    rotation: 0,
    text: t('canvas.sampleHeadline'),
    fontSize: 48,
    fill: '#ffffff',
    fontStyle: 'bold',
    opacity: 1
  },
  {
    id: 'caption',
    type: 'text',
    name: t('layer.caption'),
    x: 84,
    y: 240,
    rotation: 0,
    text: t('canvas.sampleCaption'),
    fontSize: 24,
    fill: '#f8fafc',
    opacity: 0.94
  }
]

export const useEditorStore = defineStore('editor', () => {
  const platformId = ref<PlatformId>('tiktok')
  const marketId = ref<MarketId>('northAmerica')
  const layers = ref<DesignLayer[]>(structuredClone(initialLayers))
  const selectedLayerId = ref('headline')
  const savedDesigns = ref<SavedDesign[]>([])
  const imageSrc = ref('')
  const imageInsight = ref<ImageInsight | null>(null)
  const generatedCopy = ref<GeneratedCopy | null>(null)
  const copyVariants = ref<GeneratedCopy[]>([])
  const copyStrategy = ref<CopyStrategy>({
    goal: 'conversion',
    persona: 'smallSeller',
    category: ''
  })
  const copyLoading = ref(false)
  const copyMode = ref<'idle' | 'llm' | 'offline'>('idle')

  // --- Compliance guard ----------------------------------------------------
  const complianceInput = ref('')
  const complianceReport = ref<ComplianceReport | null>(null)
  const complianceBusy = ref(false)
  const complianceNote = ref<'idle' | 'no-key' | 'ai-unavailable'>('idle')
  /** Per-variant report, index-aligned with copyVariants. */
  const variantReports = ref<ComplianceReport[]>([])

  const platform = computed(() => platformTemplates.find((item) => item.id === platformId.value) ?? platformTemplates[0])
  const market = computed(() => marketProfiles.find((item) => item.id === marketId.value) ?? marketProfiles[0])
  const selectedLayer = computed(() => layers.value.find((layer) => layer.id === selectedLayerId.value) ?? null)

  /** Everything the compliance engine needs to pick the right rule set. */
  const complianceContext = computed<ComplianceContext>(() => ({
    platformId: platformId.value,
    marketId: marketId.value,
    platformName: t(`platforms.${platformId.value}.name`),
    marketName: t(`markets.${marketId.value}.name`),
    category: copyStrategy.value.category
  }))
  // stageScale is a writable ref so App.vue can drive it from the actual
  // canvas-wrap size (and a ResizeObserver). The 0.4 default is a sane
  // fallback before the first measurement.
  const stageScale = ref(0.4)
  const stageWidth = computed(() => platform.value.width * stageScale.value)
  const stageHeight = computed(() => platform.value.height * stageScale.value)

  function setStageScale(value: number) {
    const clamped = Math.max(0.05, Math.min(2, value))
    // Avoid triggering watchers if the value didn't actually change.
    if (Math.abs(stageScale.value - clamped) > 0.001) {
      stageScale.value = clamped
    }
  }

  function setPlatform(id: PlatformId) {
    platformId.value = id
  }

  function setMarket(id: MarketId) {
    marketId.value = id
    const palette = market.value.colors
    layers.value = layers.value.map((layer) => {
      if (layer.type !== 'text') return layer
      if (layer.id === 'headline') return { ...layer, fill: palette[1] }
      if (layer.id === 'caption') return { ...layer, fill: palette[2] }
      return layer
    })
  }

  async function setImage(src: string) {
    imageSrc.value = src
    imageInsight.value = await analyzeImage(src)
    const zones = await findQuietZones(src, platform.value)
    if (imageInsight.value) {
      imageInsight.value.quietZones = zones
    }
    const imageLayer: DesignLayer = {
      id: 'image',
      type: 'image',
      name: t('layer.image'),
      x: 0,
      y: 0,
      width: platform.value.width,
      height: platform.value.height,
      rotation: 0,
      imageSrc: src,
      opacity: 1
    }
    layers.value = [imageLayer, ...layers.value.filter((layer) => layer.id !== 'image')]
    // Kick off vision enrichment in the background if a vision model is
    // configured. We don't block the UI on it — the user can already keep
    // editing while the model "looks" at the picture.
    if (isVisionConfigured()) {
      try {
        const vision = await analyzeImageWithVision(src)
        if (vision && imageInsight.value) {
          imageInsight.value.vision = { ...vision, source: 'llm' }
          // Replace the heuristic subject/mood with the model's view — it's
          // strictly more informative than the brightness-based guess.
          if (vision.subject) imageInsight.value.subjectHint = vision.subject
          if (vision.mood) imageInsight.value.mood = vision.mood
        }
      } catch (error) {
        console.warn('[setImage] vision enrichment failed', error)
      }
    }
  }

  function addSticker(text: string) {
    const layer: DesignLayer = {
      id: crypto.randomUUID(),
      type: 'sticker',
      name: t('layer.stickerName', { text }),
      x: platform.value.width - 220,
      y: 90,
      rotation: -5,
      text,
      fontSize: 30,
      fill: platform.value.accent,
      opacity: 1
    }
    layers.value.push(layer)
    selectedLayerId.value = layer.id
  }

  function updateLayer(id: string, patch: Partial<DesignLayer>) {
    layers.value = layers.value.map((layer) => (layer.id === id ? { ...layer, ...patch } : layer))
  }

  function updateStrategy(patch: Partial<CopyStrategy>) {
    copyStrategy.value = { ...copyStrategy.value, ...patch }
  }

  function deleteLayer(id: string) {
    const target = layers.value.find((layer) => layer.id === id)
    if (!target) return
    layers.value = layers.value.filter((layer) => layer.id !== id)
    if (target.type === 'image') {
      imageSrc.value = ''
      imageInsight.value = null
    }
    selectedLayerId.value = layers.value.find((layer) => layer.type !== 'image')?.id ?? layers.value[0]?.id ?? ''
  }

  function applyCopyToLayers(copy: GeneratedCopy) {
    updateLayer('headline', { text: copy.headline })
    updateLayer('caption', { text: copy.caption })
    const imageLayer = layers.value.find((layer) => layer.id === 'image')
    if (imageLayer && imageInsight.value?.quietZones) {
      placeTextInQuietZones(imageInsight.value.quietZones)
    }
  }

  async function applyAiCopy() {
    copyLoading.value = true
    let variants: GeneratedCopy[]
    if (isLLMConfigured()) {
      try {
        variants = await generateLLMCopyVariants(platform.value, market.value, imageInsight.value ?? undefined, copyStrategy.value)
        copyMode.value = 'llm'
      } catch {
        variants = generateCopyVariants(platform.value, market.value, imageInsight.value ?? undefined, copyStrategy.value)
        copyMode.value = 'offline'
      }
    } else {
      variants = generateCopyVariants(platform.value, market.value, imageInsight.value ?? undefined, copyStrategy.value)
      copyMode.value = 'offline'
    }
    copyVariants.value = variants
    const copy = variants[0] ?? generateCopy(platform.value, market.value, imageInsight.value ?? undefined, copyStrategy.value)
    generatedCopy.value = copy
    applyCopyToLayers(copy)
    copyLoading.value = false
    // Auto-scan the fresh variants with the local rule library only — it is
    // instant and free, and the manual panel is where the AI review happens.
    refreshVariantReports()
    return copy.prompt
  }

  // --- Compliance guard ----------------------------------------------------

  type VariantField = 'headline' | 'caption' | 'cta' | 'hashtag'

  interface VariantSegment {
    field: VariantField
    text: string
    start: number
  }

  function variantSegments(variant: GeneratedCopy): VariantSegment[] {
    const parts: Array<{ field: VariantField; text: string }> = [
      { field: 'headline', text: variant.headline },
      { field: 'caption', text: variant.caption },
      { field: 'cta', text: variant.cta },
      { field: 'hashtag', text: variant.hashtags.join(' ') }
    ]

    let cursor = 0
    return parts.map((part) => {
      const segment = { ...part, start: cursor }
      cursor += part.text.length + 1
      return segment
    })
  }

  function variantText(variant: GeneratedCopy): string {
    return variantSegments(variant)
      .map((segment) => segment.text)
      .join('\n')
  }

  /**
   * Scan every field of a variant separately so a finding knows which field to
   * patch, then rebase the offsets onto the combined text.
   */
  function scanVariant(variant: GeneratedCopy, context: ComplianceContext): ComplianceFinding[] {
    const findings: ComplianceFinding[] = []

    for (const segment of variantSegments(variant)) {
      if (!segment.text.trim()) continue
      for (const hit of scanLocal(segment.text, context)) {
        findings.push({
          ...hit,
          id: `${hit.id}:${segment.field}`,
          field: segment.field,
          start: segment.start + hit.start,
          end: segment.start + hit.end
        })
      }
    }

    return findings
  }

  function refreshVariantReports() {
    const context = complianceContext.value
    variantReports.value = copyVariants.value.map((variant) => {
      const findings = scanVariant(variant, context)
      const { score, level } = scoreFindings(findings)
      return { text: variantText(variant), score, level, findings, mode: 'lexicon' as const }
    })
  }

  /** Full manual pass: rules first, then DeepSeek semantic review. */
  async function runComplianceCheck() {
    const text = complianceInput.value.trim()
    if (!text) {
      complianceReport.value = null
      complianceNote.value = 'idle'
      return
    }

    complianceBusy.value = true
    try {
      const report = await auditCopy(complianceInput.value, complianceContext.value, { useAI: true })
      complianceReport.value = report
      complianceNote.value = report.mode === 'ai' ? 'idle' : report.note === 'no-key' ? 'no-key' : 'ai-unavailable'
    } finally {
      complianceBusy.value = false
    }
  }

  /** Drop the current variant's copy into the manual check box. */
  function fillFromCurrentCopy() {
    if (!generatedCopy.value) return
    complianceInput.value = variantText(generatedCopy.value)
    void runComplianceCheck()
  }

  function applyComplianceFix(finding: ComplianceFinding) {
    if (!complianceReport.value) return
    complianceInput.value = applyFix(complianceReport.value.text, finding)
    void runComplianceCheck()
  }

  /** Patch one field of a variant, then push it back onto the canvas. */
  function applyVariantFix(index: number, finding: ComplianceFinding) {
    const variant = copyVariants.value[index]
    if (!variant) return
    const segments = variantSegments(variant)
    const field = finding.field ?? 'headline'

    if (field === 'hashtag') {
      variant.hashtags = variant.hashtags.map((tag) => (tag === finding.term ? finding.suggestion : tag))
    } else {
      const segment = segments.find((item) => item.field === field)
      if (!segment) return
      variant[field] = applyFix(segment.text, {
        ...finding,
        start: finding.start - segment.start,
        end: finding.end - segment.start
      })
    }

    copyVariants.value = [...copyVariants.value]
    generatedCopy.value = variant
    applyCopyToLayers(variant)
    refreshVariantReports()
  }

  function applyCopyVariant(copy: GeneratedCopy) {
    generatedCopy.value = copy
    applyCopyToLayers(copy)
  }

  function placeTextInQuietZones(zones: QuietZone[]) {
    if (zones.length === 0) return
    const headlineZone = zones[0]
    const captionZone = zones[1] ?? zones[0]
    updateLayer('headline', {
      x: headlineZone.x,
      y: headlineZone.y,
      width: headlineZone.width,
      fontSize: headlineZone.fontSize
    })
    updateLayer('caption', {
      x: captionZone.x,
      y: captionZone.y,
      width: captionZone.width,
      fontSize: captionZone.fontSize
    })
  }

  async function persistDesign() {
    const design: SavedDesign = {
      id: crypto.randomUUID(),
      title: `${t(`markets.${marketId.value}.name`)} ${t(`platforms.${platformId.value}.name`)}`,
      platformId: platformId.value,
      marketId: marketId.value,
      layers: layers.value,
      savedAt: new Date().toISOString()
    }
    await saveDesign(design)
    savedDesigns.value = await getDesigns()
  }

  async function loadDesigns() {
    savedDesigns.value = await getDesigns()
  }

  function restoreDesign(design: SavedDesign) {
    platformId.value = design.platformId
    marketId.value = design.marketId
    layers.value = structuredClone(design.layers)
    selectedLayerId.value = design.layers.find((layer) => layer.type === 'text')?.id ?? design.layers[0]?.id ?? ''
  }

  return {
    platformId,
    marketId,
    layers,
    selectedLayerId,
    savedDesigns,
    imageSrc,
    imageInsight,
    generatedCopy,
    copyVariants,
    copyStrategy,
    copyLoading,
    copyMode,
    complianceInput,
    complianceReport,
    complianceBusy,
    complianceNote,
    variantReports,
    complianceContext,
    platform,
    market,
    selectedLayer,
    stageScale,
    stageWidth,
    stageHeight,
    setPlatform,
    setMarket,
    setStageScale,
    setImage,
    addSticker,
    updateLayer,
    updateStrategy,
    deleteLayer,
    applyAiCopy,
    applyCopyVariant,
    runComplianceCheck,
    refreshVariantReports,
    fillFromCurrentCopy,
    applyComplianceFix,
    applyVariantFix,
    persistDesign,
    loadDesigns,
    restoreDesign
  }
})
