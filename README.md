# Teamy

A lightweight, native Microsoft Teams client built with Nuxt 4 and Tauri 2. Connects directly to Microsoft Graph API via Azure Entra ID for chats, channels, and presence.

## Prerequisites

- [Bun](https://bun.sh/) runtime
- [Rust](https://www.rust-lang.org/tools/install) toolchain (for Tauri)
- Azure Entra ID app registration with Microsoft Graph permissions

## Setup

```bash
bun install
```

Copy `.env.example` to `.env` and fill in your Azure credentials:

```bash
cp .env.example .env
```

### Azure App Registration

1. Create an app registration in [Azure Entra ID](https://entra.microsoft.com/)
2. Under **Authentication**:
   - Add **Single-page application** platform
   - Add redirect URIs: `http://localhost:3000` (dev), `http://localhost` (Tauri production)
   - Enable **Allow public client flows**
3. Under **API permissions**, add the delegated Microsoft Graph scopes listed below
4. Copy the **Application (client) ID** and **Directory (tenant) ID** to your `.env`

### Required Microsoft Graph permissions (delegated)

- `Chat.ReadWrite` -- read/send chat messages
- `ChannelMessage.Read.All` -- read channel messages
- `ChannelMessage.Send` -- send channel messages
- `Team.ReadBasic.All` -- list joined and associated teams
- `Channel.ReadBasic.All` -- list channels
- `Presence.Read.All` -- user presence/status
- `People.Read` -- people search

## Development

```bash
# Web only (browser)
bun run dev

# Tauri desktop app
bun run tauri:dev
```

## Build

```bash
# Web
bun run build

# Tauri desktop app
bun run tauri:build
```

## Architecture

- **Frontend**: Nuxt 4 (SPA mode, SSR disabled), Nuxt UI v4, Vue 3
- **Desktop**: Tauri 2 (Rust) -- no bundled server, pure static frontend
- **Auth**: MSAL Browser (popup flow in browser, custom OAuth2 PKCE with native Tauri window on desktop)
- **API**: Microsoft Graph API called directly from client (no server proxy)
- **AI**: Claude integration via Rust commands with macOS Keychain-stored API key (optional)
- **State**: Composables with module-level shared refs, Pinia for stores

### Key directories

```
app/
  components/     # Vue components (auto-imported, no path prefix)
  composables/    # Shared composables (useGraph, useAuth, useMessages, etc.)
  pages/          # File-based routing (index, chat/[chatId], channel/[teamId]/[channelId])
  plugins/        # Client plugins (msal.client.ts)
  utils/          # Utilities (msalConfig.ts, auto-imported)
types/            # TypeScript type definitions
src-tauri/        # Tauri desktop shell (Rust)
  src/commands/   # Tauri commands (auth, claude, keychain, deeplink, notifications)
```

## Known Limitations

- **Channel unread messages** -- Microsoft Graph API does not expose unread counts or read state for channel messages. There is no workaround available.
- **Incoming call notifications** -- Graph API does not support real-time call event notifications for client apps (requires server-side subscriptions not available in delegated context).
- **Calling / joining meetings** -- Uses deep links to open calls and meetings in the official Microsoft Teams web/desktop client. Native calling is not supported.
- **Sidebar sections** -- Custom sections (favorites, groups) are stored locally per device and not synced with Microsoft Teams or across devices.
