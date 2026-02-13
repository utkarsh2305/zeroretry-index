/**
 * SavedItem Types and Factory Functions
 * Progressive save system: Level 0 (simple) -> Level 1 (continuation-ready)
 */

import type { BookmarkAnchor, BookmarkStatus } from './bookmarks';
import { generateId, contentHash } from './bookmarks';
import type { ChatPlatformId, ChatMessage } from '../adapters/base';

/**
 * Continuation context fields (Level 1 expansion)
 */
export interface ContinuationContext {
  /** User-editable title (defaults to label) */
  title: string;
  /** Summary of conversation context */
  context: string;
  /** Optional constraints or rules to maintain */
  constraints?: string;
  /** Optional current state/progress */
  currentState?: string;
  /** The next question or prompt to continue with */
  nextQuestion: string;
}

/**
 * Progressive SavedItem - extends Bookmark concept with optional continuation
 *
 * Level 0: Core fields only (one-click save)
 * Level 1: ContinuationContext populated (user expanded)
 */
export interface SavedItem {
  /** Unique identifier (UUID) */
  id: string;
  /** Composite key: platformId:conversationId */
  conversationKey: string;
  /** Anchor data for locating the message */
  anchor: BookmarkAnchor;
  /** User-editable label (default: first line of message) */
  label: string;
  /** Creation timestamp */
  createdAt: number;
  /** Optional tags for categorization */
  tags?: string[];
  /** Cached text preview (first 100 chars) */
  cachedText: string;

  // New SavedItem fields
  /** Source platform ID */
  sourcePlatform: ChatPlatformId;
  /** Full message text (not truncated) for continuation context */
  fullMessageText: string;
  /** Optional continuation context (Level 1) */
  continuation?: ContinuationContext;
  /** Timestamp of last modification */
  modifiedAt?: number;
  /** Optional project assignment */
  projectId?: string;
  /** Optional milestone marker */
  milestone?: { label: string; order: number };
  /** Schema version for future migrations */
  schemaVersion: 1;
}

/**
 * Resolved SavedItem with current status
 */
export interface ResolvedSavedItem extends SavedItem {
  /** Current resolution status */
  status: BookmarkStatus;
  /** Resolved message ID (null if orphaned) */
  resolvedMessageId: string | null;
}

/**
 * Platform display names and URLs for cross-AI handoff
 */
export const PLATFORM_INFO: Record<ChatPlatformId, { name: string; newChatUrl: string }> = {
  chatgpt: { name: 'ChatGPT', newChatUrl: 'https://chatgpt.com/' },
  claude: { name: 'Claude', newChatUrl: 'https://claude.ai/new' },
  perplexity: { name: 'Perplexity', newChatUrl: 'https://www.perplexity.ai/' },
  grok: { name: 'Grok', newChatUrl: 'https://x.com/i/grok' },
  gemini: { name: 'Gemini', newChatUrl: 'https://gemini.google.com/app' },
  copilot: { name: 'Copilot', newChatUrl: 'https://copilot.microsoft.com/' },
  lovable: { name: 'Lovable', newChatUrl: 'https://lovable.dev/' }
};

/**
 * Creates a Level 0 SavedItem from a message (one-click save)
 */
export function createSavedItem(
  message: ChatMessage,
  messageIndex: number,
  conversationKey: string,
  platformId: ChatPlatformId
): SavedItem {
  const now = Date.now();
  return {
    id: generateId(),
    conversationKey,
    anchor: {
      messageId: message.messageId,
      contentHash: contentHash(message.text),
      positionalIndex: messageIndex
    },
    label: message.text.substring(0, 50).replace(/\s+/g, ' ').trim(),
    createdAt: now,
    cachedText: message.text.substring(0, 100).replace(/\s+/g, ' ').trim(),
    sourcePlatform: platformId,
    fullMessageText: message.text,
    schemaVersion: 1
  };
}

/**
 * Generates default continuation context from SavedItem
 * Pre-fills fields to help user get started
 */
export function generateDefaultContinuation(item: SavedItem): ContinuationContext {
  return {
    title: item.label,
    context: `Continuing a conversation from ${PLATFORM_INFO[item.sourcePlatform].name}.`,
    nextQuestion: ''
  };
}

/**
 * Adds or updates continuation context on a SavedItem
 */
export function withContinuationContext(
  item: SavedItem,
  context: ContinuationContext
): SavedItem {
  return {
    ...item,
    continuation: context,
    modifiedAt: Date.now()
  };
}

/**
 * Resolves a SavedItem against current messages
 * Uses same 4-level fallback as bookmarks:
 * 1. Exact messageId match -> active
 * 2. Content hash match -> needs-reattach
 * 3. Positional index fallback -> needs-reattach
 * 4. Not found -> orphaned
 */
export function resolveSavedItem(
  item: SavedItem,
  messages: ChatMessage[]
): ResolvedSavedItem {
  // 1. Try messageId match (exact)
  const byId = messages.find(m => m.messageId === item.anchor.messageId);
  if (byId) {
    return { ...item, status: 'active', resolvedMessageId: byId.messageId };
  }

  // 2. Try content hash match (message moved or ID changed)
  const byHash = messages.find(m => contentHash(m.text) === item.anchor.contentHash);
  if (byHash) {
    return { ...item, status: 'needs-reattach', resolvedMessageId: byHash.messageId };
  }

  // 3. Try positional fallback (last resort)
  const byIndex = messages[item.anchor.positionalIndex];
  if (byIndex) {
    return { ...item, status: 'needs-reattach', resolvedMessageId: byIndex.messageId };
  }

  // 4. Not found - orphaned
  return { ...item, status: 'orphaned', resolvedMessageId: null };
}

/**
 * Resolves multiple SavedItems against current messages
 */
export function resolveSavedItems(
  items: SavedItem[],
  messages: ChatMessage[]
): ResolvedSavedItem[] {
  return items.map(item => resolveSavedItem(item, messages));
}

/**
 * Gets available continuation target platforms (excludes current)
 */
export function getAvailableTargets(currentPlatform: ChatPlatformId): ChatPlatformId[] {
  const all: ChatPlatformId[] = ['chatgpt', 'claude', 'perplexity', 'grok', 'gemini', 'copilot', 'lovable'];
  return all.filter(p => p !== currentPlatform);
}

// ============================================================================
// Global Saved Items View Utilities
// ============================================================================

/**
 * Grouped saved items by platform and conversation
 */
export interface GroupedSavedItems {
  platform: ChatPlatformId;
  platformName: string;
  conversations: Array<{
    conversationKey: string;
    title: string;
    items: SavedItem[];
  }>;
}

/**
 * Groups saved items by platform and conversation for global view
 * Sorted by most recent first
 */
export function groupSavedItemsByPlatform(items: SavedItem[]): GroupedSavedItems[] {
  const byPlatform = new Map<ChatPlatformId, Map<string, SavedItem[]>>();

  // Group items by platform -> conversationKey
  items.forEach(item => {
    if (!byPlatform.has(item.sourcePlatform)) {
      byPlatform.set(item.sourcePlatform, new Map());
    }
    const convMap = byPlatform.get(item.sourcePlatform)!;
    if (!convMap.has(item.conversationKey)) {
      convMap.set(item.conversationKey, []);
    }
    convMap.get(item.conversationKey)!.push(item);
  });

  // Convert to result structure
  const result: GroupedSavedItems[] = [];
  byPlatform.forEach((convMap, platform) => {
    const conversations: GroupedSavedItems['conversations'] = [];
    convMap.forEach((convItems, key) => {
      // Sort items within conversation by createdAt descending
      const sortedItems = convItems.sort((a, b) => b.createdAt - a.createdAt);
      conversations.push({
        conversationKey: key,
        title: sortedItems[0]?.label.substring(0, 50) || 'Untitled',
        items: sortedItems
      });
    });
    // Sort conversations by most recent item
    conversations.sort((a, b) => b.items[0].createdAt - a.items[0].createdAt);
    result.push({
      platform,
      platformName: PLATFORM_INFO[platform].name,
      conversations
    });
  });

  // Sort platforms by most recent item overall
  result.sort((a, b) => {
    const aTime = a.conversations[0]?.items[0]?.createdAt || 0;
    const bTime = b.conversations[0]?.items[0]?.createdAt || 0;
    return bTime - aTime;
  });

  return result;
}

/**
 * Gets the URL for a conversation to enable cross-conversation navigation
 */
export function getConversationUrl(platform: ChatPlatformId, conversationKey: string): string {
  const convId = conversationKey.split(':')[1];
  switch (platform) {
    case 'chatgpt':
      return `https://chatgpt.com/c/${convId}`;
    case 'claude':
      return `https://claude.ai/chat/${convId}`;
    case 'perplexity':
      return `https://www.perplexity.ai/search/${convId}`;
    case 'grok':
      return `https://x.com/i/grok?conversation=${convId}`;
    case 'gemini':
      return `https://gemini.google.com/app/${convId}`;
    case 'copilot':
      return `https://copilot.microsoft.com/c/${convId}`;
    case 'lovable':
      return `https://lovable.dev/projects/${convId}`;
    default:
      return PLATFORM_INFO[platform].newChatUrl;
  }
}
