<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { PublicUser } from '@/types/auth'
import { loginWithPhone, registerWithPhone } from '@/utils/auth'

const emit = defineEmits<{
  authenticated: [user: PublicUser]
}>()

const { t } = useI18n()
const mode = ref<'login' | 'register'>('register')
const phone = ref('')
const password = ref('')
const displayName = ref('')
const avatarDataUrl = ref('')
const avatarInputRef = ref<HTMLInputElement | null>(null)
const errorMessage = ref('')
const isSubmitting = ref(false)

const title = computed(() => mode.value === 'login' ? t('auth.loginTitle') : t('auth.registerTitle'))
const actionLabel = computed(() => mode.value === 'login' ? t('auth.login') : t('auth.register'))
const switchLabel = computed(() => mode.value === 'login' ? t('auth.switchToRegister') : t('auth.switchToLogin'))

async function submitAuth() {
  errorMessage.value = ''
  isSubmitting.value = true
  try {
    const user = mode.value === 'login'
      ? await loginWithPhone(phone.value, password.value)
      : await registerWithPhone(phone.value, password.value, displayName.value, avatarDataUrl.value || undefined)
    emit('authenticated', user)
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : t('common.defaultError')
  } finally {
    isSubmitting.value = false
  }
}

function toggleMode() {
  mode.value = mode.value === 'login' ? 'register' : 'login'
  errorMessage.value = ''
}

function onAvatarUpload(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return

  const reader = new FileReader()
  reader.onload = () => {
    avatarDataUrl.value = String(reader.result)
  }
  reader.readAsDataURL(file)
}
</script>

<template>
  <main class="auth-shell">
    <section class="auth-panel">
      <div class="auth-brand">
        <p>{{ t('common.appName') }}</p>
        <h1>{{ title }}</h1>
        <span>{{ t('auth.phoneLoginLabel') }}</span>
      </div>

      <form class="auth-form" @submit.prevent="submitAuth">
        <div v-if="mode === 'register'" class="avatar-picker">
          <button class="avatar-button" type="button" @click="avatarInputRef?.click()">
            <img v-if="avatarDataUrl" :src="avatarDataUrl" alt="" />
            <span v-else>{{ t('common.logoFallback') }}</span>
          </button>
          <div>
            <strong>{{ t('auth.customAvatar') }}</strong>
            <button type="button" @click="avatarInputRef?.click()">
              {{ avatarDataUrl ? t('auth.changeAvatar') : t('auth.uploadAvatar') }}
            </button>
          </div>
          <input ref="avatarInputRef" class="hidden-input" type="file" accept="image/*" @change="onAvatarUpload" />
        </div>

        <label v-if="mode === 'register'">
          {{ t('auth.displayName') }}
          <input v-model.trim="displayName" autocomplete="name" :placeholder="t('auth.namePlaceholder')" />
        </label>

        <label>
          {{ t('auth.phoneNumber') }}
          <input v-model.trim="phone" autocomplete="tel" inputmode="tel" :placeholder="t('auth.phonePlaceholder')" required />
        </label>

        <label>
          {{ t('auth.password') }}
          <input v-model="password" autocomplete="current-password" type="password" minlength="6" required />
        </label>

        <p v-if="errorMessage" class="auth-error">{{ errorMessage }}</p>

        <button class="primary-action" type="submit" :disabled="isSubmitting">
          {{ isSubmitting ? t('common.submitting') : actionLabel }}
        </button>
      </form>

      <button class="auth-switch" type="button" @click="toggleMode">
        {{ switchLabel }}
      </button>
    </section>
  </main>
</template>
