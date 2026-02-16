/**
 * Adapter Contract for Multi-Site Chat Extension
 * 
 * This module defines the interface between core functionality and platform-specific
 * implementations. Adapters are responsible for all DOM interactions and platform-specific
 * logic, while core modules work exclusively through the adapter interface.
 * 
 * IMPORTANT: Core modules must NEVER access DOM directly or use platform-specific selectors.
 * All platform-specific behavior must be encapsulated in adapter implementations.
 */

/**
 * Supported chat platforms
 */
export type ChatPlatformId = "chatgpt" | "claude" | "perplexity" | "grok" | "gemini" | "copilot";

/**
 * Role of a message in a conversation
 */
export type ChatRole = "user" | "assistant";

/**
 * Source of the conversation title
 */
export type TitleSource = "ui" | "derived" | "fallback";

/**
 * Result of title extraction
 */
export interface TitleResult {
  /** The title text */
  value: string;
  /** How the title was obtained */
  source: TitleSource;
}

/**
 * Represents a single message in a chat conversation
 */
export interface ChatMessage {
  /** Unique identifier for the message */
  messageId: string;
  
  /** Role of the message sender */
  role: ChatRole;
  
  /** Text content of the message */
  text: string;
  
  /** Optional DOM selector to locate the message element in the page */
  domSelector?: string;
}

/**
 * Platform-specific adapter interface
 * 
 * Each chat platform (ChatGPT, Claude, etc.) implements this interface to provide
 * a unified way to interact with conversations across different sites.
 */
export interface ChatAdapter {
  /** Identifier for this platform */
  readonly id: ChatPlatformId;
  
  /**
   * Checks if this adapter handles the given URL
   * @param url - The URL to check
   * @returns true if this adapter should be used for the URL
   */
  match(url: URL): boolean;
  
  /**
   * Gets the current conversation ID
   * @returns The conversation ID, or null if no conversation is active
   */
  getConversationId(): string | null;
  
  /**
   * Retrieves all messages in the current conversation
   * @returns Array of messages in chronological order
   */
  getMessages(): ChatMessage[];
  
  /**
   * Observes the conversation for new messages
   * @param onChange - Callback invoked when new messages are detected
   * @returns Unsubscribe function to stop observing
   */
  observeNewMessages(onChange: () => void): () => void;
  
  /**
   * Scrolls to a specific message in the conversation
   * @param messageId - The ID of the message to scroll to
   * @returns true if the message was found and scrolled to, false otherwise
   */
  scrollToMessage(messageId: string): boolean;
  
  /**
   * Observes for conversation changes (e.g., switching to a different conversation)
   * @param onChange - Callback invoked when the conversation changes
   * @returns Unsubscribe function to stop observing
   */
  onConversationChange(onChange: () => void): () => void;

  /**
   * Gets the conversation title
   * Resolution order: UI title → first user message → timestamped fallback
   * @returns Title result with value and source
   */
  getConversationTitle(): TitleResult;

  /**
   * Observes for title changes (e.g., when platform auto-generates title)
   * @param onChange - Callback invoked when title changes
   * @returns Unsubscribe function to stop observing
   */
  observeTitleChanges(onChange: () => void): () => void;

}
