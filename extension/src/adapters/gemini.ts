/**
 * Gemini Adapter
 * Implements ChatAdapter interface for Google Gemini (https://gemini.google.com)
 */

import { ChatAdapter, ChatMessage, ChatPlatformId, ChatRole, TitleResult } from './base';

/**
 * DOM selectors for Gemini message containers
 * Note: These selectors are estimated and may need adjustment based on actual DOM structure
 */
const USER_MESSAGE_SELECTOR = '[data-message-author-type="human"]';
const ASSISTANT_MESSAGE_SELECTOR = '[data-message-author-type="model"]';

// Fallback selectors
const USER_FALLBACK_SELECTOR = '.user-query, .human-turn, .query-text';
const ASSISTANT_FALLBACK_SELECTOR = '.model-response, .model-turn, .response-text';

/**
 * Gemini adapter implementation
 */
class GeminiAdapter implements ChatAdapter {
  readonly id: ChatPlatformId = 'gemini';

  private messageObserver: MutationObserver | null = null;
  private titleObserver: MutationObserver | null = null;
  private lastConversationId: string | null = null;

  /**
   * Checks if the given URL is from Google Gemini
   */
  match(url: URL): boolean {
    return url.hostname === 'gemini.google.com';
  }

  /**
   * Returns the current conversation ID from the URL
   * URL patterns:
   * - https://gemini.google.com/app/<conversation-id>
   * - https://gemini.google.com/chat/<conversation-id>
   */
  getConversationId(): string | null {
    // Try /app/<id> pattern
    const appMatch = window.location.pathname.match(/^\/app\/([a-zA-Z0-9_-]+)/i);
    if (appMatch) {
      return appMatch[1];
    }

    // Try /chat/<id> pattern
    const chatMatch = window.location.pathname.match(/^\/chat\/([a-zA-Z0-9_-]+)/i);
    if (chatMatch) {
      return chatMatch[1];
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
   * Finds message elements using primary or fallback selectors
   */
  private findMessageElements(): Array<{ element: HTMLElement; role: ChatRole }> {
    const allMessages: Array<{ element: HTMLElement; role: ChatRole }> = [];

    // Try primary selectors first
    let userElements = document.querySelectorAll(USER_MESSAGE_SELECTOR);
    let assistantElements = document.querySelectorAll(ASSISTANT_MESSAGE_SELECTOR);

    // If primary selectors don't find anything, try fallbacks
    if (userElements.length === 0) {
      userElements = document.querySelectorAll(USER_FALLBACK_SELECTOR);
    }
    if (assistantElements.length === 0) {
      assistantElements = document.querySelectorAll(ASSISTANT_FALLBACK_SELECTOR);
    }

    userElements.forEach((el) => {
      allMessages.push({ element: el as HTMLElement, role: 'user' });
    });

    assistantElements.forEach((el) => {
      allMessages.push({ element: el as HTMLElement, role: 'assistant' });
    });

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
          domSelector: msg.role === 'user' ? USER_MESSAGE_SELECTOR : ASSISTANT_MESSAGE_SELECTOR
        });
      }
    });

    console.log('[ZeroRetry Index] Messages extracted:', messages.length);
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

    // Also poll for changes (Gemini may update URL via pushState)
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
    // 1. Try document.title (usually "Title - Google" or "Gemini")
    const docTitle = document.title;
    if (docTitle && docTitle !== 'Gemini' && !docTitle.startsWith('Gemini')) {
      const cleaned = docTitle.replace(/\s*[-–]\s*Google\s*$/, '').replace(/\s*[-–]\s*Gemini\s*$/, '').trim();
      if (cleaned && cleaned !== 'Google' && cleaned !== 'Gemini') {
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
 * Singleton instance of the Gemini adapter
 */
export const geminiAdapter: ChatAdapter = new GeminiAdapter();
