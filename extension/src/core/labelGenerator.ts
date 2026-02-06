/**
 * Smart Label Generator for Index Items
 * Analyzes user messages to generate meaningful, scannable labels
 */

// Filler phrases to strip from the beginning of messages
const FILLER_PATTERNS = [
  /^(i want to|i need to|i'm trying to|i am trying to)\s+/i,
  /^(can you|could you|would you|will you)\s+/i,
  /^(please|hey|hi|hello|ok|okay|so|well|actually|basically)\s*,?\s*/i,
  /^(i'm |i am |i've |i have )(been |just |currently )?(trying to |wanting to )?/i,
];

// Intent patterns with their display prefixes (order matters - more specific first)
const INTENT_PATTERNS: Array<{ pattern: RegExp; prefix: string }> = [
  // Questions - specific patterns first
  { pattern: /^do (i|we|you) (need|have) to/i, prefix: 'Do I need' },
  { pattern: /^do (i|we|you) need/i, prefix: 'Do I need' },
  { pattern: /^(should|shall) (i|we|you)/i, prefix: 'Should' },
  { pattern: /^would (it|this|that|you|i|we) (be|work|help|make)/i, prefix: 'Would' },
  { pattern: /^how (do (i|we|you)|can (i|we|you)|to|would (i|we)|should (i|we)|much|many|often|long|about)/i, prefix: 'How' },
  { pattern: /^what (is|are|was|were|do|does|should|would|could|can|about)/i, prefix: 'What' },
  { pattern: /^why (is|are|do|does|did|would|should|can't|doesn't|not)/i, prefix: 'Why' },
  { pattern: /^when (is|are|do|does|did|should|would|can|will)/i, prefix: 'When' },
  { pattern: /^where (is|are|do|does|did|should|can|will)/i, prefix: 'Where' },
  { pattern: /^which (one|is|are|should|would|to|version|option|way)/i, prefix: 'Which' },
  { pattern: /^which\b/i, prefix: 'Which' },  // Fallback for any "which X"
  { pattern: /^(can|could) (we|i|you|this|it|that)/i, prefix: 'Can' },
  { pattern: /^(is|are) (it|this|there|these|they|that|the)/i, prefix: 'Is' },
  { pattern: /^(do|does) (this|it|that|the)/i, prefix: 'Does' },

  // Action requests
  { pattern: /^(help|assist) (me |us )?(with |to )?/i, prefix: 'Help' },
  { pattern: /^(create|build|make|develop|implement|write|generate|design)/i, prefix: 'Build' },
  { pattern: /^(fix|debug|solve|resolve|troubleshoot)/i, prefix: 'Fix' },
  { pattern: /^(explain|tell me|describe|clarify|elaborate)/i, prefix: 'Explain' },
  { pattern: /^(compare|analyze|review|evaluate|assess)/i, prefix: 'Analyze' },
  { pattern: /^(show|give|provide|list|find|get)/i, prefix: 'Show' },
  { pattern: /^(update|change|modify|edit|revise|refactor)/i, prefix: 'Update' },
  { pattern: /^(add|include|insert|put)/i, prefix: 'Add' },
  { pattern: /^(remove|delete|drop|take out)/i, prefix: 'Remove' },
  { pattern: /^(test|check|verify|validate|confirm)/i, prefix: 'Test' },
  { pattern: /^(install|setup|set up|configure)/i, prefix: 'Install' },
  { pattern: /^(run|execute|start|launch)/i, prefix: 'Run' },

  // Statements/topics
  { pattern: /^looking for/i, prefix: 'Looking for' },
  { pattern: /^thinking (about|of)/i, prefix: 'Thinking about' },
  { pattern: /^using /i, prefix: 'Using' },
  { pattern: /^(let's|lets) /i, prefix: "Let's" },
  { pattern: /^(don't|do not|dont) /i, prefix: "Don't" },
  { pattern: /^it says /i, prefix: 'It says' },
];

// Mid-sentence question patterns to detect questions buried in statements
const MID_SENTENCE_PATTERNS = [
  /[,.:;]\s*(how (do|can|should|would|could) (i|we|you))/i,
  /[,.:;]\s*(what (is|are|should|would|do|does))/i,
  /[,.:;]\s*(can (you|i|we))/i,
  /[,.:;]\s*(is (it|this|there|that))/i,
  /[,.:;]\s*(do (i|we|you) need)/i,
];

/**
 * Generates a smart label from user message text
 */
export function generateSmartLabel(text: string, maxLength: number = 60): string {
  let normalized = text.replace(/\s+/g, ' ').trim();

  // Handle empty or very short text
  if (normalized.length === 0) {
    return '(empty)';
  }

  // Strip filler phrases from start
  for (const pattern of FILLER_PATTERNS) {
    normalized = normalized.replace(pattern, '');
  }

  // Re-trim after stripping
  normalized = normalized.trim();

  // Check for mid-sentence questions first (e.g., "Docker is installed, how do I confirm...")
  for (const pattern of MID_SENTENCE_PATTERNS) {
    const match = normalized.match(pattern);
    if (match && match[1]) {
      // Extract from the question word onwards
      const questionStart = normalized.toLowerCase().indexOf(match[1].toLowerCase());
      if (questionStart > 0) {
        const question = normalized.slice(questionStart);
        // Recursively process the extracted question
        return generateSmartLabel(question, maxLength);
      }
    }
  }

  // Try to match intent patterns
  for (const { pattern, prefix } of INTENT_PATTERNS) {
    if (pattern.test(normalized)) {
      const topic = extractTopic(normalized, pattern);
      if (topic.length > 0) {
        return formatLabel(`${prefix}: ${topic}`, maxLength);
      }
    }
  }

  // Question mark detection - if ends with ? but no pattern matched
  if (normalized.endsWith('?')) {
    // Remove the question mark and format cleanly
    const question = normalized.slice(0, -1).trim();
    return formatLabel(capitalize(question), maxLength);
  }

  // Fallback: capitalize and smart truncate
  return formatLabel(capitalize(normalized), maxLength);
}

/**
 * Extracts the topic portion after removing the matched pattern
 */
function extractTopic(text: string, pattern: RegExp): string {
  const topic = text.replace(pattern, '').trim();
  return capitalize(topic);
}

/**
 * Formats a label with smart truncation
 */
function formatLabel(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }

  // Try to cut at punctuation marks
  const cutPoints = [',', '.', '?', '!', ';', '-', ':', '–'];
  for (const punct of cutPoints) {
    const idx = text.lastIndexOf(punct, maxLength - 3);
    // Only use if we're past 40% of max length
    if (idx > maxLength * 0.4) {
      return text.substring(0, idx).trim() + '...';
    }
  }

  // Cut at word boundary
  const truncated = text.substring(0, maxLength - 3);
  const lastSpace = truncated.lastIndexOf(' ');

  // Only use word boundary if we're past 60% of max length
  if (lastSpace > maxLength * 0.6) {
    return truncated.substring(0, lastSpace).trim() + '...';
  }

  // Hard truncate as last resort
  return truncated.trim() + '...';
}

/**
 * Capitalizes the first letter of text
 */
function capitalize(text: string): string {
  if (text.length === 0) return text;
  return text.charAt(0).toUpperCase() + text.slice(1);
}
