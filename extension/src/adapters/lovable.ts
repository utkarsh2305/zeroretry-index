/**
 * Lovable Adapter
 * Implements ChatAdapter interface for Lovable (https://lovable.dev)
 *
 * DOM structure (discovered via DevTools):
 * - Messages: <div data-message-id="aimsg_..." ...> (AI) or <div data-message-id="..." ...> (user)
 * - Content: child div with class containing "PromptBox_customProse" (CSS modules)
 * - Chat panel: <div data-chat-panel="true">
 */

import { ChatAdapter, ChatMessage, ChatPlatformId, ChatRole, TitleResult } from './base';

/** Selector for all message containers */
const MESSAGE_SELECTOR = '[data-message-id]';
/** Selector for message content (CSS modules class with fallback) */
const CONTENT_SELECTOR = '[class*="PromptBox_customProse"], .prose';
/** Selector for the chat panel container */
const CHAT_PANEL_SELECTOR = '[data-chat-panel="true"]';
/** AI message IDs start with this prefix */
const AI_MESSAGE_PREFIX = 'aimsg_';
/** Pattern matching Lovable's timestamp dividers, e.g. "11 Feb at 14:03" */
const TIMESTAMP_PATTERN = /^\d{1,2}\s+\w{3,9}\s+at\s+\d{1,2}:\d{2}$/;

/**
 * Lovable adapter implementation
 */
class LovableAdapter implements ChatAdapter {
  readonly id: ChatPlatformId = 'lovable';

  private messageObserver: MutationObserver | null = null;
  private titleObserver: MutationObserver | null = null;
  private lastConversationId: string | null = null;
  private messageCache = new Map<string, ChatMessage>();
  private cachedConversationId: string | null = null;

  match(url: URL): boolean {
    return url.hostname === 'lovable.dev';
  }

  /**
   * Returns the current project ID from the URL
   * URL pattern: https://lovable.dev/projects/<project-id>
   */
  getConversationId(): string | null {
    const match = window.location.pathname.match(/^\/projects\/([a-zA-Z0-9_-]+)/i);
    return match ? match[1] : null;
  }

  /**
   * Extracts text content from a message element
   * Looks for the PromptBox_customProse content div first, then falls back to .prose
   */
  private extractMessageText(element: HTMLElement): string {
    const contentEl = element.querySelector(CONTENT_SELECTOR) as HTMLElement | null;
    const target = contentEl || element;
    return (target.innerText ?? '').trim().replace(/\s+/g, ' ');
  }

  /**
   * Finds all message elements in the DOM and determines their role
   */
  private findMessageElements(): Array<{ element: HTMLElement; role: ChatRole; messageId: string }> {
    const elements = document.querySelectorAll(MESSAGE_SELECTOR);
    const results: Array<{ element: HTMLElement; role: ChatRole; messageId: string }> = [];

    elements.forEach(el => {
      const msgId = el.getAttribute('data-message-id');
      if (!msgId) return;

      const role: ChatRole = msgId.startsWith(AI_MESSAGE_PREFIX) ? 'assistant' : 'user';
      results.push({ element: el as HTMLElement, role, messageId: msgId });
    });

    return results;
  }

  /**
   * Reads messages currently visible in the DOM
   */
  private readDomMessages(): ChatMessage[] {
    const messages: ChatMessage[] = [];
    const allMessages = this.findMessageElements();

    allMessages.forEach(msg => {
      let text = this.extractMessageText(msg.element);

      if (!text) return;

      // Skip pure timestamp dividers (e.g. "11 Feb at 14:03")
      if (TIMESTAMP_PATTERN.test(text)) return;

      // Strip leading timestamp prefix from real messages
      text = text.replace(/^\d{1,2}\s+\w{3,9}\s+at\s+\d{1,2}:\d{2}\s+/, '');

      if (text) {
        messages.push({
          messageId: msg.messageId,
          role: msg.role,
          text,
          domSelector: `[data-message-id="${msg.messageId}"]`
        });
      }
    });

    return messages;
  }

  /**
   * Returns all messages, using a cache to survive DOM virtualization.
   * Lovable removes off-screen messages from the DOM when scrolling,
   * so we merge current DOM messages into a persistent cache.
   */
  getMessages(): ChatMessage[] {
    // Clear cache if conversation changed
    const currentConvId = this.getConversationId();
    if (currentConvId !== this.cachedConversationId) {
      this.messageCache.clear();
      this.cachedConversationId = currentConvId;
    }

    // Read current DOM and merge into cache
    const domMessages = this.readDomMessages();
    for (const msg of domMessages) {
      this.messageCache.set(msg.messageId, msg);
    }

    // Return all cached messages
    return Array.from(this.messageCache.values());
  }

  observeNewMessages(onChange: () => void): () => void {
    if (this.messageObserver) {
      this.messageObserver.disconnect();
    }

    this.messageObserver = new MutationObserver(() => {
      onChange();
    });

    // Observe the chat panel if available, otherwise fall back to body
    const chatPanel = document.querySelector(CHAT_PANEL_SELECTOR) || document.body;

    this.messageObserver.observe(chatPanel, {
      childList: true,
      subtree: true
    });

    return () => {
      if (this.messageObserver) {
        this.messageObserver.disconnect();
        this.messageObserver = null;
      }
    };
  }

  scrollToMessage(messageId: string): boolean {
    const el = document.querySelector(`[data-message-id="${messageId}"]`) as HTMLElement | null;
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return true;
    }
    return false;
  }

  onConversationChange(onChange: () => void): () => void {
    this.lastConversationId = this.getConversationId();

    const handleLocationChange = () => {
      const newConversationId = this.getConversationId();
      if (newConversationId !== this.lastConversationId) {
        this.lastConversationId = newConversationId;
        onChange();
      }
    };

    window.addEventListener('popstate', handleLocationChange);
    const pollInterval = setInterval(handleLocationChange, 1000);

    return () => {
      window.removeEventListener('popstate', handleLocationChange);
      clearInterval(pollInterval);
    };
  }

  private normalizeTitle(text: string): string {
    return text.replace(/\s+/g, ' ').trim().substring(0, 80);
  }

  private getTimestampFallback(): TitleResult {
    const now = new Date();
    const ts = now.toISOString().slice(0, 16).replace('T', ' ');
    return { value: `Project – ${ts}`, source: 'fallback' };
  }

  private getDerivedTitle(): TitleResult | null {
    const messages = this.getMessages();
    const firstUser = messages.find(m => m.role === 'user');
    if (firstUser?.text) {
      return { value: this.normalizeTitle(firstUser.text), source: 'derived' };
    }
    return null;
  }

  getConversationTitle(): TitleResult {
    const docTitle = document.title;
    const lovableBranding = ['Lovable', 'lovable.dev'];

    if (docTitle) {
      let cleaned = docTitle;

      for (const brand of lovableBranding) {
        cleaned = cleaned.replace(new RegExp(`\\s*[-–|:]\\s*${brand}.*$`, 'i'), '').trim();
      }

      if (cleaned && !lovableBranding.some(b => cleaned.toLowerCase() === b.toLowerCase())) {
        return { value: this.normalizeTitle(cleaned), source: 'ui' };
      }
    }

    const derived = this.getDerivedTitle();
    if (derived) return derived;

    return this.getTimestampFallback();
  }

  observeTitleChanges(onChange: () => void): () => void {
    if (this.titleObserver) {
      this.titleObserver.disconnect();
    }

    this.titleObserver = new MutationObserver(() => {
      onChange();
    });

    const titleEl = document.querySelector('title');
    if (titleEl) {
      this.titleObserver.observe(titleEl, {
        childList: true,
        characterData: true,
        subtree: true
      });
    }

    return () => {
      this.titleObserver?.disconnect();
      this.titleObserver = null;
    };
  }

  /**
   * Scrolls the chat container upward repeatedly to trigger lazy-loading
   * of all older messages before indexing begins.
   */
  async preloadAllMessages(): Promise<void> {
    const chatPanel = document.querySelector(CHAT_PANEL_SELECTOR) as HTMLElement | null;
    if (!chatPanel) return;

    // Find the scrollable container
    const scrollable = chatPanel.scrollHeight > chatPanel.clientHeight
      ? chatPanel
      : (chatPanel.querySelector('[style*="overflow"]') as HTMLElement) || chatPanel;

    let lastCount = document.querySelectorAll(MESSAGE_SELECTOR).length;
    let attempts = 0;
    const MAX_ATTEMPTS = 20;

    while (attempts < MAX_ATTEMPTS) {
      scrollable.scrollTop = 0;
      await new Promise(r => setTimeout(r, 600));

      const newCount = document.querySelectorAll(MESSAGE_SELECTOR).length;
      if (newCount === lastCount) break;
      lastCount = newCount;
      attempts++;
    }

    // Restore scroll to bottom so user sees latest messages
    scrollable.scrollTop = scrollable.scrollHeight;
  }
}

export const lovableAdapter: ChatAdapter = new LovableAdapter();
