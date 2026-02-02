/**
 * Cross-AI Handoff
 * Handles continuation from one AI platform to another
 */

import type { SavedItem } from './savedItem';
import { PLATFORM_INFO } from './savedItem';
import type { ChatPlatformId } from '../adapters/base';
import { buildContinuationPrompt } from './promptBuilder';

/**
 * Result of a handoff operation
 */
export interface HandoffResult {
  success: boolean;
  error?: string;
  copiedText?: string;
  targetUrl?: string;
}

/**
 * Performs cross-AI handoff:
 * 1. Builds continuation prompt
 * 2. Copies to clipboard
 * 3. Opens target AI in new tab
 */
export async function performHandoff(
  item: SavedItem,
  targetPlatform: ChatPlatformId
): Promise<HandoffResult> {
  try {
    // Build the prompt
    const prompt = buildContinuationPrompt(item, targetPlatform);

    // Validate prompt
    if (!prompt || prompt.trim().length === 0) {
      return { success: false, error: 'No content to copy' };
    }

    // Copy to clipboard
    await copyToClipboard(prompt);

    // Get target URL (caller will open the window after showing confirmation)
    const targetUrl = PLATFORM_INFO[targetPlatform].newChatUrl;

    return {
      success: true,
      copiedText: prompt,
      targetUrl
    };
  } catch (error) {
    console.error('[ZeroRetry] Handoff failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to copy to clipboard'
    };
  }
}

/**
 * Copies text to clipboard with fallback
 */
async function copyToClipboard(text: string): Promise<void> {
  // Try modern Clipboard API first
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      console.log('[ZeroRetry] Copied to clipboard via Clipboard API');
      return;
    }
  } catch (e) {
    console.warn('[ZeroRetry] Clipboard API failed, trying fallback:', e);
  }

  // Fallback to execCommand for older browsers or restricted contexts
  const textarea = document.createElement('textarea');
  textarea.value = text;
  Object.assign(textarea.style, {
    position: 'fixed',
    left: '-9999px',
    top: '-9999px'
  });
  document.body.appendChild(textarea);
  textarea.focus();  // Focus before select for better browser compatibility
  textarea.select();

  try {
    const success = document.execCommand('copy');
    if (!success) {
      throw new Error('Copy failed - please copy manually');
    }
    console.log('[ZeroRetry] Copied to clipboard via execCommand');
  } finally {
    document.body.removeChild(textarea);
  }
}

/**
 * Opens the target platform without copying (for manual copy flow)
 */
export function openTargetPlatform(targetPlatform: ChatPlatformId): void {
  const targetUrl = PLATFORM_INFO[targetPlatform].newChatUrl;
  window.open(targetUrl, '_blank');
}

/**
 * Gets the prompt text without performing handoff
 * Useful for preview or manual copy
 */
export function getHandoffPrompt(
  item: SavedItem,
  targetPlatform: ChatPlatformId
): string {
  return buildContinuationPrompt(item, targetPlatform);
}
