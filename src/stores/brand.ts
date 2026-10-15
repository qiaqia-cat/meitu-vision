import { ref } from 'vue'
import { defineStore } from 'pinia'
import { getBrandRecord, saveBrandRecord } from '@/utils/idb'
import { useEditorStore } from '@/stores/editor'
import { i18n } from '@/i18n'
import type { DesignLayer } from '@/types/editor'

const BRAND_RECORD_ID = 'current-brand-kit'

export interface BrandKit {
  brandName: string
  colors: [string, string, string]
  logoDataUrl: string
}

const t = i18n.global.t

function defaultKit(): BrandKit {
  return {
    brandName: 'MEITU VISION',
    colors: ['#111827', '#2563eb', '#ff4fa3'],
    logoDataUrl: ''
  }
}

export const useBrandStore = defineStore('brand', () => {
  const kit = ref<BrandKit>(defaultKit())
  const loaded = ref(false)
  const appliedAt = ref(0)

  async function load() {
    const stored = await getBrandRecord<BrandKit>(BRAND_RECORD_ID)
    if (stored) {
      kit.value = { ...defaultKit(), ...stored }
    }
    loaded.value = true
  }

  async function save() {
    await saveBrandRecord({ id: BRAND_RECORD_ID, value: kit.value })
  }

  function applyToLayers(layers: DesignLayer[]): DesignLayer[] {
    const [primary, secondary, accent] = kit.value.colors
    const next = layers.map((layer) => {
      if (layer.type !== 'text') return layer
      if (layer.id === 'headline') return { ...layer, fill: primary }
      if (layer.id === 'caption') return { ...layer, fill: secondary }
      return layer
    })

    const logoLayer: DesignLayer = {
      id: `brand-logo-${Date.now()}`,
      type: 'sticker',
      name: t('brand.logoLayerName'),
      x: 40,
      y: 40,
      rotation: 0,
      text: kit.value.brandName,
      fontSize: 26,
      fill: accent,
      opacity: 1
    }

    return [...next.filter((layer) => !layer.id.startsWith('brand-logo-')), logoLayer]
  }

  async function apply() {
    const editor = useEditorStore()
    const withoutOldLogo = editor.layers.filter((layer) => !layer.id.startsWith('brand-logo-'))
    editor.layers = applyToLayers(withoutOldLogo)
    appliedAt.value = Date.now()
  }

  return { kit, loaded, appliedAt, load, save, apply }
})
