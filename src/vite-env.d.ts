/// <reference types="vite/client" />

declare const __LLM_ENABLED__: boolean
declare const __VISION_ENABLED__: boolean

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<Record<string, never>, Record<string, never>, unknown>
  export default component
}
