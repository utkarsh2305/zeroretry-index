/**
 * Adapter Index
 * Provides adapter selection based on URL
 */

import { ChatAdapter } from './base';
import { chatgptAdapter } from './chatgpt';

// Re-export types for use by other modules
export type { ChatAdapter, ChatMessage, ChatRole, ChatPlatformId, TitleSource, TitleResult } from './base';
import { claudeAdapter } from './claude';
import { perplexityAdapter } from './perplexity';
import { grokAdapter } from './grok';
import { geminiAdapter } from './gemini';
import { copilotAdapter } from './copilot';

/**
 * All available adapters
 */
const adapters: ChatAdapter[] = [
  chatgptAdapter,
  claudeAdapter,
  perplexityAdapter,
  grokAdapter,
  geminiAdapter,
  copilotAdapter
];

/**
 * Selects the appropriate adapter for the given URL
 * @param url - The URL to match against
 * @returns The matching adapter, or null if no adapter matches
 */
export function getAdapterForUrl(url: URL): ChatAdapter | null {
  for (const adapter of adapters) {
    if (adapter.match(url)) {
      return adapter;
    }
  }
  return null;
}
