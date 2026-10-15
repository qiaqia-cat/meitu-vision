<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import JSZip from 'jszip'
import { marketProfiles, platformTemplates } from '@/data/templates'
import { useEditorStore } from '@/stores/editor'
import { reflowLayersToPlatform } from '@/utils/reflow'
import { canvasToPngBlob, renderLayersToCanvas } from '@/utils/render'
import type { MarketId, PlatformId } from '@/types/editor'

const { t } = useI18n()
const editor = useEditorStore()

const emit = defineEmits<{
  close: []
}>()

interface PreviewEntry {
  platformId: PlatformId
  url: string
}

const previews = ref<PreviewEntry[]>([])
const exporting = ref(false)
const exportDone = ref(false)

const previewScale = 0.22

onMounted(async () => {
  const entries: PreviewEntry[] = []
  for (const template of platformTemplates) {
    const layers = reflowLayersToPlatform(editor.layers, editor.platform, template)
    const canvas = await renderLayersToCanvas(layers, {
      width: template.width,
      height: template.height,
      accent: template.accent,
      marketColors: editor.market.colors
    }, previewScale)
    entries.push({ platformId: template.id, url: canvas.toDataURL('image/png') })
  }
  previews.value = entries
})

async function exportSingle(platformId: PlatformId) {
  const template = platformTemplates.find((item) => item.id === platformId)
  if (!template) return
  const layers = reflowLayersToPlatform(editor.layers, editor.platform, template)
  const canvas = await renderLayersToCanvas(layers, {
    width: template.width,
    height: template.height,
    accent: template.accent,
    marketColors: editor.market.colors
  })
  const link = document.createElement('a')
  link.download = `meitu-vision-${platformId}-${editor.marketId}.png`
  link.href = canvas.toDataURL('image/png')
  link.click()
}

async function exportAllZip() {
  exporting.value = true
  exportDone.value = false
  try {
    const zip = new JSZip()
    const folder = zip.folder('meitu-vision-multi-platform')
    if (!folder) return
    for (const template of platformTemplates) {
      const layers = reflowLayersToPlatform(editor.layers, editor.platform, template)
      const canvas = await renderLayersToCanvas(layers, {
        width: template.width,
        height: template.height,
        accent: template.accent,
        marketColors: editor.market.colors
      })
      const blob = await canvasToPngBlob(canvas)
      folder.file(`${template.id}-${canvas.width}x${canvas.height}.png`, blob)
    }
    const marketId = editor.marketId as MarketId
    const market = marketProfiles.find((item) => item.id === marketId)
    const readme = [
      'Meitu Vision - multi-platform export',
      `Market: ${market?.id ?? ''}`,
      `Generated: ${new Date().toLocaleString()}`,
      '',
      ...platformTemplates.map((item) => `${item.id}: ${item.width}x${item.height} (${item.ratio})`)
    ].join('\n')
    folder.file('README.txt', readme)

    const blob = await zip.generateAsync({ type: 'blob' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.download = `meitu-vision-all-platforms-${marketId}.zip`
    link.href = url
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 4000)
    exportDone.value = true
  } finally {
    exporting.value = false
  }
}
</script>

<template>
  <div class="mp-overlay" @click.self="emit('close')">
    <div class="mp-modal">
      <header class="mp-header">
        <div>
          <h2>{{ t('multi.title') }}</h2>
          <p>{{ t('multi.subtitle') }}</p>
        </div>
        <div class="mp-actions">
          <button class="primary-action" :disabled="exporting" @click="exportAllZip">
            {{ exporting ? t('multi.exporting') : t('multi.exportAll') }}
          </button>
          <button @click="emit('close')">{{ t('common.cancel') }}</button>
        </div>
      </header>

      <p v-if="exportDone" class="mp-done">{{ t('multi.exportDone') }}</p>

      <div class="mp-grid">
        <div v-for="entry in previews" :key="entry.platformId" class="mp-card">
          <img :src="entry.url" :alt="t(`platforms.${entry.platformId}.name`)" />
          <strong>{{ t(`platforms.${entry.platformId}.name`) }}</strong>
          <button @click="exportSingle(entry.platformId)">{{ t('multi.exportOne') }}</button>
        </div>
      </div>

      <p v-if="!previews.length" class="muted">{{ t('multi.rendering') }}</p>
    </div>
  </div>
</template>

<style scoped>
.mp-overlay {
  position: fixed;
  inset: 0;
  z-index: 60;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(8, 6, 12, 0.72);
  backdrop-filter: blur(6px);
}

.mp-modal {
  width: min(920px, 92vw);
  max-height: 86vh;
  overflow: auto;
  padding: 22px;
  border-radius: 16px;
  background: #14101c;
  border: 1px solid rgba(255, 158, 200, 0.24);
}

.mp-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;
}

.mp-header h2 {
  margin: 0 0 4px;
  font-size: 17px;
  color: #fff7fb;
}

.mp-header p {
  margin: 0;
  font-size: 12px;
  color: #c997af;
}

.mp-actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}

.mp-actions button {
  min-height: 36px;
  padding: 0 14px;
  border-radius: 8px;
  border: 1px solid rgba(255, 158, 200, 0.3);
  background: rgba(255, 255, 255, 0.06);
  color: #fff7fb;
  cursor: pointer;
}

.mp-actions button.primary-action {
  background: linear-gradient(135deg, #ff4fa3, #ffd7e8);
  border: none;
  color: #1b0c14;
  font-weight: 700;
}

.mp-actions button:disabled {
  opacity: 0.55;
  cursor: wait;
}

.mp-done {
  margin: 0 0 12px;
  font-size: 12px;
  color: #9fe1cb;
}

.mp-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 14px;
}

.mp-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px;
  border-radius: 12px;
  border: 1px solid rgba(255, 158, 200, 0.18);
  background: rgba(255, 255, 255, 0.04);
}

.mp-card img {
  width: 100%;
  height: 170px;
  object-fit: contain;
  border-radius: 8px;
  background: rgba(0, 0, 0, 0.3);
}

.mp-card strong {
  font-size: 12px;
  color: #fff7fb;
}

.mp-card button {
  min-height: 30px;
  border-radius: 6px;
  border: 1px solid rgba(255, 158, 200, 0.3);
  background: rgba(255, 255, 255, 0.06);
  color: #ffd7e8;
  cursor: pointer;
  font-size: 12px;
}

.muted {
  color: #c997af;
  font-size: 12px;
}
</style>
