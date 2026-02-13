/**
 * SavedItem UI Component
 * Renders a saved item with collapsed/expanded states
 */

import type { ResolvedSavedItem, ContinuationContext } from '../core/savedItem';
import { PLATFORM_INFO, generateDefaultContinuation, getAvailableTargets } from '../core/savedItem';
import type { ChatPlatformId } from '../adapters/base';
import { performHandoff } from '../core/handoff';
import { updateSavedItem, setMilestone } from '../core/storage';
import { showToast } from './toast';

/**
 * Callbacks for saved item interactions
 */
export interface SavedItemCallbacks {
  onDelete: (id: string) => void;
  onUpdate: () => void;
  scrollToMessage: (messageId: string) => boolean;
}

/**
 * Renders a single saved item (collapsed by default)
 */
export function renderSavedItem(
  item: ResolvedSavedItem,
  currentPlatform: ChatPlatformId,
  callbacks: SavedItemCallbacks
): HTMLElement {
  const container = document.createElement('div');
  container.className = 'zeroretry-saved-item';
  container.dataset.itemId = item.id;

  // Track expanded state
  let isExpanded = false;

  // Collapsed view
  const collapsedView = createCollapsedView(item, () => {
    isExpanded = !isExpanded;
    updateView();
  }, callbacks);

  // Expanded view (continuation editor)
  const expandedView = createExpandedView(
    item,
    currentPlatform,
    () => {
      isExpanded = false;
      updateView();
    },
    callbacks.onUpdate
  );

  function updateView() {
    collapsedView.style.display = isExpanded ? 'none' : 'block';
    expandedView.style.display = isExpanded ? 'block' : 'none';
  }

  container.appendChild(collapsedView);
  container.appendChild(expandedView);

  // Style container
  Object.assign(container.style, {
    borderBottom: '1px solid #e5e7eb',
    transition: 'background-color 0.2s'
  });

  updateView();
  return container;
}

/**
 * Creates the collapsed view of a saved item
 */
function createCollapsedView(
  item: ResolvedSavedItem,
  onExpand: () => void,
  callbacks: SavedItemCallbacks
): HTMLElement {
  const view = document.createElement('div');
  view.className = 'zeroretry-saved-collapsed';

  Object.assign(view.style, {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '12px',
    cursor: 'pointer'
  });

  // Status indicator
  const statusColors: Record<string, string> = {
    active: '#f59e0b',
    'needs-reattach': '#f97316',
    orphaned: '#9ca3af'
  };

  const star = document.createElement('span');
  star.textContent = '★';
  star.style.color = statusColors[item.status] || '#9ca3af';
  star.style.flexShrink = '0';
  star.title = item.status === 'active'
    ? 'Active'
    : item.status === 'needs-reattach'
      ? 'Position changed'
      : 'Message not found';

  // Content
  const content = document.createElement('div');
  content.style.flex = '1';
  content.style.minWidth = '0';

  const label = document.createElement('div');
  label.className = 'saved-item-label';

  // Use continuation title if available, otherwise label
  const displayTitle = item.continuation?.title || item.label;
  label.textContent = displayTitle;
  Object.assign(label.style, {
    fontSize: '14px',
    fontWeight: '500',
    color: '#374151',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap'
  });

  // Level indicator (shows if continuation is set up)
  if (item.continuation && item.continuation.nextQuestion) {
    const badge = document.createElement('span');
    badge.textContent = ' ↗';
    badge.title = 'Continuation ready';
    Object.assign(badge.style, {
      fontSize: '12px',
      color: '#10b981'
    });
    label.appendChild(badge);
  }

  const preview = document.createElement('div');
  preview.className = 'saved-item-preview';
  preview.textContent = item.cachedText;
  Object.assign(preview.style, {
    fontSize: '12px',
    color: '#9ca3af',
    marginTop: '4px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap'
  });

  content.appendChild(label);
  content.appendChild(preview);

  // Expand button
  const expandBtn = document.createElement('button');
  expandBtn.innerHTML = '▼';
  expandBtn.title = 'Expand to continue';
  Object.assign(expandBtn.style, {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    fontSize: '10px',
    color: '#6b7280',
    padding: '4px 6px',
    borderRadius: '4px',
    transition: 'background-color 0.2s'
  });

  // Delete button
  const deleteBtn = document.createElement('button');
  deleteBtn.innerHTML = '×';
  deleteBtn.title = 'Delete';
  Object.assign(deleteBtn.style, {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    fontSize: '16px',
    color: '#9ca3af',
    padding: '0 4px',
    opacity: '0',
    transition: 'opacity 0.2s, color 0.2s'
  });

  // Event handlers
  view.addEventListener('mouseenter', () => {
    view.style.backgroundColor = '#f3f4f6';
    deleteBtn.style.opacity = '1';
    expandBtn.style.backgroundColor = '#e5e7eb';
  });
  view.addEventListener('mouseleave', () => {
    view.style.backgroundColor = 'transparent';
    deleteBtn.style.opacity = '0';
    expandBtn.style.backgroundColor = 'transparent';
  });

  // Click on content to jump to message or open conversation
  content.addEventListener('click', (e) => {
    e.stopPropagation();
    // Always call scrollToMessage - it handles cross-conversation navigation
    // For current conversation: scrolls to message
    // For other conversations: opens that conversation in a new tab
    const success = callbacks.scrollToMessage(item.resolvedMessageId || item.anchor.messageId);
    if (success) {
      view.style.backgroundColor = '#fef3c7';
      setTimeout(() => {
        view.style.backgroundColor = 'transparent';
      }, 800);
    }
  });

  expandBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    onExpand();
  });

  deleteBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    callbacks.onDelete(item.id);
  });
  deleteBtn.addEventListener('mouseenter', () => {
    deleteBtn.style.color = '#dc2626';
  });
  deleteBtn.addEventListener('mouseleave', () => {
    deleteBtn.style.color = '#9ca3af';
  });

  view.appendChild(star);
  view.appendChild(content);
  view.appendChild(expandBtn);
  view.appendChild(deleteBtn);

  return view;
}

/**
 * Creates the expanded view with continuation editor
 */
function createExpandedView(
  item: ResolvedSavedItem,
  currentPlatform: ChatPlatformId,
  onCollapse: () => void,
  onUpdate: () => void
): HTMLElement {
  const view = document.createElement('div');
  view.className = 'zeroretry-saved-expanded';
  view.style.display = 'none';

  Object.assign(view.style, {
    padding: '12px',
    backgroundColor: '#f9fafb',
    borderLeft: '3px solid #10b981'
  });

  // Initialize continuation if not present
  let continuation = item.continuation || generateDefaultContinuation(item);

  // Header with collapse button
  const header = document.createElement('div');
  Object.assign(header.style, {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '12px'
  });

  const headerTitle = document.createElement('span');
  headerTitle.textContent = 'Continue in...';
  headerTitle.style.fontWeight = '600';
  headerTitle.style.fontSize = '13px';
  headerTitle.style.color = '#374151';

  const collapseBtn = document.createElement('button');
  collapseBtn.innerHTML = '▲';
  collapseBtn.title = 'Collapse';
  Object.assign(collapseBtn.style, {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    fontSize: '10px',
    color: '#6b7280',
    padding: '4px 6px',
    borderRadius: '4px'
  });
  collapseBtn.addEventListener('click', onCollapse);
  collapseBtn.addEventListener('mouseenter', () => {
    collapseBtn.style.backgroundColor = '#e5e7eb';
  });
  collapseBtn.addEventListener('mouseleave', () => {
    collapseBtn.style.backgroundColor = 'transparent';
  });

  header.appendChild(headerTitle);
  header.appendChild(collapseBtn);
  view.appendChild(header);

  // Editable fields
  const fieldsContainer = document.createElement('div');
  fieldsContainer.style.marginBottom = '12px';

  // Helper to save continuation updates
  const saveContinuation = async (updates: Partial<ContinuationContext>) => {
    continuation = { ...continuation, ...updates };
    await updateSavedItem(item.id, { continuation });
    onUpdate();
  };

  // Title field
  fieldsContainer.appendChild(createTextField('Title', continuation.title, (value) => {
    saveContinuation({ title: value });
  }));

  // Context field
  fieldsContainer.appendChild(createTextArea('Context', continuation.context, (value) => {
    saveContinuation({ context: value });
  }));

  // Constraints field (optional)
  fieldsContainer.appendChild(createTextArea('Constraints (optional)', continuation.constraints || '', (value) => {
    saveContinuation({ constraints: value || undefined });
  }));

  // Current state field (optional)
  fieldsContainer.appendChild(createTextArea('Current State (optional)', continuation.currentState || '', (value) => {
    saveContinuation({ currentState: value || undefined });
  }));

  // Next question field (required for Level 1)
  fieldsContainer.appendChild(createTextArea(
    'Next Question *',
    continuation.nextQuestion,
    (value) => saveContinuation({ nextQuestion: value }),
    true,
    'What specific question do you want to ask? (Filling this creates a better handoff prompt)'
  ));

  view.appendChild(fieldsContainer);

  // Milestone toggle
  const milestoneRow = document.createElement('div');
  Object.assign(milestoneRow.style, {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '12px',
    padding: '8px',
    backgroundColor: '#f3f4f6',
    borderRadius: '4px'
  });

  const milestoneCheckbox = document.createElement('input');
  milestoneCheckbox.type = 'checkbox';
  milestoneCheckbox.checked = !!item.milestone;
  milestoneCheckbox.style.cursor = 'pointer';

  const milestoneLabel = document.createElement('span');
  milestoneLabel.textContent = 'Milestone';
  Object.assign(milestoneLabel.style, {
    fontSize: '12px',
    fontWeight: '500',
    color: '#374151',
    cursor: 'pointer'
  });
  milestoneLabel.addEventListener('click', () => {
    milestoneCheckbox.checked = !milestoneCheckbox.checked;
    milestoneCheckbox.dispatchEvent(new Event('change'));
  });

  const milestoneLabelInput = document.createElement('input');
  milestoneLabelInput.type = 'text';
  milestoneLabelInput.placeholder = 'Label...';
  milestoneLabelInput.value = item.milestone?.label || '';
  Object.assign(milestoneLabelInput.style, {
    flex: '1',
    padding: '4px 6px',
    fontSize: '12px',
    border: '1px solid #d1d5db',
    borderRadius: '3px',
    backgroundColor: '#ffffff',
    color: '#111827',
    display: item.milestone ? 'block' : 'none',
    boxSizing: 'border-box'
  });

  milestoneCheckbox.addEventListener('change', async () => {
    if (milestoneCheckbox.checked) {
      milestoneLabelInput.style.display = 'block';
      const label = milestoneLabelInput.value || item.label || 'Milestone';
      await setMilestone(item.id, { label, order: item.createdAt });
      item.milestone = { label, order: item.createdAt };
    } else {
      milestoneLabelInput.style.display = 'none';
      await setMilestone(item.id, undefined);
      item.milestone = undefined;
    }
    onUpdate();
  });

  milestoneLabelInput.addEventListener('blur', async () => {
    if (milestoneCheckbox.checked && milestoneLabelInput.value) {
      await setMilestone(item.id, { label: milestoneLabelInput.value, order: item.milestone?.order || item.createdAt });
      item.milestone = { label: milestoneLabelInput.value, order: item.milestone?.order || item.createdAt };
      onUpdate();
    }
  });
  milestoneLabelInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') milestoneLabelInput.blur();
  });

  milestoneRow.appendChild(milestoneCheckbox);
  milestoneRow.appendChild(milestoneLabel);
  milestoneRow.appendChild(milestoneLabelInput);
  view.appendChild(milestoneRow);

  // Continue buttons
  const buttonsContainer = createContinueButtons(item, currentPlatform, continuation);
  view.appendChild(buttonsContainer);

  return view;
}

/**
 * Creates a single-line text input field
 */
function createTextField(
  label: string,
  value: string,
  onChange: (value: string) => void
): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.style.marginBottom = '8px';

  const labelEl = document.createElement('label');
  labelEl.textContent = label;
  Object.assign(labelEl.style, {
    display: 'block',
    fontSize: '11px',
    color: '#6b7280',
    marginBottom: '4px'
  });

  const input = document.createElement('input');
  input.type = 'text';
  input.value = value;
  Object.assign(input.style, {
    width: '100%',
    padding: '6px 8px',
    fontSize: '13px',
    border: '1px solid #d1d5db',
    borderRadius: '4px',
    boxSizing: 'border-box',
    fontFamily: 'inherit',
    // Defensive styles to override host page CSS
    backgroundColor: '#ffffff',
    color: '#111827',
    pointerEvents: 'auto',
    userSelect: 'text',
    WebkitUserSelect: 'text',
    opacity: '1',
    cursor: 'text'
  });

  input.addEventListener('blur', () => onChange(input.value));
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      input.blur();
    }
  });
  input.addEventListener('focus', () => {
    input.style.borderColor = '#10b981';
    input.style.outline = 'none';
  });
  input.addEventListener('blur', () => {
    input.style.borderColor = '#d1d5db';
  });

  wrapper.appendChild(labelEl);
  wrapper.appendChild(input);
  return wrapper;
}

/**
 * Creates a multi-line textarea field
 */
function createTextArea(
  label: string,
  value: string,
  onChange: (value: string) => void,
  required: boolean = false,
  placeholder: string = ''
): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.style.marginBottom = '8px';

  const labelEl = document.createElement('label');
  labelEl.textContent = label;
  Object.assign(labelEl.style, {
    display: 'block',
    fontSize: '11px',
    color: required ? '#374151' : '#6b7280',
    marginBottom: '4px',
    fontWeight: required ? '500' : 'normal'
  });

  const textarea = document.createElement('textarea');
  textarea.value = value;
  textarea.rows = 2;
  if (placeholder) {
    textarea.placeholder = placeholder;
  }
  Object.assign(textarea.style, {
    width: '100%',
    padding: '6px 8px',
    fontSize: '13px',
    border: '1px solid #d1d5db',
    borderRadius: '4px',
    boxSizing: 'border-box',
    resize: 'vertical',
    fontFamily: 'inherit',
    minHeight: '40px',
    // Defensive styles to override host page CSS
    backgroundColor: '#ffffff',
    color: '#111827',
    pointerEvents: 'auto',
    userSelect: 'text',
    WebkitUserSelect: 'text',
    opacity: '1',
    cursor: 'text'
  });

  textarea.addEventListener('blur', () => onChange(textarea.value));
  textarea.addEventListener('focus', () => {
    textarea.style.borderColor = '#10b981';
    textarea.style.outline = 'none';
  });
  textarea.addEventListener('blur', () => {
    textarea.style.borderColor = '#d1d5db';
  });

  wrapper.appendChild(labelEl);
  wrapper.appendChild(textarea);
  return wrapper;
}

/**
 * Creates the "Continue in X" buttons
 */
function createContinueButtons(
  item: ResolvedSavedItem,
  currentPlatform: ChatPlatformId,
  continuation: ContinuationContext
): HTMLElement {
  const container = document.createElement('div');
  Object.assign(container.style, {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '8px'
  });

  const targets = getAvailableTargets(currentPlatform);

  targets.forEach(target => {
    const btn = document.createElement('button');
    btn.textContent = `→ ${PLATFORM_INFO[target].name}`;
    Object.assign(btn.style, {
      padding: '6px 12px',
      fontSize: '12px',
      backgroundColor: '#1f2937',
      color: '#ffffff',
      border: 'none',
      borderRadius: '4px',
      cursor: 'pointer',
      transition: 'background-color 0.2s',
      fontFamily: 'inherit'
    });

    btn.addEventListener('mouseenter', () => {
      btn.style.backgroundColor = '#374151';
    });
    btn.addEventListener('mouseleave', () => {
      btn.style.backgroundColor = '#1f2937';
    });

    btn.addEventListener('click', async () => {
      // Update item with latest continuation before handoff
      const updatedItem = { ...item, continuation };
      const result = await performHandoff(updatedItem, target);
      if (result.success) {
        // Show confirm dialog before opening target - ensures user sees paste instruction
        const targetName = PLATFORM_INFO[target].name;
        const confirmed = confirm(
          `Prompt copied to clipboard!\n\nClick OK to open ${targetName}, then paste (Ctrl+V / Cmd+V).`
        );
        if (confirmed && result.targetUrl) {
          window.open(result.targetUrl, '_blank');
        }
      } else {
        showToast(`Error: ${result.error}`, true);
      }
    });

    container.appendChild(btn);
  });

  return container;
}
