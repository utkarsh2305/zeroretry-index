/**
 * Prompt Builder for Cross-AI Continuation
 * Generates deterministic prompts from SavedItems - no LLM involved
 */

import type { SavedItem, ContinuationContext } from './savedItem';
import { PLATFORM_INFO } from './savedItem';
import type { ChatPlatformId } from '../adapters/base';

/** Maximum length for message text in Level 0 prompts */
const LEVEL_0_MAX_LENGTH = 2000;

/** Maximum length for message text in Level 1 prompts */
const LEVEL_1_MAX_LENGTH = 1500;

/**
 * Builds a continuation prompt from SavedItem
 * No LLM involved - purely template-based
 */
export function buildContinuationPrompt(
  item: SavedItem,
  targetPlatform: ChatPlatformId
): string {
  const continuation = item.continuation;
  if (!continuation || !continuation.nextQuestion) {
    // Level 0: Simple context handoff
    return buildSimplePrompt(item);
  }

  // Level 1: Full continuation prompt
  return buildFullPrompt(item, continuation, targetPlatform);
}

/**
 * Level 0: Minimal context for simple continuation
 * Used when user hasn't filled in the "Next Question" field
 */
function buildSimplePrompt(item: SavedItem): string {
  const source = PLATFORM_INFO[item.sourcePlatform].name;
  const truncatedText = truncateText(item.fullMessageText, LEVEL_0_MAX_LENGTH);

  // Use title if continuation has one set
  const title = item.continuation?.title;

  const parts: string[] = [];

  if (title) {
    parts.push(`# ${title}`, '');
  }

  parts.push(
    `I'm continuing a conversation from ${source}.`,
    '',
    'Here is the relevant context:',
    '',
    '---',
    truncatedText,
    '---',
    '',
    'Based on this context, please help me continue. What would you like to know or discuss?'
  );

  return parts.join('\n');
}

/**
 * Level 1: Full structured continuation prompt
 * Used when user has filled in continuation fields
 */
function buildFullPrompt(
  item: SavedItem,
  continuation: ContinuationContext,
  targetPlatform: ChatPlatformId
): string {
  const source = PLATFORM_INFO[item.sourcePlatform].name;
  const target = PLATFORM_INFO[targetPlatform].name;

  const parts: string[] = [
    `# Continuation: ${continuation.title}`,
    '',
    `I'm continuing a conversation from ${source} to ${target}.`,
    ''
  ];

  // Context section
  parts.push('## Context');
  parts.push(continuation.context);
  parts.push('');

  // Constraints section (optional)
  if (continuation.constraints) {
    parts.push('## Constraints');
    parts.push(continuation.constraints);
    parts.push('');
  }

  // Current state section (optional)
  if (continuation.currentState) {
    parts.push('## Current State');
    parts.push(continuation.currentState);
    parts.push('');
  }

  // Original message reference
  const truncatedText = truncateText(item.fullMessageText, LEVEL_1_MAX_LENGTH);
  parts.push('## Original Message');
  parts.push('```');
  parts.push(truncatedText);
  parts.push('```');
  parts.push('');

  // Next question - the actual prompt
  parts.push('## Question');
  parts.push(continuation.nextQuestion);

  return parts.join('\n');
}

/**
 * Truncates text to max length with indicator
 */
function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }
  return text.substring(0, maxLength) + '\n... [truncated]';
}

/**
 * Estimates prompt token count (rough approximation)
 * Useful for showing user feedback about prompt size
 */
export function estimateTokens(text: string): number {
  // Rough estimate: ~4 characters per token
  return Math.ceil(text.length / 4);
}

/**
 * Checks if a prompt is within reasonable size limits
 */
export function isPromptReasonableSize(text: string): boolean {
  const tokens = estimateTokens(text);
  // Most models handle 4k-8k tokens easily
  return tokens < 4000;
}
