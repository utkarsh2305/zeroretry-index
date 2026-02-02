/**
 * Bookmark Types and Resolution Logic
 * Provides resilient anchoring for bookmarked messages
 */

import type { ChatMessage } from '../adapters/base';

/**
 * Anchor data for locating a bookmarked message
 */
export interface BookmarkAnchor {
  /** Primary: adapter-generated message ID */
  messageId: string;
  /** Secondary: hash of normalized text content */
  contentHash: string;
  /** Tertiary: positional index in message order */
  positionalIndex: number;
}

/**
 * A bookmarked message
 */
export interface Bookmark {
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
}

/**
 * Resolution status for a bookmark
 */
export type BookmarkStatus = 'active' | 'needs-reattach' | 'orphaned';

/**
 * A bookmark with its resolution status
 */
export interface ResolvedBookmark extends Bookmark {
  /** Current resolution status */
  status: BookmarkStatus;
  /** Resolved message ID (null if orphaned) */
  resolvedMessageId: string | null;
}

/**
 * Generates a content hash from message text
 * Used for fuzzy matching when message IDs change
 */
export function contentHash(text: string): string {
  const normalized = text.toLowerCase().replace(/\s+/g, ' ').trim();
  let hash = 0;
  for (let i = 0; i < normalized.length; i++) {
    hash = ((hash << 5) - hash) + normalized.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

/**
 * Generates a UUID v4
 */
export function generateId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

/**
 * Creates a bookmark from a message
 */
export function createBookmark(
  message: ChatMessage,
  messageIndex: number,
  conversationKey: string,
  label?: string,
  tags?: string[]
): Bookmark {
  return {
    id: generateId(),
    conversationKey,
    anchor: {
      messageId: message.messageId,
      contentHash: contentHash(message.text),
      positionalIndex: messageIndex
    },
    label: label || message.text.substring(0, 50).replace(/\s+/g, ' ').trim(),
    createdAt: Date.now(),
    tags,
    cachedText: message.text.substring(0, 100).replace(/\s+/g, ' ').trim()
  };
}

/**
 * Resolves a bookmark against current messages
 *
 * Resolution order:
 * 1. Exact messageId match -> active
 * 2. Content hash match -> needs-reattach
 * 3. Positional index fallback -> needs-reattach
 * 4. Not found -> orphaned
 */
export function resolveBookmark(
  bookmark: Bookmark,
  messages: ChatMessage[]
): ResolvedBookmark {
  // 1. Try messageId match (exact)
  const byId = messages.find(m => m.messageId === bookmark.anchor.messageId);
  if (byId) {
    return { ...bookmark, status: 'active', resolvedMessageId: byId.messageId };
  }

  // 2. Try content hash match (message moved or ID changed)
  const byHash = messages.find(m => contentHash(m.text) === bookmark.anchor.contentHash);
  if (byHash) {
    return { ...bookmark, status: 'needs-reattach', resolvedMessageId: byHash.messageId };
  }

  // 3. Try positional fallback (last resort)
  const byIndex = messages[bookmark.anchor.positionalIndex];
  if (byIndex) {
    return { ...bookmark, status: 'needs-reattach', resolvedMessageId: byIndex.messageId };
  }

  // 4. Not found - orphaned
  return { ...bookmark, status: 'orphaned', resolvedMessageId: null };
}

/**
 * Resolves multiple bookmarks against current messages
 */
export function resolveBookmarks(
  bookmarks: Bookmark[],
  messages: ChatMessage[]
): ResolvedBookmark[] {
  return bookmarks.map(b => resolveBookmark(b, messages));
}

/**
 * Creates an updated anchor for reattaching a bookmark
 */
export function createUpdatedAnchor(
  message: ChatMessage,
  messageIndex: number
): BookmarkAnchor {
  return {
    messageId: message.messageId,
    contentHash: contentHash(message.text),
    positionalIndex: messageIndex
  };
}
