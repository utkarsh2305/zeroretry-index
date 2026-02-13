/**
 * Gap-type Tags
 * Standard tag definitions with light/dark color variants
 */

export interface TagDefinition {
  id: string;
  label: string;
  light: { bg: string; text: string; border: string };
  dark: { bg: string; text: string; border: string };
}

export const STANDARD_TAGS: TagDefinition[] = [
  {
    id: 'clarification',
    label: 'Clarification',
    light: { bg: '#dbeafe', text: '#1e40af', border: '#93c5fd' },
    dark: { bg: '#1e3a5f', text: '#93c5fd', border: '#2563eb' }
  },
  {
    id: 'design-choice',
    label: 'Design Choice',
    light: { bg: '#f3e8ff', text: '#7c3aed', border: '#c4b5fd' },
    dark: { bg: '#3b1f6e', text: '#c4b5fd', border: '#7c3aed' }
  },
  {
    id: 'bug-fix',
    label: 'Bug Fix',
    light: { bg: '#fee2e2', text: '#dc2626', border: '#fca5a5' },
    dark: { bg: '#5c1a1a', text: '#fca5a5', border: '#dc2626' }
  },
  {
    id: 'edge-case',
    label: 'Edge Case',
    light: { bg: '#fef3c7', text: '#b45309', border: '#fcd34d' },
    dark: { bg: '#5c3d0a', text: '#fcd34d', border: '#b45309' }
  },
  {
    id: 'code-snippet',
    label: 'Code Snippet',
    light: { bg: '#d1fae5', text: '#059669', border: '#6ee7b7' },
    dark: { bg: '#1a4d3a', text: '#6ee7b7', border: '#059669' }
  },
  {
    id: 'verification',
    label: 'Verification',
    light: { bg: '#e0e7ff', text: '#4338ca', border: '#a5b4fc' },
    dark: { bg: '#2e2366', text: '#a5b4fc', border: '#4338ca' }
  }
];

/** Neutral colors for freeform (custom) tags */
export const FREEFORM_TAG_COLORS = {
  light: { bg: '#f3f4f6', text: '#4b5563', border: '#d1d5db' },
  dark: { bg: '#374151', text: '#d1d5db', border: '#4b5563' }
};

/**
 * Gets color scheme for a tag ID
 */
export function getTagColors(tagId: string, theme: 'light' | 'dark') {
  const standard = STANDARD_TAGS.find(t => t.id === tagId);
  if (standard) return standard[theme];
  return FREEFORM_TAG_COLORS[theme];
}

/**
 * Gets the display label for a tag
 */
export function getTagLabel(tagId: string): string {
  const standard = STANDARD_TAGS.find(t => t.id === tagId);
  return standard ? standard.label : tagId;
}
