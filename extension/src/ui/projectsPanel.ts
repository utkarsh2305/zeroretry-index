/**
 * Projects Panel
 * Renders the Projects tab content: list view and detail view
 */

import type { Project } from '../core/project';
import type { SavedItem } from '../core/savedItem';
import { PLATFORM_INFO } from '../core/savedItem';
import type { ChatPlatformId } from '../adapters/base';
import { renderTagFilterBar, renderTagPills } from './tagChips';

interface ThemeColors {
  panelBg: string;
  panelBorder: string;
  headerBg: string;
  headerBorder: string;
  text: string;
  textSecondary: string;
  textMuted: string;
  itemBorder: string;
  itemHover: string;
  tabActiveBorder: string;
  buttonBg: string;
  buttonBorder: string;
  buttonText: string;
  closeBtnText: string;
  closeBtnHoverBg: string;
  closeBtnHoverText: string;
}

// ============================================================================
// List View
// ============================================================================

/**
 * Renders the projects list view
 */
export function renderProjectsList(
  projects: Project[],
  itemCounts: Map<string, number>,
  theme: ThemeColors,
  onSelectProject: (projectId: string) => void,
  onCreateProject: (name: string, description?: string) => Promise<void>
): HTMLElement {
  const container = document.createElement('div');
  Object.assign(container.style, {
    display: 'flex',
    flexDirection: 'column',
    height: '100%'
  });

  // Header with "New Project" button
  const header = document.createElement('div');
  Object.assign(header.style, {
    padding: '12px',
    borderBottom: `1px solid ${theme.headerBorder}`,
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexShrink: '0'
  });

  const title = document.createElement('span');
  title.textContent = 'Projects';
  Object.assign(title.style, {
    fontSize: '14px',
    fontWeight: '600',
    color: theme.text
  });

  const newBtn = document.createElement('button');
  newBtn.textContent = '+ New';
  Object.assign(newBtn.style, {
    padding: '4px 10px',
    fontSize: '12px',
    fontWeight: '500',
    color: theme.buttonText,
    backgroundColor: theme.tabActiveBorder,
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer'
  });

  header.appendChild(title);
  header.appendChild(newBtn);
  container.appendChild(header);

  // Inline create form (hidden by default)
  const formContainer = document.createElement('div');
  Object.assign(formContainer.style, {
    display: 'none',
    padding: '12px',
    borderBottom: `1px solid ${theme.headerBorder}`,
    flexShrink: '0'
  });

  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.placeholder = 'Project name';
  Object.assign(nameInput.style, {
    width: '100%',
    padding: '6px 8px',
    fontSize: '13px',
    border: `1px solid ${theme.itemBorder}`,
    borderRadius: '4px',
    backgroundColor: theme.panelBg,
    color: theme.text,
    boxSizing: 'border-box',
    marginBottom: '6px'
  });

  const descInput = document.createElement('input');
  descInput.type = 'text';
  descInput.placeholder = 'Description (optional)';
  Object.assign(descInput.style, {
    width: '100%',
    padding: '6px 8px',
    fontSize: '12px',
    border: `1px solid ${theme.itemBorder}`,
    borderRadius: '4px',
    backgroundColor: theme.panelBg,
    color: theme.text,
    boxSizing: 'border-box',
    marginBottom: '8px'
  });

  const formButtons = document.createElement('div');
  Object.assign(formButtons.style, {
    display: 'flex',
    gap: '6px',
    justifyContent: 'flex-end'
  });

  const cancelBtn = document.createElement('button');
  cancelBtn.textContent = 'Cancel';
  Object.assign(cancelBtn.style, {
    padding: '4px 10px',
    fontSize: '12px',
    color: theme.textSecondary,
    backgroundColor: 'transparent',
    border: `1px solid ${theme.itemBorder}`,
    borderRadius: '4px',
    cursor: 'pointer'
  });

  const createBtn = document.createElement('button');
  createBtn.textContent = 'Create';
  Object.assign(createBtn.style, {
    padding: '4px 10px',
    fontSize: '12px',
    fontWeight: '500',
    color: theme.buttonText,
    backgroundColor: theme.tabActiveBorder,
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer'
  });

  const hideForm = () => {
    formContainer.style.display = 'none';
    nameInput.value = '';
    descInput.value = '';
  };

  const submitForm = async () => {
    const name = nameInput.value.trim();
    if (!name) { nameInput.focus(); return; }
    const desc = descInput.value.trim() || undefined;
    createBtn.disabled = true;
    await onCreateProject(name, desc);
    hideForm();
  };

  newBtn.addEventListener('click', () => {
    formContainer.style.display = 'block';
    nameInput.focus();
  });
  cancelBtn.addEventListener('click', hideForm);
  createBtn.addEventListener('click', submitForm);
  nameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); submitForm(); }
    if (e.key === 'Escape') hideForm();
  });
  descInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); submitForm(); }
    if (e.key === 'Escape') hideForm();
  });

  formButtons.appendChild(cancelBtn);
  formButtons.appendChild(createBtn);
  formContainer.appendChild(nameInput);
  formContainer.appendChild(descInput);
  formContainer.appendChild(formButtons);
  container.appendChild(formContainer);

  // Projects list
  const list = document.createElement('div');
  Object.assign(list.style, {
    flex: '1',
    overflowY: 'auto'
  });

  if (projects.length === 0) {
    const empty = document.createElement('div');
    empty.textContent = 'No projects yet. Create one to organize your saved items.';
    Object.assign(empty.style, {
      padding: '24px 16px',
      textAlign: 'center',
      color: theme.textMuted,
      fontSize: '13px'
    });
    list.appendChild(empty);
  } else {
    // Sort by most recently modified
    const sorted = [...projects].sort((a, b) => b.modifiedAt - a.modifiedAt);

    sorted.forEach(project => {
      const count = itemCounts.get(project.id) || 0;
      const item = document.createElement('div');
      Object.assign(item.style, {
        padding: '12px',
        borderBottom: `1px solid ${theme.itemBorder}`,
        cursor: 'pointer',
        transition: 'background-color 0.15s'
      });

      const nameRow = document.createElement('div');
      Object.assign(nameRow.style, {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      });

      const name = document.createElement('span');
      name.textContent = project.name;
      Object.assign(name.style, {
        fontSize: '14px',
        fontWeight: '500',
        color: theme.text
      });

      const badge = document.createElement('span');
      badge.textContent = `${count}`;
      Object.assign(badge.style, {
        fontSize: '11px',
        color: theme.textMuted,
        backgroundColor: theme.headerBg,
        padding: '2px 6px',
        borderRadius: '10px',
        border: `1px solid ${theme.itemBorder}`
      });

      nameRow.appendChild(name);
      nameRow.appendChild(badge);
      item.appendChild(nameRow);

      if (project.description) {
        const desc = document.createElement('div');
        desc.textContent = project.description;
        Object.assign(desc.style, {
          fontSize: '12px',
          color: theme.textSecondary,
          marginTop: '4px',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap'
        });
        item.appendChild(desc);
      }

      item.addEventListener('mouseenter', () => {
        item.style.backgroundColor = theme.itemHover;
      });
      item.addEventListener('mouseleave', () => {
        item.style.backgroundColor = 'transparent';
      });
      item.addEventListener('click', () => onSelectProject(project.id));

      list.appendChild(item);
    });
  }

  container.appendChild(list);
  return container;
}

// ============================================================================
// Detail View
// ============================================================================

/**
 * Renders a project detail view with items grouped by platform/conversation
 */
export function renderProjectDetail(
  project: Project,
  items: SavedItem[],
  theme: ThemeColors,
  onBack: () => void,
  onDeleteProject: () => void,
  onClickItem: (item: SavedItem) => void
): HTMLElement {
  const container = document.createElement('div');
  Object.assign(container.style, {
    display: 'flex',
    flexDirection: 'column',
    height: '100%'
  });

  // Header with back button and project name
  const header = document.createElement('div');
  Object.assign(header.style, {
    padding: '10px 12px',
    borderBottom: `1px solid ${theme.headerBorder}`,
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    flexShrink: '0'
  });

  const backBtn = document.createElement('button');
  backBtn.textContent = '\u2190';
  Object.assign(backBtn.style, {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    fontSize: '16px',
    color: theme.text,
    padding: '2px 6px'
  });
  backBtn.addEventListener('click', onBack);

  const headerTitle = document.createElement('span');
  headerTitle.textContent = project.name;
  Object.assign(headerTitle.style, {
    flex: '1',
    fontSize: '14px',
    fontWeight: '600',
    color: theme.text,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap'
  });

  const deleteBtn = document.createElement('button');
  deleteBtn.textContent = '\u00d7';
  deleteBtn.title = 'Delete project';
  Object.assign(deleteBtn.style, {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    fontSize: '16px',
    color: theme.closeBtnText,
    padding: '2px 6px'
  });
  deleteBtn.addEventListener('mouseenter', () => {
    deleteBtn.style.color = theme.closeBtnHoverText;
  });
  deleteBtn.addEventListener('mouseleave', () => {
    deleteBtn.style.color = theme.closeBtnText;
  });
  deleteBtn.addEventListener('click', () => {
    if (confirm(`Delete project "${project.name}"? Items will be unassigned but not deleted.`)) {
      onDeleteProject();
    }
  });

  header.appendChild(backBtn);
  header.appendChild(headerTitle);
  header.appendChild(deleteBtn);
  container.appendChild(header);

  // Description (if exists)
  if (project.description) {
    const desc = document.createElement('div');
    desc.textContent = project.description;
    Object.assign(desc.style, {
      padding: '8px 12px',
      fontSize: '12px',
      color: theme.textSecondary,
      borderBottom: `1px solid ${theme.headerBorder}`
    });
    container.appendChild(desc);
  }

  // Timeline strip (milestones)
  const milestoneItems = items
    .filter(i => i.milestone)
    .sort((a, b) => (a.milestone!.order) - (b.milestone!.order));

  if (milestoneItems.length > 0) {
    const timeline = document.createElement('div');
    Object.assign(timeline.style, {
      padding: '12px',
      borderBottom: `1px solid ${theme.headerBorder}`,
      overflowX: 'auto',
      flexShrink: '0'
    });

    const track = document.createElement('div');
    Object.assign(track.style, {
      display: 'flex',
      alignItems: 'center',
      minWidth: 'max-content',
      gap: '0'
    });

    milestoneItems.forEach((mi, idx) => {
      // Node
      const node = document.createElement('div');
      Object.assign(node.style, {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        cursor: 'pointer',
        flexShrink: '0'
      });

      const circle = document.createElement('div');
      Object.assign(circle.style, {
        width: '12px',
        height: '12px',
        borderRadius: '50%',
        backgroundColor: theme.tabActiveBorder,
        border: `2px solid ${theme.tabActiveBorder}`,
        flexShrink: '0'
      });

      const label = document.createElement('div');
      label.textContent = mi.milestone!.label;
      Object.assign(label.style, {
        fontSize: '10px',
        color: theme.textSecondary,
        marginTop: '4px',
        maxWidth: '80px',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        textAlign: 'center'
      });

      node.appendChild(circle);
      node.appendChild(label);
      node.addEventListener('click', () => onClickItem(mi));

      node.addEventListener('mouseenter', () => {
        circle.style.transform = 'scale(1.3)';
        circle.style.transition = 'transform 0.15s';
      });
      node.addEventListener('mouseleave', () => {
        circle.style.transform = 'scale(1)';
      });

      track.appendChild(node);

      // Connector line (except after last)
      if (idx < milestoneItems.length - 1) {
        const line = document.createElement('div');
        Object.assign(line.style, {
          width: '32px',
          height: '2px',
          backgroundColor: theme.tabActiveBorder,
          flexShrink: '0',
          marginBottom: '18px' // align with circles, not labels
        });
        track.appendChild(line);
      }
    });

    timeline.appendChild(track);
    container.appendChild(timeline);
  }

  // Tag filter bar
  let activeTagFilters: string[] = [];

  const tagFilterBar = renderTagFilterBar(
    // Determine theme from colors
    theme.panelBg === '#ffffff' || theme.panelBg.toLowerCase() === '#fff' ? 'light' : 'dark',
    (activeTags) => {
      activeTagFilters = activeTags;
      rebuildItemList();
    }
  );

  // Check if any items have tags
  const anyItemHasTag = items.some(i => i.tags && i.tags.length > 0);
  if (anyItemHasTag) {
    container.appendChild(tagFilterBar);
  }

  // Items list
  const list = document.createElement('div');
  Object.assign(list.style, {
    flex: '1',
    overflowY: 'auto'
  });

  const currentThemeMode: 'light' | 'dark' = theme.panelBg === '#ffffff' || theme.panelBg.toLowerCase() === '#fff' ? 'light' : 'dark';

  function rebuildItemList() {
    list.innerHTML = '';

    // Filter items by active tag filters (OR logic)
    let filteredItems = items;
    if (activeTagFilters.length > 0) {
      filteredItems = items.filter(item =>
        item.tags && item.tags.some(t => activeTagFilters.includes(t))
      );
    }

    if (filteredItems.length === 0) {
      const empty = document.createElement('div');
      empty.textContent = activeTagFilters.length > 0
        ? 'No items match the selected tags.'
        : 'No items in this project yet. Star messages and assign them here.';
      Object.assign(empty.style, {
        padding: '24px 16px',
        textAlign: 'center',
        color: theme.textMuted,
        fontSize: '13px'
      });
      list.appendChild(empty);
      return;
    }

    // Group by platform
    const byPlatform = new Map<string, SavedItem[]>();
    filteredItems.forEach(item => {
      const platform = item.sourcePlatform || 'unknown';
      if (!byPlatform.has(platform)) byPlatform.set(platform, []);
      byPlatform.get(platform)!.push(item);
    });

    byPlatform.forEach((platformItems, platform) => {
      // Platform header
      const platformHeader = document.createElement('div');
      const platformName = PLATFORM_INFO[platform as ChatPlatformId]?.name || platform;
      platformHeader.textContent = `${platformName} (${platformItems.length})`;
      Object.assign(platformHeader.style, {
        padding: '8px 12px',
        fontSize: '11px',
        fontWeight: '600',
        textTransform: 'uppercase',
        letterSpacing: '0.5px',
        color: theme.textMuted,
        backgroundColor: theme.headerBg,
        borderBottom: `1px solid ${theme.itemBorder}`
      });
      list.appendChild(platformHeader);

      // Sort items by creation date (newest first)
      platformItems.sort((a, b) => b.createdAt - a.createdAt);

      platformItems.forEach(item => {
        const row = document.createElement('div');
        Object.assign(row.style, {
          padding: '10px 12px',
          borderBottom: `1px solid ${theme.itemBorder}`,
          cursor: 'pointer',
          transition: 'background-color 0.15s'
        });

        const label = document.createElement('div');
        label.textContent = item.label || item.cachedText;
        Object.assign(label.style, {
          fontSize: '13px',
          color: theme.text,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap'
        });

        const meta = document.createElement('div');
        const date = new Date(item.createdAt);
        meta.textContent = date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        Object.assign(meta.style, {
          fontSize: '11px',
          color: theme.textMuted,
          marginTop: '2px'
        });

        row.appendChild(label);
        row.appendChild(meta);

        // Tag pills on item row
        if (item.tags && item.tags.length > 0) {
          const pills = renderTagPills(item.tags, currentThemeMode);
          row.appendChild(pills);
        }

        row.addEventListener('mouseenter', () => {
          row.style.backgroundColor = theme.itemHover;
        });
        row.addEventListener('mouseleave', () => {
          row.style.backgroundColor = 'transparent';
        });
        row.addEventListener('click', () => onClickItem(item));

        list.appendChild(row);
      });
    });
  }

  // Initial render
  rebuildItemList();

  container.appendChild(list);
  return container;
}
