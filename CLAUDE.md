# Teamy

Microsoft Teams client built with Nuxt 4 + Tauri 2.

## Tech Stack

- **Nuxt 4** (SPA, `ssr: false`), **Vue 3**, **Nuxt UI v4**, **Pinia**
- **Tauri 2** (Rust) for desktop shell
- **MSAL Browser** (`@azure/msal-browser`) for Azure Entra ID authentication
- **Microsoft Graph API** for Teams data (called directly from client)
- **Bun** as package manager and runtime

## Project Structure

- `app/components/` -- Vue components, auto-imported without path prefix
- `app/composables/` -- Composables with module-level shared state (not Pinia)
- `app/pages/` -- File-based routing: `index.vue`, `chat/[chatId].vue`, `channel/[teamId]/[channelId].vue`
- `app/utils/` -- Utility functions, auto-imported by Nuxt (`msalConfig.ts` for auth config)
- `app/plugins/msal.client.ts` -- Client-side MSAL initialization plugin
- `types/` -- Shared TypeScript types (`graph.ts` for Graph API types, `sections.ts` for sidebar sections)
- `src-tauri/` -- Tauri desktop app (Rust)
- `src-tauri/src/commands/` -- Tauri commands: `auth.rs` (OAuth window), `claude.rs` (streaming AI), `keychain.rs`, `deeplink.rs`, `notifications.rs`

## Auth Architecture

Authentication is fully client-side. No server/proxy needed.

### Browser
MSAL Browser handles everything via popup flow (`loginPopup`, `acquireTokenSilent`, `acquireTokenPopup`).

### Tauri desktop
MSAL popups don't work in Tauri's webview, so a custom OAuth2 PKCE flow is used:
1. `useAuth()` builds the Azure AD authorization URL with PKCE challenge
2. Rust `open_auth_window` command creates a native `WebviewWindow` for login
3. Rust `on_navigation` handler intercepts the redirect to `http://localhost`, extracts the auth code, emits `auth:callback` event
4. Frontend exchanges the code for tokens via direct POST to Azure AD's `/token` endpoint
5. Token refresh uses `grant_type=refresh_token` when access token expires
6. Account info is parsed from the ID token JWT

Detection: `window.__TAURI__` determines which flow to use.

### Azure AD App Registration
- Platform: **Single-page application** (SPA)
- Redirect URIs: `http://localhost:3000` (Nuxt dev), `http://localhost` (Tauri production)
- **Allow public client flows**: Yes
- No client secret needed

## Key Patterns

### Graph API access
All Graph API calls go through `useGraph()` composable which provides `graphFetch`, `graphFetchAll` (paginated), and `graphFetchPage`. The composable calls `graph.microsoft.com` directly from the client. Token acquisition is async (`await getToken()`) via `useGraphToken()` → `useAuth().getAccessToken()`. Retries on 429 (rate limit) and 401 (token refresh).

### Composable state
Most composables use **module-level refs** for shared state (not Pinia stores). This means all callers of e.g. `useUnread()` share the same reactive data. Pinia stores exist in `app/stores/` but the primary pattern is module-level composables.

### Sidebar sections
Users organize chats and channels into custom sections (favorites, custom groups). Managed by `useSections()`, persisted to localStorage (web) or Tauri plugin-store (desktop).

### Message sending
Messages go through `buildMessagePayload()` utility which supports inline images via Graph API `hostedContents`. Composables: `useMessages` (chat messages), `useSendMessage` (chat + channel + replies), `useChannels` (channel messages).

### Associated teams
The app fetches both `/me/joinedTeams` and `/me/teamwork/associatedTeams` to show channels from teams the user accesses via shared channels but hasn't directly joined.

### Claude AI (Tauri only)
Claude integration runs entirely through Rust. The API key is stored in macOS Keychain (`com.teamy.app` / `anthropic-api-key`). Streaming is handled via `claude_chat_stream` Rust command which emits `claude:stream-chunk`, `claude:stream-end`, and `claude:stream-error` events. The frontend (`useClaude`) listens for these events via Tauri's event system. API key management is in Settings page.

## Known Limitations

- **Channel unread messages** -- Graph API does not provide unread counts or read state for channel messages. This is a Microsoft Graph API limitation with no known workaround.
- **Incoming call notifications** -- Graph API does not support real-time call notifications for client apps. Push notifications for calls require server-side change notification subscriptions which are not available for calling events in delegated (user) context.
- **Calling / joining meetings** -- Not natively supported. The app uses deep links to open calls and meetings in the official Microsoft Teams web/desktop app.
- **Sidebar sections** -- Sections (favorites, custom groups) are stored locally per device. They are not synced with Microsoft Teams or across devices.

## Commands

```bash
bun install          # Install dependencies
bun run dev          # Dev server (web)
bun run tauri:dev    # Dev with Tauri desktop
bun run build        # Production build (web)
bun run tauri:build  # Production build (desktop)
```

## Style

- Tailwind CSS with Nuxt UI component library
- Dark theme: slate-900 sidebar, default Nuxt UI dark for main content
- Primary color: indigo, neutral: slate
