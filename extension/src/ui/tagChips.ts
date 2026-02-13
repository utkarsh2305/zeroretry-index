/**
 * Tag Chips UI
 * Renders tag pills and tag selector for saved items
 */

import { STANDARD_TAGS, getTagColors, getTagLabel } from '../core/tags';

type Theme = 'light' | 'dark';

/**
 * Renders a single tag pill
 */
export function renderTagPill(
  tagId: string,
  theme: Theme,
  onClick?: () => void
): HTMLElement {
  const colors = getTagColors(tagId, theme);
  const pill = document.createElement('span');
  pill.textContent = getTagLabel(tagId);
  Object.assign(pill.style, {
    display: 'inline-block',
    padding: '2px 8px',
    fontSize: '10px',
    fontWeight: '500',
    borderRadius: '10px',
    backgroundColor: colors.bg,
    color: colors.text,
    border: `1px solid ${colors.border}`,
    cursor: onClick ? 'pointer' : 'default',
    whiteSpace: 'nowrap',
    lineHeight: '16px'
  });

  if (onClick) {
    pill.addEventListener('click', (e) => {
      e.stopPropagation();
      onClick();
    });
  }

  return pill;
}

/**
 * Renders a row of tag pills for display (collapsed view)
 */
export function renderTagPills(
  tags: string[],
  theme: Theme
): HTMLElement {
  const container = document.createElement('div');
  Object.assign(container.style, {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '4px',
    marginTop: '4px'
  });

  tags.forEach(tagId => {
    container.appendChild(renderTagPill(tagId, theme));
  });

  return container;
}

/**
 * Renders a tag selector with standard tag toggles + freeform input
 */
export function renderTagSelector(
  currentTags: string[],
  theme: Theme,
  onTagsChange: (tags: string[]) => void
): HTMLElement {
  const container = document.createElement('div');
  Object.assign(container.style, {
    padding: '8px',
    backgroundColor: theme === 'light' ? '#f3f4f6' : '#1f2937',
    borderRadius: '4px',
    marginBottom: '12px'
  });

  const label = document.createElement('div');
  label.textContent = 'Tags';
  Object.assign(label.style, {
    fontSize: '11px',
    fontWeight: '500',
    color: theme === 'light' ? '#6b7280' : '#9ca3af',
    marginBottom: '6px'
  });
  container.appendChild(label);

  // Standard tag toggles
  const togglesRow = document.createElement('div');
  Object.assign(togglesRow.style, {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '4px',
    marginBottom: '6px'
  });

  const tags = [...currentTags];

  STANDARD_TAGS.forEach(tag => {
    const isActive = tags.includes(tag.id);
    const pill = renderTagPill(tag.id, theme);

    if (!isActive) {
      pill.style.opacity = '0.5';
    }

    pill.style.cursor = 'pointer';
    pill.addEventListener('click', (e) => {
      e.stopPropagation();
      const idx = tags.indexOf(tag.id);
      if (idx >= 0) {
        tags.splice(idx, 1);
        pill.style.opacity = '0.5';
      } else {
        tags.push(tag.id);
        pill.style.opacity = '1';
      }
      onTagsChange([...tags]);
    });

    togglesRow.appendChild(pill);
  });

  container.appendChild(togglesRow);

  // Freeform tag input
  const inputRow = document.createElement('div');
  Object.assign(inputRow.style, {
    display: 'flex',
    gap: '4px'
  });

  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = 'Add tag...';
  Object.assign(input.style, {
    flex: '1',
    padding: '4px 6px',
    fontSize: '11px',
    border: `1px solid ${theme === 'light' ? '#d1d5db' : '#4b5563'}`,
    borderRadius: '3px',
    backgroundColor: theme === 'light' ? '#ffffff' : '#374151',
    color: theme === 'light' ? '#111827' : '#e5e7eb',
    boxSizing: 'border-box'
  });

  const addFreeform = () => {
    const val = input.value.trim().toLowerCase().replace(/\s+/g, '-');
    if (val && !tags.includes(val)) {
      tags.push(val);
      onTagsChange([...tags]);
      // Add a visible pill for the new tag
      const newPill = renderTagPill(val, theme, () => {
        const idx = tags.indexOf(val);
        if (idx >= 0) {
          tags.splice(idx, 1);
          onTagsChange([...tags]);
          newPill.remove();
        }
      });
      togglesRow.appendChild(newPill);
    }
    input.value = '';
  };

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addFreeform();
    }
  });

  inputRow.appendChild(input);
  container.appendChild(inputRow);

  return container;
}

/**
 * Renders a tag filter bar for project detail view
 */
export function renderTagFilterBar(
  theme: Theme,
  onFilterChange: (activeTags: string[]) => void
): HTMLElement {
  const container = document.createElement('div');
  Object.assign(container.style, {
    padding: '8px 12px',
    display: 'flex',
    flexWrap: 'wrap',
    gap: '4px',
    borderBottom: `1px solid ${theme === 'light' ? '#e5e7eb' : '#374151'}`,
    flexShrink: '0'
  });

  const activeFilters: string[] = [];

  STANDARD_TAGS.forEach(tag => {
    const pill = renderTagPill(tag.id, theme);
    pill.style.opacity = '0.5';
    pill.style.cursor = 'pointer';

    pill.addEventListener('click', (e) => {
      e.stopPropagation();
      const idx = activeFilters.indexOf(tag.id);
      if (idx >= 0) {
        activeFilters.splice(idx, 1);
        pill.style.opacity = '0.5';
      } else {
        activeFilters.push(tag.id);
        pill.style.opacity = '1';
      }
      onFilterChange([...activeFilters]);
    });

    container.appendChild(pill);
  });

  return container;
}
