/**
 * ChatGPT Adapter
 * Implements ChatAdapter interface for ChatGPT (https://chatgpt.com)
 */

import { ChatAdapter, ChatMessage, ChatPlatformId, ChatRole, TitleResult } from './base';

/**
 * DOM selector for message wrappers in ChatGPT
 */
const MESSAGE_WRAPPER_SELECTOR = '[data-message-author-role][data-message-id]';

/**
 * ChatGPT adapter implementation
 */
class ChatGPTAdapter implements ChatAdapter {
  readonly id: ChatPlatformId = 'chatgpt';

  private messageObserver: MutationObserver | null = null;
  private conversationObserver: MutationObserver | null = null;
  private titleObserver: MutationObserver | null = null;
  private lastConversationId: string | null = null;

  /**
   * Checks if the given URL is from ChatGPT
   */
  match(url: URL): boolean {
    return url.hostname === 'chatgpt.com';
  }

  /**
   * Returns the current conversation ID from the URL
   * URL pattern: https://chatgpt.com/c/<conversation-id>
   */
  getConversationId(): string | null {
    const match = window.location.pathname.match(/^\/c\/([a-z0-9-]+)/i);
    return match ? match[1] : null;
  }

  /**
   * Extracts the role from the data attribute
   */
  private parseRole(roleStr: string): ChatRole {
    return roleStr === 'user' || roleStr === 'assistant' ? roleStr : 'assistant';
  }

  /**
   * Extracts text content from a message wrapper
   */
  private extractMessageText(wrapper: HTMLElement): string {
    return (wrapper.innerText ?? '').trim().replace(/\s+/g, ' ');
  }

  /**
   * Returns all messages in the current conversation
   */
  getMessages(): ChatMessage[] {
    const messages: ChatMessage[] = [];
    const wrappers = document.querySelectorAll(MESSAGE_WRAPPER_SELECTOR);

    wrappers.forEach((wrapper) => {
      const element = wrapper as HTMLElement;
      const roleStr = element.getAttribute('data-message-author-role');
      const messageId = element.getAttribute('data-message-id');

      if (roleStr && messageId) {
        const role = this.parseRole(roleStr);
        const text = this.extractMessageText(element);

        if (text) {
          messages.push({
            messageId,
            role,
            text,
            domSelector: MESSAGE_WRAPPER_SELECTOR + `[data-message-id="${messageId}"]`
          });
        }
      }
    });

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
    const selector = `${MESSAGE_WRAPPER_SELECTOR}[data-message-id="${messageId}"]`;
    const element = document.querySelector(selector) as HTMLElement;

    if (element) {
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

    // Also poll for changes (ChatGPT may update URL via pushState)
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
   * Resolution order: document.title → sidebar nav → first user message → timestamp
   */
  getConversationTitle(): TitleResult {
    // 1. Try document.title (usually "ConvTitle - ChatGPT")
    const docTitle = document.title;
    if (docTitle && !docTitle.startsWith('ChatGPT')) {
      const cleaned = docTitle.replace(/\s*[-–]\s*ChatGPT\s*$/, '').trim();
      if (cleaned && cleaned !== 'New chat') {
        return { value: this.normalizeTitle(cleaned), source: 'ui' };
      }
    }

    // 2. Try active conversation in sidebar
    const activeNav = document.querySelector('nav [data-testid="conversation-button"][data-active="true"]');
    if (activeNav?.textContent) {
      const navText = activeNav.textContent.trim();
      if (navText && navText !== 'New chat') {
        return { value: this.normalizeTitle(navText), source: 'ui' };
      }
    }

    // 3. Derived from first user message
    const derived = this.getDerivedTitle();
    if (derived) return derived;

    // 4. Timestamp fallback
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
 * Singleton instance of the ChatGPT adapter
 */
export const chatgptAdapter: ChatAdapter = new ChatGPTAdapter();
