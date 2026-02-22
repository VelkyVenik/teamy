# Teamy — Design Document

> A lightweight Microsoft Teams **chat client** for macOS.

Teamy is a chat-only alternative to the official Microsoft Teams desktop app. It handles day-to-day messaging (1:1 chats, group chats, team channels) with a fraction of the resource usage. Calls, meetings, and other non-chat features are delegated to the official Teams app via deep links.

---

## Why

Teams uses 300-500 MB RAM just for chat. Teamy replaces that with a native-feeling Nuxt app inside Tauri (~60-100 MB), covering the 90% use case: reading and sending messages.

**In scope:** 1:1 chats, group chats, team channels, presence, reactions, inline images, emoji, unread tracking, notifications.

**Out of scope (by design):** Calls, meetings, calendar, files/SharePoint, apps marketplace, Copilot, Viva, Loop, approvals. These are accessed via deep links to the official Teams app when needed.

---

## Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| Desktop shell | **Tauri v2** | Native WebKit on macOS, ~10 MB binary, no Chromium |
| Runtime | **Bun** | Fast JS/TS runtime and package manager |
| Framework | **Nuxt 4** (SPA, `ssr: false`) | File-based routing, auto-imports, Vue 3 |
| UI | **Nuxt UI v4** | Component library built on Reka UI + Tailwind CSS v4 |
| Auth | **MSAL Browser** | Azure Entra ID with PKCE, popup (web) + native window (Tauri) |
| API | **Microsoft Graph API** | Direct client-side calls, no server proxy |
| State | **Module-level composables** | Shared refs at module scope, simpler than Pinia for this use case |
| AI | **Anthropic Claude API** | Embedded assistant via Rust streaming (Tauri only) |

---

## Architecture

```
+--------------------------------------------------+
|                  Tauri v2 Shell                   |
|                                                   |
|  +-------------------------------------------+   |
|  |         Nuxt 4 SPA (ssr: false)           |   |
|  |                                           |   |
|  |  pages/           composables/            |   |
|  |  +-- index.vue    +-- useAuth.ts          |   |
|  |  +-- login.vue    +-- useGraph.ts         |   |
|  |  +-- chat/        +-- useChats.ts         |   |
|  |  +-- channel/     +-- useMessages.ts      |   |
|  |  +-- settings/    +-- useUnread.ts        |   |
|  |                   +-- usePresence.ts      |   |
|  |  components/      +-- useClaude.ts        |   |
|  |  +-- chat/                                |   |
|  |  +-- channel/     utils/                  |   |
|  |  +-- claude/      +-- msalConfig.ts       |   |
|  |  +-- sidebar/                             |   |
|  |  +-- layout/                              |   |
|  +---------------------+---------------------+   |
|                         |                         |
|  +---------------------v---------------------+   |
|  |      Rust Backend (Tauri Commands)         |   |
|  |  auth.rs     -- OAuth native window        |   |
|  |  claude.rs   -- Claude API streaming       |   |
|  |  keychain.rs -- macOS Keychain storage     |   |
|  |  deeplink.rs -- Open URLs in browser       |   |
|  |  notifications.rs -- Native notifications  |   |
|  +--------------------------------------------+   |
+---------------------------------------------------+
```

### Key Architectural Decision: Client-Only SPA

Nuxt runs as an SPA (`ssr: false`) with no server component. All Graph API calls go directly from the browser/webview to `graph.microsoft.com`. Authentication uses MSAL Browser (web) or a custom PKCE flow through a Tauri native window (desktop). This eliminates the need for a backend server, proxy, or client secret.

---

## Auth Architecture

### Browser (web)
MSAL Browser popup flow: `loginPopup` / `acquireTokenSilent` / `acquireTokenPopup`.

### Tauri (desktop)
MSAL popups don't work in Tauri's webview. Custom OAuth2 PKCE flow:
1. `useAuth()` builds Azure AD authorization URL with PKCE challenge
2. Rust `open_auth_window` creates a native `WebviewWindow` for login
3. Rust intercepts redirect to `http://localhost`, extracts auth code
4. Frontend exchanges code for tokens via POST to Azure AD `/token`
5. Refresh uses `grant_type=refresh_token`

Detection: `window.__TAURI__` selects the flow.

### Azure AD App Registration
- **Platform:** Single-page application (SPA)
- **Redirect URIs:** `http://localhost:3000` (dev), `http://localhost` (Tauri prod)
- **Allow public client flows:** Yes
- **No client secret needed**
- **Delegated permissions:** `Chat.ReadWrite`, `ChannelMessage.Read.All`, `ChannelMessage.Send`, `Team.ReadBasic.All`, `Channel.ReadBasic.All`, `User.Read`, `Presence.Read`, `Presence.Read.All`, `TeamworkTag.Read`

---

## Data Flow

### Chat messages
1. `useChats()` fetches `/me/chats` with `$expand=lastMessagePreview,members`
2. `useMessages(chatId)` fetches `/me/chats/{id}/messages` (paginated, cached)
3. Polling every 5 seconds for new messages in active chat
4. `refreshChats()` every 10 seconds for sidebar unread detection

### Channel messages
1. `useChannels()` fetches `/me/joinedTeams` + `/me/teamwork/associatedTeams`
2. Channel messages via `/teams/{id}/channels/{id}/messages`

### Unread tracking
- `useUnread()` manages `unreadChatIds` set (module-level shared state)
- `localReadTimestamps` prevents clock-skew from re-marking chats as unread
- `markChatRead` calls Graph API `markChatReadForUser` (fire-and-forget)
- Message thread divider uses a local snapshot (`threadLastRead`) decoupled from sidebar state

### Presence
- `usePresence()` batch-fetches `/communications/presences` for visible contacts
- Periodic polling while chat list is visible

---

## Known Limitations

- **Channel unread messages** -- Graph API does not provide unread counts or read state for channel messages.
- **Incoming call notifications** -- Graph API does not support real-time call notifications for client apps.
- **Calling / joining meetings** -- Delegated to official Teams app via deep links.
- **Sidebar sections** -- Stored locally per device, not synced across devices.
- **Real-time updates** -- Polling-based (5s messages, 10s chat list). No WebSocket/push notifications.

---

## Commands

```bash
bun install          # Install dependencies
bun run dev          # Dev server (web)
bun run tauri:dev    # Dev with Tauri desktop
bun run build        # Production build (web)
bun run tauri:build  # Production build (desktop)
```

---

## Performance Targets

| Metric | Target |
|--------|--------|
| RAM (idle, chat open) | < 80 MB |
| RAM (active, multiple chats) | < 120 MB |
| Cold start | < 2 seconds |
| Message send latency | < 500 ms |
| Binary size | < 15 MB |
