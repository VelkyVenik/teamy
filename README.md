# Teamy

A native Microsoft Teams client built with Nuxt 4 and Tauri 2. Connects to Microsoft Graph API via Azure Entra ID (OIDC) for chats, channels, and presence.

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

### Required Azure permissions

The app requests these Microsoft Graph scopes:

- `Chat.ReadWrite` -- read/send chat messages
- `ChannelMessage.Read.All` -- read channel messages
- `ChannelMessage.Send` -- send channel messages
- `Team.ReadBasic.All` -- list joined and associated teams
- `Channel.ReadBasic.All` -- list channels
- `Presence.Read.All` -- user presence/status
- `People.Read` -- people search

## Development

```bash
# Web only
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

- **Frontend**: Nuxt 4 (SPA mode, SSR disabled), Nuxt UI, Vue 3
- **Desktop**: Tauri 2 (Rust)
- **Auth**: `nuxt-oidc-auth` with Azure Entra ID
- **API**: Microsoft Graph API via server-side proxy (`server/middleware/graph-auth.ts`)
- **State**: Composables with module-level shared refs, Pinia for stores
- **AI**: Claude integration for chat assistance (optional, requires `ANTHROPIC_API_KEY`)

### Key directories

```
app/
  components/     # Vue components (auto-imported, no path prefix)
  composables/    # Shared composables (useGraph, useMessages, useChannels, etc.)
  pages/          # File-based routing (index, chat/[chatId], channel/[teamId]/[channelId])
  utils/          # Utility functions (auto-imported)
server/
  api/            # API routes (claude chat)
  middleware/     # Graph API auth proxy
  plugins/        # Server plugins
types/            # TypeScript type definitions
src-tauri/        # Tauri desktop shell (Rust)
```
