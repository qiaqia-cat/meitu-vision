<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { storeToRefs } from 'pinia'
import { useEditorStore } from '@/stores/editor'
import { highlightSegments } from '@/services/compliance'
import type { ComplianceFinding } from '@/types/editor'

const { t } = useI18n()
const editor = useEditorStore()
const {
  complianceInput,
  complianceReport,
  complianceBusy,
  complianceNote,
  copyVariants,
  variantReports,
  generatedCopy
} = storeToRefs(editor)

const expandedVariant = ref<number | null>(null)

const canCheck = computed(() => complianceInput.value.trim().length > 0)

const segments = computed(() =>
  complianceReport.value ? highlightSegments(complianceReport.value.text, complianceReport.value.findings) : []
)

const levelLabel = computed(() => (complianceReport.value ? t(`compliance.${complianceReport.value.level}`) : ''))

const modeLabel = computed(() =>
  complianceReport.value?.mode === 'ai' ? t('compliance.modeAI') : t('compliance.modeLexicon')
)

const noteText = computed(() => {
  if (complianceNote.value === 'no-key') return t('compliance.noKeyNote')
  if (complianceNote.value === 'ai-unavailable') return t('compliance.aiUnavailableNote')
  return ''
})

const variantSummary = computed(() =>
  copyVariants.value.map((variant, index) => {
    const report = variantReports.value[index]
    const findings = report?.findings ?? []
    return {
      index,
      headline: variant.headline,
      score: report?.score ?? 100,
      level: report?.level ?? ('safe' as const),
      total: findings.length,
      high: findings.filter((finding) => finding.severity === 'high').length,
      findings,
      active: generatedCopy.value?.headline === variant.headline
    }
  })
)

function clear() {
  complianceInput.value = ''
  complianceReport.value = null
  complianceNote.value = 'idle'
  expandedVariant.value = null
}

function toggle(index: number) {
  expandedVariant.value = expandedVariant.value === index ? null : index
}

function severityClass(finding: ComplianceFinding) {
  return finding.severity
}

function exportReport() {
  const report = complianceReport.value
  if (!report) return

  const context = editor.complianceContext
  const lines = [
    'Meitu Vision · copy compliance report',
    `Generated: ${new Date().toLocaleString()}`,
    `Market: ${context.marketName} · Platform: ${context.platformName} · Category: ${context.category.trim() || '-'}`,
    `Mode: ${report.mode === 'ai' ? 'AI review (DeepSeek)' : 'Rule library'}`,
    `Safety score: ${report.score}/100 · ${levelLabel.value}`,
    '',
    '--- Copy ---',
    report.text,
    '',
    `--- Findings (${report.findings.length}) ---`
  ]

  if (report.findings.length === 0) {
    lines.push(t('compliance.empty'))
  } else {
    for (const finding of report.findings) {
      lines.push(`[${finding.severity}] "${finding.term}" — ${finding.basis}`)
      if (finding.reason) lines.push(`  why: ${finding.reason}`)
      lines.push(`  fix: ${finding.suggestion}`)
    }
  }

  const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `compliance-report-${Date.now()}.txt`
  anchor.click()
  URL.revokeObjectURL(url)
}
</script>

<template>
  <section class="panel-section compliance-panel">
    <h2>{{ t('compliance.section') }}</h2>

    <textarea
      v-model="complianceInput"
      class="compliance-input"
      rows="4"
      :placeholder="t('compliance.inputPlaceholder')"
    ></textarea>

    <div class="compliance-actions">
      <button class="primary-action" :disabled="complianceBusy || !canCheck" @click="editor.runComplianceCheck()">
        {{ complianceBusy ? t('compliance.checking') : t('compliance.check') }}
      </button>
      <button v-if="generatedCopy" class="ghost-action" @click="editor.fillFromCurrentCopy()">
        {{ t('compliance.useCurrent') }}
      </button>
      <button v-if="complianceInput" class="ghost-action" @click="clear">
        {{ t('compliance.clear') }}
      </button>
    </div>

    <div v-if="complianceReport" class="compliance-result">
      <div class="compliance-score">
        <span class="score-value" :class="complianceReport.level">{{ complianceReport.score }}</span>
        <div class="score-meta">
          <strong :class="complianceReport.level">{{ levelLabel }}</strong>
          <small>{{ t('compliance.findingCount', { count: complianceReport.findings.length }) }}</small>
          <span class="mode-badge" :class="complianceReport.mode">{{ modeLabel }}</span>
        </div>
      </div>

      <p v-if="noteText" class="muted compliance-note">{{ noteText }}</p>

      <p v-if="segments.length" class="compliance-preview">
        <span v-for="(segment, index) in segments" :key="index" :class="{ flagged: segment.flagged, [`flag-${segment.severity}`]: segment.flagged }">{{ segment.text }}</span>
      </p>

      <ul v-if="complianceReport.findings.length" class="compliance-findings">
        <li v-for="finding in complianceReport.findings" :key="finding.id">
          <div class="finding-head">
            <span class="sev" :class="severityClass(finding)">{{ t(`compliance.kind.${finding.kind}`) }}</span>
            <code>{{ finding.term }}</code>
            <button :title="t('compliance.fix')" @click="editor.applyComplianceFix(finding)">
              {{ t('compliance.fix') }}
            </button>
          </div>
          <small class="basis">{{ finding.basis }}</small>
          <small v-if="finding.reason" class="reason">{{ finding.reason }}</small>
          <small class="sugg">→ {{ finding.suggestion }}</small>
        </li>
      </ul>
      <p v-else class="muted">{{ t('compliance.empty') }}</p>

      <button class="ghost-action export-btn" @click="exportReport">{{ t('compliance.export') }}</button>
    </div>

    <div v-if="variantSummary.length" class="compliance-variants">
      <h3>{{ t('compliance.variantRisk') }}</h3>
      <button
        v-for="item in variantSummary"
        :key="item.index"
        :class="{ 'variant-row': true, active: item.active, open: expandedVariant === item.index }"
        @click="toggle(item.index)"
      >
        <span class="dot" :class="item.level"></span>
        <strong>{{ item.headline }}</strong>
        <small v-if="item.total">{{ t('compliance.findingCount', { count: item.total }) }}</small>
        <small v-else class="clean">{{ t('compliance.empty') }}</small>
      </button>

      <ul v-if="expandedVariant !== null && variantSummary[expandedVariant]?.findings.length" class="compliance-findings">
        <li v-for="finding in variantSummary[expandedVariant]!.findings" :key="finding.id">
          <div class="finding-head">
            <span class="sev" :class="severityClass(finding)">
              {{ t(`compliance.field.${finding.field ?? 'headline'}`) }}
            </span>
            <code>{{ finding.term }}</code>
            <button :title="t('compliance.fix')" @click="editor.applyVariantFix(expandedVariant!, finding)">
              {{ t('compliance.fix') }}
            </button>
          </div>
          <small class="basis">{{ finding.basis }}</small>
          <small class="sugg">→ {{ finding.suggestion }}</small>
        </li>
      </ul>
    </div>
  </section>
</template>
