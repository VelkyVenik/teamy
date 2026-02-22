# Teamy

Microsoft Teams client built with Nuxt 4 + Tauri 2.

## Tech Stack

- **Nuxt 4** (SPA, `ssr: false`), **Vue 3**, **Nuxt UI v4**, **Pinia**
- **Tauri 2** (Rust) for desktop shell
- **nuxt-oidc-auth** for Azure Entra ID authentication
- **Microsoft Graph API** for Teams data
- **Bun** as package manager and runtime

## Project Structure

- `app/components/` -- Vue components, auto-imported without path prefix
- `app/composables/` -- Composables with module-level shared state (not Pinia)
- `app/pages/` -- File-based routing: `index.vue`, `chat/[chatId].vue`, `channel/[teamId]/[channelId].vue`
- `app/utils/` -- Utility functions, auto-imported by Nuxt
- `server/middleware/graph-auth.ts` -- Server-side Graph API proxy with token management
- `types/` -- Shared TypeScript types (`graph.ts` for Graph API types, `sections.ts` for sidebar sections)
- `src-tauri/` -- Tauri desktop app (Rust)

## Key Patterns

### Graph API access
All Graph API calls go through `useGraph()` composable which provides `graphFetch`, `graphFetchAll` (paginated), and `graphFetchPage`. The composable handles auth tokens, retries on 429, and pagination via `@odata.nextLink`.

### Composable state
Most composables use **module-level refs** for shared state (not Pinia stores). This means all callers of e.g. `useUnread()` share the same reactive data. Pinia stores exist in `app/stores/` but the primary pattern is module-level composables.

### Sidebar sections
Users organize chats and channels into custom sections (favorites, custom groups). Managed by `useSections()`, persisted to localStorage (web) or Tauri plugin-store (desktop).

### Message sending
Messages go through `buildMessagePayload()` utility which supports inline images via Graph API `hostedContents`. Composables: `useMessages` (chat messages), `useSendMessage` (chat + channel + replies), `useChannels` (channel messages).

### Associated teams
The app fetches both `/me/joinedTeams` and `/me/teamwork/associatedTeams` to show channels from teams the user accesses via shared channels but hasn't directly joined.

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
