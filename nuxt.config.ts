// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-05-15',
  modules: ['@nuxt/ui', '@nuxt/icon', '@pinia/nuxt'],
  ssr: false,
  css: ['~/assets/css/main.css'],
  components: [{ path: '~/components', pathPrefix: false }],
  devtools: { enabled: true },
  devServer: { host: '0' },
  vite: {
    clearScreen: false,
    envPrefix: ['VITE_', 'TAURI_'],
    server: { strictPort: true }
  },
  ignore: ['**/src-tauri/**'],
})
