# ZeroRetry Index

A Chrome extension that brings **structure, navigation, and continuity** to AI conversations across platforms.

Long AI chats quickly become unmanageable — you lose track of earlier questions, important insights get buried, and switching between AI tools means starting over. ZeroRetry Index solves this by adding a lightweight sidebar that indexes your conversations, lets you bookmark key moments, and enables seamless handoff between AI platforms.

---

## Supported Platforms

| Platform | URL |
|----------|-----|
| ChatGPT | `chatgpt.com` |
| Claude | `claude.ai` |
| Gemini | `gemini.google.com` |
| Perplexity | `perplexity.ai` |
| Grok | `x.com/i/grok` |
| Copilot | `copilot.microsoft.com`, `bing.com/chat` |

---

## Features

### Conversation Index
A real-time table of contents built from your messages. The index auto-updates as the conversation progresses, filters out filler phrases (e.g. "ok", "thanks", "go ahead"), and generates smart labels using intent detection — no AI required.

### Search & Filter
Type in the search bar to instantly filter index entries by keyword.

### Bookmarks (Saved Items)
Star any message to save it. Bookmarks use a resilient three-tier anchor system (message ID → content hash → positional index) so they survive page reloads and message reordering.

### Cross-AI Handoff
Continue a conversation on a different AI platform. Expand a saved item, fill in optional context, then pick a target platform. ZeroRetry builds a structured continuation prompt, copies it to your clipboard, and opens a new tab on the target platform — ready to paste.

### Projects
Group related saved items across conversations and platforms into named projects. Useful for tracking multi-session work like debugging a feature or researching a topic.

### Tags
Categorize saved items with predefined tags (Clarification, Design Choice, Bug Fix, Edge Case, Code Snippet, Verification) or create custom freeform tags.

### Milestones
Mark key progress points in a conversation to track how work evolves over time.

### Dark Mode
Automatically detects the host platform's theme (light/dark) and matches. Also responds to system-level theme changes.

### Welcome Page
An interactive onboarding demo opens on first install, walking new users through the extension's features with a simulated browser mockup.

---

## Architecture

### Tech Stack
- **Vanilla TypeScript** — zero runtime dependencies, no React
- **Chrome Extension Manifest V3** — content script + background service worker
- **Vite** (lib mode) — builds the content script as a single IIFE bundle
- **esbuild** — builds the background worker and welcome page as separate IIFE bundles
- **`chrome.storage.local`** — all data stays on-device, no backend

### Project Structure

```
extension/
├── manifest.json              # Extension manifest (MV3)
├── welcome.html               # Onboarding page shell
├── public/icons/              # Extension icons
├── src/
│   ├── contentScript.ts       # Main entry — sidebar injection, session lifecycle
│   ├── background.ts          # Service worker — opens welcome page on install
│   ├── welcome.ts             # Interactive onboarding demo
│   ├── adapters/
│   │   ├── base.ts            # Adapter interface (ChatAdapter, ChatMessage, etc.)
│   │   ├── index.ts           # Adapter registry and URL matching
│   │   ├── chatgpt.ts         # ChatGPT adapter
│   │   ├── claude.ts          # Claude adapter
│   │   ├── gemini.ts          # Gemini adapter
│   │   ├── perplexity.ts      # Perplexity adapter
│   │   ├── grok.ts            # Grok adapter
│   │   └── copilot.ts         # Copilot adapter
│   ├── core/
│   │   ├── savedItem.ts       # SavedItem model, cross-platform utilities
│   │   ├── bookmarks.ts       # Bookmark anchoring and resolution
│   │   ├── handoff.ts         # Cross-AI handoff (copy prompt + open tab)
│   │   ├── promptBuilder.ts   # Deterministic continuation prompt templates
│   │   ├── project.ts         # Project model
│   │   ├── tags.ts            # Tag definitions and color schemes
│   │   ├── labelGenerator.ts  # Smart label generation from message text
│   │   └── storage.ts         # chrome.storage.local wrapper
│   └── ui/
│       ├── sidebar.ts         # Sidebar styles
│       ├── savedItemComponent.ts  # Saved item rendering
│       ├── projectSelector.ts # Project assignment dropdown
│       ├── projectsPanel.ts   # Projects list and detail views
│       └── tagChips.ts        # Tag chip rendering
└── dist/                      # Build output (gitignored)
```

### Adapter Pattern

Each platform implements the `ChatAdapter` interface:

```typescript
interface ChatAdapter {
  id: ChatPlatformId;
  match(url: URL): boolean;
  getConversationId(): string | null;
  getMessages(): ChatMessage[];
  observeNewMessages(onChange: () => void): () => void;
  scrollToMessage(messageId: string): boolean;
  onConversationChange(onChange: () => void): () => void;
  getConversationTitle(): TitleResult;
  observeTitleChanges(onChange: () => void): () => void;
}
```

Core modules never access the DOM directly — all platform-specific behavior is encapsulated in adapter implementations.

### Session Lifecycle

1. Content script detects the current platform via adapter URL matching
2. A **session** is created for each conversation (versioned to handle rapid switching)
3. **Boot phase**: retries message extraction up to 10 times (500ms intervals) while a MutationObserver watches for DOM changes
4. **Live phase**: a debounced MutationObserver detects new messages and refreshes the index (throttled to 1 update/second)
5. Session teardown cleans up all observers and timers when switching conversations

### Bookmark Resolution

Saved items use a 4-level fallback to locate messages across page reloads:

1. **messageId** — direct adapter-generated ID match
2. **contentHash** — normalized text hash (survives ID changes)
3. **positionalIndex** — message position (last resort)
4. **orphaned** — message no longer found, item preserved for reference

---

## Development

### Prerequisites
- Node.js 18+
- npm

### Setup

```bash
git clone https://github.com/user/zeroretry-index.git
cd zeroretry-index
npm install
```

### Build

```bash
npm run build
```

This runs Vite (content script) followed by esbuild (background worker + welcome page). Output goes to `extension/dist/`.

### Watch Mode

```bash
npm run dev
```

Watches for changes and rebuilds the content script automatically.

### Load in Chrome

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select the `extension/` folder
5. Navigate to any supported AI chat platform

---

## How It Works (User Flow)

1. **Browse normally** — visit any supported AI chat site. The ZeroRetry sidebar appears on the right with an auto-generated index of your conversation.
2. **Navigate** — click any index entry to scroll directly to that message.
3. **Bookmark** — click the star icon on any entry to save it. Optionally assign it to a project.
4. **Handoff** — expand a saved item, add context, pick a target AI platform. The extension copies a continuation prompt and opens the target in a new tab.
5. **Organize** — use the Projects tab to group bookmarks across conversations. Use tags and milestones to categorize and track progress.

---

## Privacy

- All data is stored locally via `chrome.storage.local`
- No data is sent to any server
- No analytics or tracking
- No AI inference — all labeling and prompt building is deterministic

---

## License

This project is part of the **ZeroRetry** brand.
