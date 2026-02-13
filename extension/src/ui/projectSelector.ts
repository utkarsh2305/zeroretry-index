/**
 * Project Selector Dropdown
 * Shows a dropdown to assign a saved item to a project after starring
 * CRITICAL: Uses position:absolute within sidebar, NOT position:fixed
 */

import type { Project } from '../core/project';

interface ThemeColors {
  panelBg: string;
  panelBorder: string;
  text: string;
  textSecondary: string;
  textMuted: string;
  itemHover: string;
  headerBg: string;
  headerBorder: string;
  tabActiveBorder: string;
}

/**
 * Shows a project selector dropdown near the anchor element
 * The dropdown is appended inside the sidebar container (position: absolute)
 */
export function showProjectSelector(
  anchorElement: HTMLElement,
  sidebarBody: HTMLElement,
  projects: Project[],
  theme: ThemeColors,
  onSelect: (projectId: string | undefined) => void,
  onCreateNew: () => void
): void {
  // Remove any existing dropdown
  const existingDropdown = document.getElementById('zeroretry-project-dropdown');
  if (existingDropdown) existingDropdown.remove();

  const dropdown = document.createElement('div');
  dropdown.id = 'zeroretry-project-dropdown';

  // Calculate position relative to the sidebar body
  const anchorRect = anchorElement.getBoundingClientRect();
  const containerRect = sidebarBody.getBoundingClientRect();

  let top = anchorRect.bottom - containerRect.top + sidebarBody.scrollTop + 4;
  const left = anchorRect.left - containerRect.left;

  Object.assign(dropdown.style, {
    position: 'absolute',
    top: `${top}px`,
    left: `${Math.max(8, left - 120)}px`,
    width: '200px',
    maxHeight: '240px',
    overflowY: 'auto',
    backgroundColor: theme.panelBg,
    border: `1px solid ${theme.panelBorder}`,
    borderRadius: '8px',
    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
    zIndex: '10',
    padding: '4px 0',
    fontSize: '13px'
  });

  // "No Project" option
  const noProjectItem = createDropdownItem('No Project', theme, () => {
    onSelect(undefined);
    dropdown.remove();
    removeOutsideListener();
  });
  noProjectItem.style.color = theme.textMuted;
  noProjectItem.style.fontStyle = 'italic';
  dropdown.appendChild(noProjectItem);

  // Separator
  if (projects.length > 0) {
    const sep = document.createElement('div');
    Object.assign(sep.style, {
      height: '1px',
      backgroundColor: theme.panelBorder,
      margin: '4px 0'
    });
    dropdown.appendChild(sep);
  }

  // Project items
  projects.forEach(project => {
    const item = createDropdownItem(project.name, theme, () => {
      onSelect(project.id);
      dropdown.remove();
      removeOutsideListener();
    });
    dropdown.appendChild(item);
  });

  // Separator before "New Project"
  const sep2 = document.createElement('div');
  Object.assign(sep2.style, {
    height: '1px',
    backgroundColor: theme.panelBorder,
    margin: '4px 0'
  });
  dropdown.appendChild(sep2);

  // "New Project" option
  const newProjectItem = createDropdownItem('+ New Project', theme, () => {
    dropdown.remove();
    removeOutsideListener();
    onCreateNew();
  });
  newProjectItem.style.color = theme.tabActiveBorder;
  newProjectItem.style.fontWeight = '600';
  dropdown.appendChild(newProjectItem);

  // Append to sidebar body (position: relative context)
  sidebarBody.style.position = 'relative';
  sidebarBody.appendChild(dropdown);

  // Check if dropdown overflows sidebar bottom — flip upward if needed
  const dropdownRect = dropdown.getBoundingClientRect();
  if (dropdownRect.bottom > containerRect.bottom) {
    top = anchorRect.top - containerRect.top + sidebarBody.scrollTop - dropdown.offsetHeight - 4;
    dropdown.style.top = `${Math.max(0, top)}px`;
  }

  // Dismiss on click outside
  const outsideListener = (e: MouseEvent) => {
    if (!dropdown.contains(e.target as Node)) {
      dropdown.remove();
      removeOutsideListener();
    }
  };

  const removeOutsideListener = () => {
    document.removeEventListener('click', outsideListener, true);
  };

  // Delay adding listener to avoid immediate dismissal from the star click
  setTimeout(() => {
    document.addEventListener('click', outsideListener, true);
  }, 100);
}

/**
 * Creates a single dropdown item
 */
function createDropdownItem(
  label: string,
  theme: ThemeColors,
  onClick: () => void
): HTMLElement {
  const item = document.createElement('div');
  item.textContent = label;
  Object.assign(item.style, {
    padding: '8px 12px',
    cursor: 'pointer',
    color: theme.text,
    transition: 'background-color 0.15s'
  });

  item.addEventListener('mouseenter', () => {
    item.style.backgroundColor = theme.itemHover;
  });
  item.addEventListener('mouseleave', () => {
    item.style.backgroundColor = 'transparent';
  });
  item.addEventListener('click', (e) => {
    e.stopPropagation();
    onClick();
  });

  return item;
}
