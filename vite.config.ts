import { fileURLToPath, URL } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const deepseekKey = env.DEEPSEEK_API_KEY ?? ''
  const zhipuKey = env.ZHIPU_API_KEY ?? ''

  return {
    base: process.env.GITHUB_ACTIONS ? '/meitu-vision/' : '/',
    plugins: [vue()],
    define: {
      __LLM_ENABLED__: JSON.stringify(Boolean(deepseekKey)),
      __VISION_ENABLED__: JSON.stringify(Boolean(zhipuKey))
    },
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url))
      }
    },
    server: {
      proxy: {
        '/llm': {
          target: 'https://api.deepseek.com',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/llm/, ''),
          headers: deepseekKey ? { Authorization: `Bearer ${deepseekKey}` } : {}
        },
        '/vision': {
          // Zhipu GLM-4V multimodal endpoint. We only attach the key when
          // ZHIPU_API_KEY is set so the proxy stays inert otherwise.
          target: 'https://open.bigmodel.cn',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/vision/, '/api/paas/v4'),
          headers: zhipuKey ? { Authorization: `Bearer ${zhipuKey}` } : {}
        }
      }
    }
  }
})
