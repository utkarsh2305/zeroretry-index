/**
 * Microsoft Copilot Adapter
 * Implements ChatAdapter interface for Microsoft Copilot (https://copilot.microsoft.com)
 */

import { ChatAdapter, ChatMessage, ChatPlatformId, ChatRole, TitleResult } from './base';

/**
 * DOM selectors for Copilot message containers
 * Using multi-selector approach with fallbacks since Copilot's DOM isn't publicly documented
 */
const USER_SELECTORS = [
  '[data-testid="user-message"]',
  '[data-content="user-message"]',
  '[data-author="user"]',
  '.user-message',
  '.cib-message-user',
  '[role="user"]'
];

const ASSISTANT_SELECTORS = [
  '[data-testid="bot-message"]',
  '[data-testid="assistant-message"]',
  '[data-author="bot"]',
  '[data-author="assistant"]',
  '.assistant-message',
  '.cib-message-bot',
  '[role="assistant"]'
];

/**
 * Microsoft Copilot adapter implementation
 */
class CopilotAdapter implements ChatAdapter {
  readonly id: ChatPlatformId = 'copilot';

  private messageObserver: MutationObserver | null = null;
  private titleObserver: MutationObserver | null = null;
  private lastConversationId: string | null = null;

  /**
   * Checks if the given URL is for Microsoft Copilot
   */
  match(url: URL): boolean {
    return url.hostname === 'copilot.microsoft.com';
  }

  /**
   * Returns the current conversation ID from the URL
   * URL patterns to try:
   * - https://copilot.microsoft.com/c/<id>
   * - https://copilot.microsoft.com/thread/<id>
   * - https://copilot.microsoft.com?conversationId=<id>
   * - https://copilot.microsoft.com?threadId=<id>
   */
  getConversationId(): string | null {
    // Try query parameters first
    const params = new URLSearchParams(window.location.search);
    const convId = params.get('conversationId') || params.get('threadId') || params.get('id');
    if (convId) {
      return convId;
    }

    // Try path-based ID patterns
    const pathPatterns = [
      /^\/c\/([a-zA-Z0-9_-]+)/i,
      /^\/thread\/([a-zA-Z0-9_-]+)/i,
      /^\/chats?\/([a-zA-Z0-9_-]+)/i
    ];

    for (const pattern of pathPatterns) {
      const match = window.location.pathname.match(pattern);
      if (match) {
        return match[1];
      }
    }

    // Fallback: generate ID from URL if no explicit ID found
    return this.generateFallbackId();
  }

  /**
   * Simple hash function for generating stable IDs
   */
  private simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash).toString(36);
  }

  /**
   * Generates a fallback conversation ID when URL doesn't contain one
   */
  private generateFallbackId(): string {
    const hash = this.simpleHash(window.location.pathname + window.location.search);
    return `fallback-${hash}`;
  }

  /**
   * Generates a stable message ID from index and text content
   */
  private generateMessageId(index: number, text: string): string {
    const hash = this.simpleHash(text.substring(0, 50));
    return `msg-${index}-${hash}`;
  }

  /**
   * Extracts text content from a message element
   */
  private extractMessageText(element: HTMLElement): string {
    return (element.innerText ?? '').trim().replace(/\s+/g, ' ');
  }

  /**
   * Tries multiple selectors and returns elements from the first one that works
   */
  private queryWithFallbacks(selectors: string[]): NodeListOf<Element> | null {
    for (const selector of selectors) {
      try {
        const elements = document.querySelectorAll(selector);
        if (elements.length > 0) {
          return elements;
        }
      } catch {
        // Invalid selector, try next
      }
    }
    return null;
  }

  /**
   * Finds message elements using primary or fallback selectors
   */
  private findMessageElements(): Array<{ element: HTMLElement; role: ChatRole }> {
    const allMessages: Array<{ element: HTMLElement; role: ChatRole }> = [];

    // Try to find user and assistant messages
    const userElements = this.queryWithFallbacks(USER_SELECTORS);
    const assistantElements = this.queryWithFallbacks(ASSISTANT_SELECTORS);

    if (userElements) {
      userElements.forEach((el) => {
        allMessages.push({ element: el as HTMLElement, role: 'user' });
      });
    }

    if (assistantElements) {
      assistantElements.forEach((el) => {
        allMessages.push({ element: el as HTMLElement, role: 'assistant' });
      });
    }

    // Sort by document position to get chronological order
    allMessages.sort((a, b) => {
      const position = a.element.compareDocumentPosition(b.element);
      if (position & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
      if (position & Node.DOCUMENT_POSITION_PRECEDING) return 1;
      return 0;
    });

    return allMessages;
  }

  /**
   * Returns all messages in the current conversation
   */
  getMessages(): ChatMessage[] {
    const messages: ChatMessage[] = [];
    const allMessages = this.findMessageElements();

    // Build message array
    allMessages.forEach((msg, index) => {
      const text = this.extractMessageText(msg.element);

      if (text) {
        const messageId = this.generateMessageId(index, text);

        messages.push({
          messageId,
          role: msg.role,
          text,
          domSelector: msg.role === 'user' ? USER_SELECTORS[0] : ASSISTANT_SELECTORS[0]
        });
      }
    });

    console.log('[ZeroRetry Index] Copilot messages extracted:', messages.length);
    return messages;
  }

  /**
   * Observes for new messages
   */
  observeNewMessages(onChange: () => void): () => void {
    // Clean up any existing observer
    if (this.messageObserver) {
      this.messageObserver.disconnect();
    }

    // Create a mutation observer to watch for new message elements
    this.messageObserver = new MutationObserver(() => {
      onChange();
    });

    // Observe the document body for added nodes
    this.messageObserver.observe(document.body, {
      childList: true,
      subtree: true
    });

    // Return unsubscribe function
    return () => {
      if (this.messageObserver) {
        this.messageObserver.disconnect();
        this.messageObserver = null;
      }
    };
  }

  /**
   * Scrolls to a specific message
   */
  scrollToMessage(messageId: string): boolean {
    // Get all messages and find the one with matching ID
    const messages = this.getMessages();
    const targetIndex = messages.findIndex(m => m.messageId === messageId);

    if (targetIndex === -1) return false;

    // Re-find elements to scroll to the correct one
    const allElements = this.findMessageElements();

    if (targetIndex < allElements.length) {
      const element = allElements[targetIndex].element;
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return true;
    }

    return false;
  }

  /**
   * Observes for conversation changes
   */
  onConversationChange(onChange: () => void): () => void {
    // Store initial conversation ID
    this.lastConversationId = this.getConversationId();

    // Check for URL changes using popstate and a polling fallback
    const handleLocationChange = () => {
      const newConversationId = this.getConversationId();
      if (newConversationId !== this.lastConversationId) {
        this.lastConversationId = newConversationId;
        onChange();
      }
    };

    // Listen for popstate (back/forward navigation)
    window.addEventListener('popstate', handleLocationChange);

    // Also poll for changes (Copilot may update URL via pushState)
    const pollInterval = setInterval(handleLocationChange, 1000);

    // Return unsubscribe function
    return () => {
      window.removeEventListener('popstate', handleLocationChange);
      clearInterval(pollInterval);
    };
  }

  /**
   * Normalizes title text
   */
  private normalizeTitle(text: string): string {
    return text.replace(/\s+/g, ' ').trim().substring(0, 80);
  }

  /**
   * Returns a timestamp-based fallback title
   */
  private getTimestampFallback(): TitleResult {
    const now = new Date();
    const ts = now.toISOString().slice(0, 16).replace('T', ' ');
    return { value: `Chat – ${ts}`, source: 'fallback' };
  }

  /**
   * Derives title from first user message
   */
  private getDerivedTitle(): TitleResult | null {
    const messages = this.getMessages();
    const firstUser = messages.find(m => m.role === 'user');
    if (firstUser?.text) {
      return { value: this.normalizeTitle(firstUser.text), source: 'derived' };
    }
    return null;
  }

  /**
   * Gets the conversation title
   * Resolution order: document.title → first user message → timestamp
   */
  getConversationTitle(): TitleResult {
    // 1. Try document.title (usually "Title - Microsoft Copilot" or similar)
    const docTitle = document.title;
    const copilotBranding = ['Microsoft Copilot', 'Copilot', 'Your AI companion'];

    if (docTitle) {
      let cleaned = docTitle;

      // Remove common branding suffixes
      for (const brand of copilotBranding) {
        cleaned = cleaned.replace(new RegExp(`\\s*[-–|:]\\s*${brand}.*$`, 'i'), '').trim();
      }

      // Check if we have meaningful content after cleaning
      if (cleaned && !copilotBranding.some(b => cleaned.toLowerCase() === b.toLowerCase())) {
        return { value: this.normalizeTitle(cleaned), source: 'ui' };
      }
    }

    // 2. Derived from first user message
    const derived = this.getDerivedTitle();
    if (derived) return derived;

    // 3. Timestamp fallback
    return this.getTimestampFallback();
  }

  /**
   * Observes for title changes
   */
  observeTitleChanges(onChange: () => void): () => void {
    if (this.titleObserver) {
      this.titleObserver.disconnect();
    }

    this.titleObserver = new MutationObserver(() => {
      onChange();
    });

    // Observe document.title changes
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
}

/**
 * Singleton instance of the Copilot adapter
 */
export const copilotAdapter: ChatAdapter = new CopilotAdapter();
