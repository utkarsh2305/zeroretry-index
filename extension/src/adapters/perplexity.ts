/**
 * Perplexity Adapter
 * Implements ChatAdapter interface for Perplexity (https://perplexity.ai)
 */

import { ChatAdapter, ChatMessage, ChatPlatformId, ChatRole, TitleResult } from './base';

/**
 * Debug flag for Perplexity-specific logging
 * Set to true to enable detailed extraction logging
 */
const PERPLEXITY_DEBUG = false;

/**
 * Perplexity-specific debug logging
 */
function debugLog(...args: unknown[]): void {
  if (PERPLEXITY_DEBUG) {
    console.log('[ZeroRetry Perplexity]', ...args);
  }
}

/**
 * User message selectors - tried in order until one matches
 */
const USER_SELECTORS = [
  // Data attributes (most reliable if present)
  '[data-testid="query-block"]',
  '[data-testid="user-query"]',
  '[data-testid="question"]',
  '[data-testid="user-message"]',
  // Class-based patterns
  '.whitespace-pre-line',
  'div[class*="query"]',
  'div[class*="question"]',
  // Structural patterns
  '.prose-user',
  '[role="user"]',
  // Generic fallbacks
  '.query-text',
  '.question-text'
];

/**
 * Assistant message selectors - tried in order until one matches
 */
const ASSISTANT_SELECTORS = [
  // Data attributes (most reliable if present)
  '[data-testid="answer-block"]',
  '[data-testid="response"]',
  '[data-testid="answer"]',
  '[data-testid="assistant-message"]',
  // Class-based patterns
  '.prose:not(.prose-user)',
  '.markdown',
  'div[class*="answer"]',
  'div[class*="response"]',
  // Structural patterns
  '[role="assistant"]',
  // Generic fallbacks
  '.answer-text',
  '.response-text'
];

/**
 * Perplexity adapter implementation
 */
class PerplexityAdapter implements ChatAdapter {
  readonly id: ChatPlatformId = 'perplexity';

  private messageObserver: MutationObserver | null = null;
  private titleObserver: MutationObserver | null = null;
  private lastConversationId: string | null = null;
  private lastSuccessfulUserSelector: string | null = null;
  private lastSuccessfulAssistantSelector: string | null = null;

  /**
   * Checks if the given URL is from Perplexity
   */
  match(url: URL): boolean {
    return url.hostname === 'perplexity.ai' || url.hostname === 'www.perplexity.ai';
  }

  /**
   * Returns the current conversation ID from the URL
   * URL patterns:
   * - https://www.perplexity.ai/search/<query-id>
   * - https://www.perplexity.ai/thread/<thread-id>
   */
  getConversationId(): string | null {
    const match = window.location.pathname.match(/\/(search|thread)\/([^/?]+)/i);
    if (match) {
      return match[2];
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
   * Tries each selector in the array and returns elements from the first one that matches
   */
  private trySelectors(selectors: string[], role: string): NodeListOf<Element> | null {
    for (const selector of selectors) {
      try {
        const elements = document.querySelectorAll(selector);
        debugLog(`Trying ${role} selector: ${selector} → ${elements.length} matches`);
        if (elements.length > 0) {
          // Log sample text from first match
          const sampleText = (elements[0] as HTMLElement).innerText?.substring(0, 80);
          debugLog(`  Sample: "${sampleText}..."`);
          return elements;
        }
      } catch (e) {
        debugLog(`  Selector error: ${selector}`, e);
      }
    }
    return null;
  }

  /**
   * Finds message elements using multiple selector strategies with logging
   */
  private findMessageElements(): Array<{ element: HTMLElement; role: ChatRole; selector: string }> {
    const allMessages: Array<{ element: HTMLElement; role: ChatRole; selector: string }> = [];

    debugLog('=== Finding message elements ===');

    // Try user selectors
    const userElements = this.trySelectors(USER_SELECTORS, 'user');
    if (userElements && userElements.length > 0) {
      this.lastSuccessfulUserSelector = USER_SELECTORS.find(s => {
        try { return document.querySelectorAll(s).length > 0; } catch { return false; }
      }) || null;
      userElements.forEach((el) => {
        allMessages.push({
          element: el as HTMLElement,
          role: 'user',
          selector: this.lastSuccessfulUserSelector || 'unknown'
        });
      });
    }

    // Try assistant selectors
    const assistantElements = this.trySelectors(ASSISTANT_SELECTORS, 'assistant');
    if (assistantElements && assistantElements.length > 0) {
      this.lastSuccessfulAssistantSelector = ASSISTANT_SELECTORS.find(s => {
        try { return document.querySelectorAll(s).length > 0; } catch { return false; }
      }) || null;
      assistantElements.forEach((el) => {
        allMessages.push({
          element: el as HTMLElement,
          role: 'assistant',
          selector: this.lastSuccessfulAssistantSelector || 'unknown'
        });
      });
    }

    debugLog(`Found ${allMessages.filter(m => m.role === 'user').length} user, ${allMessages.filter(m => m.role === 'assistant').length} assistant elements`);

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
   * Discovery mode: logs potential message containers when extraction fails
   */
  private discoverSelectors(): void {
    debugLog('=== Selector Discovery Mode ===');
    debugLog('No messages found with known selectors. Scanning DOM for candidates...');

    const candidates: Array<{ selector: string; text: string; depth: number }> = [];
    const seen = new Set<string>();

    // Find all elements with data-testid
    document.querySelectorAll('[data-testid]').forEach(el => {
      const testId = el.getAttribute('data-testid');
      const text = (el as HTMLElement).innerText?.trim();
      if (testId && text && text.length > 20 && text.length < 3000) {
        const selector = `[data-testid="${testId}"]`;
        if (!seen.has(selector)) {
          seen.add(selector);
          candidates.push({ selector, text: text.substring(0, 100), depth: this.getDepth(el) });
        }
      }
    });

    // Find divs with meaningful class names
    document.querySelectorAll('div[class]').forEach(el => {
      const classes = el.className;
      const text = (el as HTMLElement).innerText?.trim();
      if (typeof classes === 'string' && text && text.length > 20 && text.length < 3000) {
        // Look for classes that might indicate messages
        const interestingPatterns = ['message', 'query', 'answer', 'response', 'chat', 'prose', 'content', 'text'];
        const hasInteresting = interestingPatterns.some(p => classes.toLowerCase().includes(p));
        if (hasInteresting) {
          const firstClass = classes.split(' ')[0];
          const selector = `.${firstClass}`;
          if (!seen.has(selector)) {
            seen.add(selector);
            candidates.push({ selector, text: text.substring(0, 100), depth: this.getDepth(el) });
          }
        }
      }
    });

    // Sort by depth (prefer shallower elements) and log top candidates
    candidates.sort((a, b) => a.depth - b.depth);

    debugLog(`Found ${candidates.length} potential message containers:`);
    candidates.slice(0, 15).forEach((c, i) => {
      debugLog(`  ${i + 1}. ${c.selector} (depth ${c.depth})`);
      debugLog(`     "${c.text}..."`);
    });

    if (candidates.length === 0) {
      debugLog('No candidates found. Page may still be loading or uses unusual structure.');
    }
  }

  /**
   * Gets the DOM depth of an element
   */
  private getDepth(el: Element): number {
    let depth = 0;
    let current: Element | null = el;
    while (current && current !== document.body) {
      depth++;
      current = current.parentElement;
    }
    return depth;
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
          domSelector: msg.selector
        });
      }
    });

    debugLog(`Messages extracted: ${messages.length} (${messages.filter(m => m.role === 'user').length} user, ${messages.filter(m => m.role === 'assistant').length} assistant)`);

    // If extraction failed, run discovery mode to help identify selectors
    if (messages.length < 2) {
      this.discoverSelectors();
    }

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

    // Also poll for changes (Perplexity may update URL via pushState)
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
   * Resolution order: document.title → search title → first user message → timestamp
   */
  getConversationTitle(): TitleResult {
    // 1. Try document.title
    const docTitle = document.title;
    if (docTitle && !docTitle.startsWith('Perplexity')) {
      const cleaned = docTitle.replace(/\s*[-–]\s*Perplexity\s*$/, '').trim();
      if (cleaned && cleaned !== 'Perplexity') {
        return { value: this.normalizeTitle(cleaned), source: 'ui' };
      }
    }

    // 2. Try search/thread title element
    const titleEl = document.querySelector('.search-title, h1[class*="title"], [data-testid="thread-title"]');
    if (titleEl?.textContent) {
      const titleText = titleEl.textContent.trim();
      if (titleText) {
        return { value: this.normalizeTitle(titleText), source: 'ui' };
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
 * Singleton instance of the Perplexity adapter
 */
export const perplexityAdapter: ChatAdapter = new PerplexityAdapter();
