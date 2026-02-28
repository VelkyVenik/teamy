# Teamy

Lightweight Microsoft Teams **chat-only** client built with Nuxt 4 + Tauri 2. Covers messaging (1:1 chats, group chats, team channels) with minimal resource usage. Calls, meetings, and other non-chat features are delegated to the official Teams app via deep links.

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
- `types/` -- Shared TypeScript types (`graph.ts` for Graph API types, `sections.ts` for sidebar sections, `unread.ts` for unread store)
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

### Graph API documentation (MS Learn MCP)
Use the **Microsoft Learn MCP server** tools for Graph API documentation lookups instead of generic web search:
- `microsoft_docs_search` — search Microsoft Learn for endpoints, permissions, concepts
- `microsoft_code_sample_search` — find official Graph API code samples (use `language: "typescript"`)
- `microsoft_docs_fetch` — fetch full page content from a Microsoft Learn URL

### Composable state
Most composables use **module-level refs** for shared state (not Pinia stores). This means all callers of e.g. `useUnreadStore()` share the same reactive data. Pinia stores exist in `app/stores/` but the primary pattern is module-level composables.

### Sidebar sections
Users organize chats and channels into custom sections (favorites, custom groups). Managed by `useSections()`, persisted to localStorage (web) or Tauri plugin-store (desktop).

### Message sending
Messages go through `buildMessagePayload()` utility which supports inline images via Graph API `hostedContents`. Composables: `useMessages` (chat messages), `useSendMessage` (chat + channel + replies), `useChannels` (channel messages).

### Associated teams
The app fetches both `/me/joinedTeams` and `/me/teamwork/associatedTeams` to show channels from teams the user accesses via shared channels but hasn't directly joined.

### Claude AI (Tauri only)
Claude integration runs entirely through Rust. The API key is stored in macOS Keychain (`com.teamy.app` / `anthropic-api-key`). Streaming is handled via `claude_chat_stream` Rust command which emits `claude:stream-chunk`, `claude:stream-end`, and `claude:stream-error` events. The frontend (`useClaude`) listens for these events via Tauri's event system. API key management is in Settings page.

## Unread Tracking

Unified system for both chats and channels, managed by two composables:

### `useUnreadStore()` — state & persistence
- Module-level shared state: `readTimestamps` (per-item read position), `unreadCounts` (per-item message count), `lastKnownPreviewIds` (chat preview tracking), `channelLastMessageTimes`
- Keys: chat ID for chats, `"teamId:channelId"` for channels
- `updateFromChats(chats, currentUserId)` — rebuilds chat unread from chat list poll. Tracks `lastMessagePreview.id` changes for incremental counting (+1 per poll cycle where preview changed). Filters own messages via `from.user.id`.
- `updateChannelUnread(teamId, channelId, latestMsgTime, fromUserId, currentUserId)` — channel unread from peek polling. Same incremental logic.
- `touchReadTimestamp(type, id, teamId?, messageTimestamp?)` — optimistic local mark-as-read, uses `max(now, messageTimestamp)` to prevent clock-skew
- `markChatRead(chatId)` — optimistic + fire-and-forget `markChatReadForUser` Graph API call
- `markChannelRead(teamId, channelId)` — local only (Graph API has no channel read-state endpoint)
- `getSnapshotLastRead(key, serverTimestamp?)` — max of local + server timestamp, used for "New messages" divider
- `setExactCount(type, id, count, teamId?)` — called when user opens a chat/channel and exact count is computed from loaded messages
- `getSectionUnreadItemCount(items)` — count of section items with unread > 0
- Persisted to `LazyStore('unread-state.json')` (Tauri) or `localStorage('teamy-unread-state')` (web), debounced 2s

### `useUnreadPoller()` — centralized polling
- Replaces scattered `setInterval` calls in pages
- Chat list poll: every 15s via `refreshChats()` + `updateFromChats()`
- Channel peek poll: every 20s, staggered 500ms between requests, max 15 watched channels
- `setWatchedChannels()` — updated from `useSections().watchedChannelItems` (channels in Favorites + custom groups)
- Only channels explicitly placed in sidebar sections are polled; "Other chats" channels are fetched on-demand only

### Message thread divider
- "New messages" divider uses a local `threadLastRead` ref snapshot, decoupled from sidebar state
- Captured once on chat/channel open via `getSnapshotLastRead()` / `getLastRead()`
- Auto-dismisses after 3 seconds
- Exact unread count computed from loaded messages on channel open

### Polling budget (~150 req/10s Graph API rate limit)
| Item | Interval | Requests/10s |
|------|----------|-------------|
| Chat list refresh | 15s | ~0.67 |
| Active chat/channel messages | 5s (existing) | ~2 |
| Watched channels (up to 15) | 20s, staggered | ~7.5 |
| Presence | 30s (existing) | ~1 |
| **Total** | | **~11** |

## Known Limitations

- **Chat-only client** -- Calls, meetings, calendar, files, apps, Copilot, Viva, and Loop are not supported. Deep links open them in the official Teams app.
- **Channel unread state is local-only** -- Graph API does not provide `viewpoint` or `lastMessageReadDateTime` for channel messages. Channel read positions are tracked locally and persisted per device. They do not sync with the official Teams client or across devices.
- **Chat unread counts are approximate** -- Sidebar counts use incremental tracking (one preview ID change per poll = +1). Burst messages between polls are undercounted. Exact counts are shown in the "New messages" divider when a chat is opened.
- **Only sectioned channels are polled** -- Channels must be in Favorites or a custom section to receive background unread polling. Channels in "Other chats" are only checked when opened. Max 15 watched channels.
- **Incoming call notifications** -- Graph API does not support real-time call notifications for client apps. Push notifications for calls require server-side change notification subscriptions which are not available for calling events in delegated (user) context.
- **Calling / joining meetings** -- Not natively supported. The app uses deep links to open calls and meetings in the official Microsoft Teams web/desktop app.
- **Sidebar sections** -- Sections (favorites, custom groups) are stored locally per device. They are not synced with Microsoft Teams or across devices.
- **Real-time updates** -- Polling-based (5s active chat/channel messages, 15s chat list, 20s watched channels). No WebSocket or push notifications.

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

## Custom Agents

Project-specific agents in `.claude/agents/` for delegating specialized work:

| Agent | File | Use When |
|-------|------|----------|
| **vue-dev** | `vue-dev.md` | Building components, pages, composables, layouts |
| **rust-dev** | `rust-dev.md` | Tauri commands, native integrations (keychain, tray, notifications) |
| **graph-api** | `graph-api.md` | New Graph API endpoints, types, pagination handling |
| **test-writer** | `test-writer.md` | Setting up vitest, writing tests for composables/utils/components |
| **ui-designer** | `ui-designer.md` | UI polish, Nuxt UI v4 components, layout design, theme tweaks |
| **docs** | `docs.md` | Updating CLAUDE.md, README, inline documentation |

### Agent Workflow
- **Feature work**: Plan in main context, spawn `vue-dev` or `rust-dev` with spec
- **Graph API additions**: Spawn `graph-api` with endpoint docs link
- **Testing**: Spawn `test-writer` after feature completion
- **UI polish**: Spawn `ui-designer` for component refinement
- **Docs updates**: Spawn `docs` in background after significant changes
- **Code review**: Use existing `feature-dev:code-reviewer` plugin agent
