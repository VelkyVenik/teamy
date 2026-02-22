// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-05-15',
  modules: ['nuxt-oidc-auth', '@nuxt/ui', '@nuxt/icon', '@pinia/nuxt'],
  ssr: false,
  css: ['~/assets/css/main.css'],
  components: [{ path: '~/components', pathPrefix: false }],
  devtools: { enabled: true },
  devServer: { host: '0' },
  runtimeConfig: {
    anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',
  },
  vite: {
    clearScreen: false,
    envPrefix: ['VITE_', 'TAURI_'],
    server: { strictPort: true }
  },
  ignore: ['**/src-tauri/**'],
  oidc: {
    defaultProvider: 'entra',
    providers: {
      entra: {
        redirectUri: 'http://localhost:3000/auth/entra/callback',
        clientId: process.env.NUXT_OIDC_PROVIDERS_ENTRA_CLIENT_ID,
        clientSecret: process.env.NUXT_OIDC_PROVIDERS_ENTRA_CLIENT_SECRET,
        authorizationUrl: `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}/oauth2/v2.0/authorize`,
        tokenUrl: `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}/oauth2/v2.0/token`,
        scope: [
          'openid',
          'profile',
          'User.Read',
          'Chat.ReadWrite',
          'ChannelMessage.Read.All',
          'ChannelMessage.Send',
          'Team.ReadBasic.All',
          'Channel.ReadBasic.All',
          'Presence.Read',
          'Presence.Read.All',
          'People.Read',
          'offline_access',
        ],
        userNameClaim: 'name',
        nonce: false, // Disable nonce to prevent form_post response mode which breaks session cookies on localhost
        responseType: 'code',
        validateAccessToken: false,
        exposeAccessToken: true,
        optionalClaims: ['oid'],
      },
    },
    session: {
      automaticRefresh: true,
      expirationCheck: true,
    },
    middleware: {
      globalMiddlewareEnabled: false,
      customLoginPage: true,
    },
  },
})
