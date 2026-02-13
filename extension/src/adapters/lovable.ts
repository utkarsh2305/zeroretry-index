/**
 * Lovable Adapter
 * Implements ChatAdapter interface for Lovable (https://lovable.dev)
 */

import { ChatAdapter, ChatMessage, ChatPlatformId, ChatRole, TitleResult } from './base';

/**
 * DOM selectors for Lovable chat message containers
 * Using multi-selector approach with fallbacks since Lovable's DOM isn't publicly documented
 */
const USER_SELECTORS = [
  '[data-role="user"]',
  '[data-testid="user-message"]',
  '[data-author="user"]',
  '.user-message',
  '[role="user"]'
];

const ASSISTANT_SELECTORS = [
  '[data-role="assistant"]',
  '[data-testid="assistant-message"]',
  '[data-author="assistant"]',
  '.assistant-message',
  '[role="assistant"]'
];

/**
 * Lovable adapter implementation
 */
class LovableAdapter implements ChatAdapter {
  readonly id: ChatPlatformId = 'lovable';

  private messageObserver: MutationObserver | null = null;
  private titleObserver: MutationObserver | null = null;
  private lastConversationId: string | null = null;

  /**
   * Checks if the given URL is for Lovable
   */
  match(url: URL): boolean {
    return url.hostname === 'lovable.dev';
  }

  /**
   * Returns the current conversation/project ID from the URL
   * URL pattern: https://lovable.dev/projects/<project-id>
   */
  getConversationId(): string | null {
    const match = window.location.pathname.match(/^\/projects\/([a-zA-Z0-9_-]+)/i);
    return match ? match[1] : null;
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

    return messages;
  }

  /**
   * Observes for new messages
   */
  observeNewMessages(onChange: () => void): () => void {
    if (this.messageObserver) {
      this.messageObserver.disconnect();
    }

    this.messageObserver = new MutationObserver(() => {
      onChange();
    });

    this.messageObserver.observe(document.body, {
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

  /**
   * Scrolls to a specific message
   */
  scrollToMessage(messageId: string): boolean {
    const messages = this.getMessages();
    const targetIndex = messages.findIndex(m => m.messageId === messageId);

    if (targetIndex === -1) return false;

    const allElements = this.findMessageElements();

    if (targetIndex < allElements.length) {
      const element = allElements[targetIndex].element;
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return true;
    }

    return false;
  }

  /**
   * Observes for conversation changes (project navigation)
   */
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
    return { value: `Project – ${ts}`, source: 'fallback' };
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
 * Singleton instance of the Lovable adapter
 */
export const lovableAdapter: ChatAdapter = new LovableAdapter();
