/**
 * ZeroRetry Index - Content Script
 * Injects a sidebar into chat platforms for indexing conversations
 */

import { getAdapterForUrl } from './adapters';
import type { ChatMessage, TitleResult, ChatPlatformId } from './adapters';
import type { ResolvedSavedItem } from './core/savedItem';
import {
  createSavedItem,
  resolveSavedItems,
  PLATFORM_INFO
} from './core/savedItem';
import {
  getSavedItemsForConversation,
  addSavedItem,
  removeSavedItem,
  removeSavedItemByMessageId
} from './core/storage';
import { renderSavedItem } from './ui/savedItemComponent';
import { generateSmartLabel } from './core/labelGenerator';
import { createProject } from './core/project';
import type { Project } from './core/project';
import {
  loadProjects,
  addProject as addProjectToStorage,
  deleteProject as deleteProjectFromStorage,
  assignItemToProject,
  getSavedItemsForProject
} from './core/storage';
import { showProjectSelector } from './ui/projectSelector';
import { renderProjectsList, renderProjectDetail } from './ui/projectsPanel';

const SIDEBAR_ID = 'zeroretry-index-sidebar';
const SIDEBAR_BODY_ID = 'zeroretry-sidebar-body';
const SIDEBAR_LOADING_ID = 'zeroretry-loading';
const SIDEBAR_EMPTY_ID = 'zeroretry-empty';
const SIDEBAR_TOC_ID = 'zeroretry-toc';
const SIDEBAR_TITLE_ID = 'zeroretry-title';
const SIDEBAR_TOC_TAB_ID = 'zeroretry-toc-tab';
const SIDEBAR_SAVED_TAB_ID = 'zeroretry-saved-tab';
const SIDEBAR_SAVED_PANEL_ID = 'zeroretry-saved-panel';
const SIDEBAR_PROJECTS_TAB_ID = 'zeroretry-projects-tab';
const SIDEBAR_PROJECTS_PANEL_ID = 'zeroretry-projects-panel';

// Debug flag - set to true to enable logging
const DEBUG = false;

// Global UI state: 'expanded' | 'collapsed' | 'minimized'
type UIState = 'expanded' | 'collapsed' | 'minimized';
let uiState: UIState = 'expanded';

// Tab state
type SidebarTab = 'index' | 'saved' | 'projects';
let activeTab: SidebarTab = 'index';

// Search state
let searchQuery = '';

// Theme state
type Theme = 'light' | 'dark';
let currentTheme: Theme = 'light';

// Theme color palettes
const themes = {
  light: {
    panelBg: '#ffffff',
    panelBorder: '#d1d5db',
    headerBg: '#f9fafb',
    headerBorder: '#e5e7eb',
    text: '#374151',
    textSecondary: '#6b7280',
    textMuted: '#9ca3af',
    itemBorder: '#f0f0f0',
    itemHover: '#f3f4f6',
    highlight: '#fef3c7',
    tabActive: '#111827',
    tabInactive: '#6b7280',
    tabActiveBorder: '#10b981',
    searchBg: '#f9fafb',
    searchBorder: '#e5e7eb',
    searchText: '#374151',
    searchPlaceholder: '#9ca3af',
    buttonBg: '#1f2937',
    buttonBorder: '#374151',
    buttonText: '#ffffff',
    closeBtnBg: 'transparent',
    closeBtnBorder: '#d1d5db',
    closeBtnText: '#6b7280',
    closeBtnHoverBg: '#fee2e2',
    closeBtnHoverBorder: '#fca5a5',
    closeBtnHoverText: '#dc2626',
    collapsedBg: 'rgba(31, 41, 55, 0.85)',
    collapsedBorder: 'rgba(55, 65, 81, 0.5)',
    collapsedHoverBg: 'rgba(55, 65, 81, 0.9)',
    platformHeaderBg: '#f3f4f6',
    platformHeaderText: '#374151',
    platformHeaderBorder: '#e5e7eb',
    bookmarkActive: '#f59e0b',
    bookmarkInactive: '#9ca3af',
    bookmarkHover: '#d97706'
  },
  dark: {
    panelBg: '#1f2937',
    panelBorder: '#374151',
    headerBg: '#111827',
    headerBorder: '#374151',
    text: '#e5e7eb',
    textSecondary: '#9ca3af',
    textMuted: '#6b7280',
    itemBorder: '#374151',
    itemHover: '#374151',
    highlight: '#92400e',
    tabActive: '#f3f4f6',
    tabInactive: '#9ca3af',
    tabActiveBorder: '#10b981',
    searchBg: '#111827',
    searchBorder: '#374151',
    searchText: '#e5e7eb',
    searchPlaceholder: '#6b7280',
    buttonBg: '#374151',
    buttonBorder: '#4b5563',
    buttonText: '#ffffff',
    closeBtnBg: 'transparent',
    closeBtnBorder: '#4b5563',
    closeBtnText: '#9ca3af',
    closeBtnHoverBg: 'rgba(239, 68, 68, 0.2)',
    closeBtnHoverBorder: '#ef4444',
    closeBtnHoverText: '#f87171',
    collapsedBg: 'rgba(17, 24, 39, 0.9)',
    collapsedBorder: 'rgba(55, 65, 81, 0.7)',
    collapsedHoverBg: 'rgba(31, 41, 55, 0.95)',
    platformHeaderBg: '#111827',
    platformHeaderText: '#e5e7eb',
    platformHeaderBorder: '#374151',
    bookmarkActive: '#f59e0b',
    bookmarkInactive: '#6b7280',
    bookmarkHover: '#fbbf24'
  }
};

/**
 * Debounce utility function
 */
function debounce<T extends (...args: any[]) => void>(fn: T, ms: number): (...args: Parameters<T>) => void {
  let timer: number | undefined;
  return (...args: Parameters<T>) => {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
    timer = window.setTimeout(() => fn(...args), ms);
  };
}

/**
 * Detects if the current page is in dark mode
 */
function detectDarkMode(): boolean {
  const html = document.documentElement;
  const body = document.body;

  // Check DOM attributes (most AI platforms use these)
  if (html.getAttribute('data-color-mode') === 'dark') return true;
  if (html.getAttribute('data-theme') === 'dark') return true;
  if (html.classList.contains('dark')) return true;
  if (body.classList.contains('dark')) return true;

  // Check for common CSS custom properties that indicate dark mode
  const computedStyle = getComputedStyle(html);
  const bgColor = computedStyle.getPropertyValue('--main-surface-primary') ||
                  computedStyle.getPropertyValue('--bg-color') ||
                  computedStyle.backgroundColor;

  if (bgColor && isDarkColor(bgColor)) return true;

  // Fall back to system preference
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

/**
 * Checks if a color string represents a dark color
 */
function isDarkColor(color: string): boolean {
  // Handle rgb/rgba format
  const rgbMatch = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (rgbMatch) {
    const r = parseInt(rgbMatch[1], 10);
    const g = parseInt(rgbMatch[2], 10);
    const b = parseInt(rgbMatch[3], 10);
    // Calculate relative luminance
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance < 0.5;
  }

  // Handle hex format
  const hexMatch = color.match(/^#([0-9a-f]{6})$/i);
  if (hexMatch) {
    const hex = hexMatch[1];
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance < 0.5;
  }

  return false;
}

/**
 * Applies the current theme to all sidebar elements
 */
function applyTheme(): void {
  const t = themes[currentTheme];

  // Panel
  const panel = document.getElementById('zeroretry-panel');
  if (panel) {
    panel.style.backgroundColor = t.panelBg;
    panel.style.borderColor = t.panelBorder;
  }

  // Header
  const header = document.querySelector('.zeroretry-header') as HTMLElement;
  if (header) {
    header.style.backgroundColor = t.headerBg;
    header.style.borderBottomColor = t.headerBorder;
  }

  // Title
  const title = document.getElementById(SIDEBAR_TITLE_ID);
  if (title) {
    title.style.color = t.tabActive;
  }

  // Tab bar
  const tabBar = document.querySelector('.zeroretry-tabs') as HTMLElement;
  if (tabBar) {
    tabBar.style.backgroundColor = t.headerBg;
    tabBar.style.borderBottomColor = t.headerBorder;
  }

  // Tabs
  const tocTab = document.getElementById(SIDEBAR_TOC_TAB_ID);
  const savedTab = document.getElementById(SIDEBAR_SAVED_TAB_ID);
  const projectsTab = document.getElementById(SIDEBAR_PROJECTS_TAB_ID);
  if (tocTab) styleTab(tocTab, activeTab === 'index');
  if (savedTab) styleTab(savedTab, activeTab === 'saved');
  if (projectsTab) styleTab(projectsTab, activeTab === 'projects');

  // Search container
  const searchContainer = document.getElementById('zeroretry-search-container');
  if (searchContainer) {
    searchContainer.style.backgroundColor = t.headerBg;
    searchContainer.style.borderBottomColor = t.headerBorder;
  }

  // Search input
  const searchInput = document.getElementById('zeroretry-search-input') as HTMLInputElement;
  if (searchInput) {
    searchInput.style.backgroundColor = t.searchBg;
    searchInput.style.borderColor = t.searchBorder;
    searchInput.style.color = t.searchText;
  }

  // Loading/empty states
  const loading = document.getElementById(SIDEBAR_LOADING_ID);
  const empty = document.getElementById(SIDEBAR_EMPTY_ID);
  if (loading) loading.style.color = t.textMuted;
  if (empty) empty.style.color = t.textMuted;

  // Collapsed strip
  const collapsedStrip = document.getElementById('zeroretry-collapsed-strip');
  if (collapsedStrip) {
    collapsedStrip.style.backgroundColor = t.collapsedBg;
    collapsedStrip.style.borderColor = t.collapsedBorder;
  }

  // Collapse button
  const collapseBtn = document.getElementById('zeroretry-collapse-btn');
  if (collapseBtn) {
    collapseBtn.style.backgroundColor = t.buttonBg;
    collapseBtn.style.borderColor = t.buttonBorder;
    collapseBtn.style.color = t.buttonText;
  }

  // Close button
  const closeBtn = document.getElementById('zeroretry-close-btn');
  if (closeBtn) {
    closeBtn.style.backgroundColor = t.closeBtnBg;
    closeBtn.style.borderColor = t.closeBtnBorder;
    closeBtn.style.color = t.closeBtnText;
  }

  // Re-render saved panel if active
  if (activeTab === 'saved' && currentSession) {
    renderSavedPanel(currentSession);
  }

  // Re-render projects panel if active
  if (activeTab === 'projects') {
    renderProjectsPanel();
  }

  log('Theme applied:', currentTheme);
}

/**
 * Initializes theme detection and sets up observer for theme changes
 */
function initThemeDetection(): void {
  // Detect initial theme
  currentTheme = detectDarkMode() ? 'dark' : 'light';
  log('Initial theme detected:', currentTheme);

  // Watch for theme changes on html element
  const themeObserver = new MutationObserver(() => {
    const newTheme = detectDarkMode() ? 'dark' : 'light';
    if (newTheme !== currentTheme) {
      currentTheme = newTheme;
      applyTheme();
      // Re-render TOC with new theme colors
      if (currentSession) {
        const url = new URL(window.location.href);
        const adapter = getAdapterForUrl(url);
        if (adapter) {
          refreshTOC(adapter, false, false, currentSession);
        }
      }
    }
  });

  themeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['class', 'data-color-mode', 'data-theme', 'style']
  });

  // Also observe body for class changes
  themeObserver.observe(document.body, {
    attributes: true,
    attributeFilter: ['class']
  });

  // Listen for system theme changes
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    const newTheme = detectDarkMode() ? 'dark' : 'light';
    if (newTheme !== currentTheme) {
      currentTheme = newTheme;
      applyTheme();
      if (currentSession) {
        const url = new URL(window.location.href);
        const adapter = getAdapterForUrl(url);
        if (adapter) {
          refreshTOC(adapter, false, false, currentSession);
        }
      }
    }
  });
}

/**
 * Conditional logging based on DEBUG flag
 */
function log(...args: any[]): void {
  if (DEBUG) {
    console.log('[ZeroRetry Index]', ...args);
  }
}

/**
 * Session lifecycle management for handling conversation switching
 */

interface Session {
  version: number;
  conversationId: string | null;
  conversationKey: string | null;
  platformId: string | null;
  bootObserver: MutationObserver | null;
  bootRetryTimeout: ReturnType<typeof setTimeout> | null;
  bootDebounceTimer: ReturnType<typeof setTimeout> | null;
  liveObserver: MutationObserver | null;
  liveDebounceTimer: ReturnType<typeof setTimeout> | null;
  lastSignature: string;
  isComplete: boolean;
  // Title state
  currentTitle: TitleResult | null;
  titleLocked: boolean;
  titleUnsubscribe: (() => void) | null;
  // Saved items state (current conversation only)
  savedItems: ResolvedSavedItem[];
  savedMessageIds: Set<string>;
}

// Global session state
let currentSessionVersion = 0;
let currentSession: Session | null = null;

/**
 * Creates a new session object
 */
function createSession(
  conversationId: string | null,
  version: number,
  platformId: string | null
): Session {
  const conversationKey = platformId && conversationId
    ? `${platformId}:${conversationId}`
    : null;

  return {
    version,
    conversationId,
    conversationKey,
    platformId,
    bootObserver: null,
    bootRetryTimeout: null,
    bootDebounceTimer: null,
    liveObserver: null,
    liveDebounceTimer: null,
    lastSignature: '',
    isComplete: false,
    currentTitle: null,
    titleLocked: false,
    titleUnsubscribe: null,
    savedItems: [],
    savedMessageIds: new Set()
  };
}

/**
 * Idempotent session teardown
 */
function teardownSession(session: Session): void {
  if (!session) return;

  if (session.bootObserver) {
    session.bootObserver.disconnect();
    session.bootObserver = null;
  }
  if (session.bootRetryTimeout) {
    clearTimeout(session.bootRetryTimeout);
    session.bootRetryTimeout = null;
  }
  if (session.bootDebounceTimer) {
    clearTimeout(session.bootDebounceTimer);
    session.bootDebounceTimer = null;
  }
  if (session.liveObserver) {
    session.liveObserver.disconnect();
    session.liveObserver = null;
  }
  if (session.liveDebounceTimer) {
    clearTimeout(session.liveDebounceTimer);
    session.liveDebounceTimer = null;
  }
  if (session.titleUnsubscribe) {
    session.titleUnsubscribe();
    session.titleUnsubscribe = null;
  }

  session.isComplete = false;
  log('Session', session.version, 'torn down');
}

/**
 * Checks if a session is still current
 */
function isSessionCurrent(session: Session): boolean {
  return session && session.version === currentSessionVersion;
}

/**
 * Resets sidebar UI to loading state
 */
function resetUIToLoading(): void {
  const loading = document.getElementById(SIDEBAR_LOADING_ID);
  const empty = document.getElementById(SIDEBAR_EMPTY_ID);
  const toc = document.getElementById(SIDEBAR_TOC_ID);

  if (loading) {
    loading.textContent = 'Loading messages… (scroll if needed)';
    loading.style.display = 'block';
  }
  if (empty) empty.style.display = 'none';
  if (toc) toc.style.display = 'none';
}
function buildTOCLabel(text: string): string {
  return generateSmartLabel(text, 60);
}

// Minimum length for a message to appear in index
const MIN_MESSAGE_LENGTH = 10;

// Known filler phrases to skip (case-insensitive, exact match)
const FILLER_PHRASES = new Set([
  'hi', 'hello', 'hey', 'yo',
  'ok', 'okay', 'k', 'kk',
  'yes', 'no', 'yep', 'nope', 'yeah', 'nah',
  'thanks', 'thank you', 'thx', 'ty',
  'please', 'pls',
  'sure', 'alright', 'cool', 'nice', 'great',
  'got it', 'understood', 'i see', 'makes sense',
  'hmm', 'hm', 'ah', 'oh', 'uh',
  'continue', 'go on', 'go ahead', 'next',
  'done', 'finished', 'good', 'perfect'
]);

/**
 * Filters and deduplicates messages to user messages only
 * Also filters out short messages and known filler phrases
 */
function getUserMessages(messages: ChatMessage[]): ChatMessage[] {
  const seen = new Set<string>();
  return messages.filter((msg) => {
    if (msg.role !== 'user' || !msg.text.trim()) {
      return false;
    }
    if (seen.has(msg.messageId)) {
      return false;
    }

    const text = msg.text.trim();

    // Filter 1: Skip messages that are too short
    if (text.length < MIN_MESSAGE_LENGTH) {
      return false;
    }

    // Filter 2: Skip known filler phrases (normalized: lowercase, trimmed)
    const normalized = text.toLowerCase();
    if (FILLER_PHRASES.has(normalized)) {
      return false;
    }

    seen.add(msg.messageId);
    return true;
  });
}

/**
 * Renders or updates the TOC in the sidebar
 * Returns a signature for change detection: comma-separated messageIds
 */
function refreshTOC(
  adapter: NonNullable<ReturnType<typeof getAdapterForUrl>>,
  isLoading: boolean,
  isObserverActive: boolean = false,
  session?: Session
): string {
  const body = document.getElementById(SIDEBAR_BODY_ID);
  if (!body) return '';

  const messages = adapter.getMessages();
  const userMessages = getUserMessages(messages);
  const currentSignature = userMessages.map((m) => m.messageId).join(',');

  // Filter messages based on search query
  const query = searchQuery.trim().toLowerCase();
  const displayMessages = query
    ? userMessages.filter(msg => msg.text.toLowerCase().includes(query))
    : userMessages;

  // Hide all states initially
  const loading = document.getElementById(SIDEBAR_LOADING_ID);
  const empty = document.getElementById(SIDEBAR_EMPTY_ID);
  const toc = document.getElementById(SIDEBAR_TOC_ID);

  if (loading) loading.style.display = 'none';
  if (empty) empty.style.display = 'none';
  if (toc) toc.style.display = 'none';

  if (isLoading && userMessages.length === 0) {
    // Still loading, show loading state (only if on index tab)
    if (loading && activeTab === 'index') loading.style.display = 'block';
  } else if (userMessages.length === 0) {
    // No user messages found
    if (empty && activeTab === 'index') {
      // Show scroll prompt if observer is still active, otherwise show "no messages"
      if (isObserverActive) {
        empty.textContent = 'Please scroll to load messages…';
      } else {
        empty.textContent = 'No messages found';
      }
      empty.style.display = 'block';
    }
  } else if (displayMessages.length === 0 && query) {
    // Search returned no results
    if (empty && activeTab === 'index') {
      empty.textContent = `No results for "${searchQuery}"`;
      empty.style.display = 'block';
    }
  } else {
    // Show TOC list - only rebuild if signature changed (only if on index tab)
    if (toc) {
      if (activeTab === 'index') toc.style.display = 'block';
      // Clear existing list
      toc.innerHTML = '';

      // Build list items - use displayMessages (filtered by search)
      const t = themes[currentTheme];
      displayMessages.forEach((msg, index) => {
        const item = document.createElement('div');
        item.className = 'zeroretry-toc-item';
        item.style.display = 'flex';
        item.style.alignItems = 'center';
        item.style.gap = '8px';
        item.style.cursor = 'pointer';
        item.style.padding = '10px 12px';
        item.style.borderBottom = `1px solid ${t.itemBorder}`;
        item.style.transition = 'background-color 0.2s';

        // Text label
        const label = document.createElement('span');
        label.className = 'zeroretry-toc-label';
        label.textContent = buildTOCLabel(msg.text);
        label.title = msg.text;
        label.style.flex = '1';
        label.style.fontSize = '14px';
        label.style.color = t.text;
        label.style.overflow = 'hidden';
        label.style.textOverflow = 'ellipsis';
        label.style.whiteSpace = 'nowrap';

        // Bookmark button
        const isBookmarked = session?.savedMessageIds.has(msg.messageId) ?? false;
        const bookmarkBtn = document.createElement('button');
        bookmarkBtn.className = 'zeroretry-bookmark-btn';
        bookmarkBtn.innerHTML = isBookmarked ? '★' : '☆';
        bookmarkBtn.title = isBookmarked ? 'Remove bookmark' : 'Add bookmark';
        Object.assign(bookmarkBtn.style, {
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          fontSize: '14px',
          color: isBookmarked ? t.bookmarkActive : t.bookmarkInactive,
          padding: '0 4px',
          flexShrink: '0',
          transition: 'color 0.2s'
        });

        // Bookmark click handler
        bookmarkBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          if (session) {
            toggleSave(msg, index, session, bookmarkBtn);
          }
        });

        // Hover effect for bookmark button
        bookmarkBtn.addEventListener('mouseenter', () => {
          if (!session?.savedMessageIds.has(msg.messageId)) {
            bookmarkBtn.style.color = t.bookmarkHover;
          }
        });
        bookmarkBtn.addEventListener('mouseleave', () => {
          const stillBookmarked = session?.savedMessageIds.has(msg.messageId) ?? false;
          bookmarkBtn.style.color = stillBookmarked ? t.bookmarkActive : t.bookmarkInactive;
        });

        item.appendChild(label);
        item.appendChild(bookmarkBtn);

        // Hover effect for item
        item.addEventListener('mouseenter', () => {
          item.style.backgroundColor = t.itemHover;
        });
        item.addEventListener('mouseleave', () => {
          item.style.backgroundColor = 'transparent';
        });

        // Click handler: scroll to message (on label or item, not bookmark button)
        label.addEventListener('click', () => {
          const success = adapter.scrollToMessage(msg.messageId);
          if (success) {
            // Visual confirmation: briefly highlight
            item.style.backgroundColor = t.highlight;
            setTimeout(() => {
              item.style.backgroundColor = 'transparent';
            }, 800);
          }
        });

        toc.appendChild(item);
      });
    }
  }

  return currentSignature;
}

/**
 * Creates and injects the sidebar container into the page
 */
function injectSidebar(): void {
  // Check if sidebar already exists to prevent duplicates
  if (document.getElementById(SIDEBAR_ID)) {
    log('Sidebar already exists, skipping injection');
    return;
  }

  // Create the sidebar container (drawer)
  const sidebar = document.createElement('div');
  sidebar.id = SIDEBAR_ID;

  // Create collapsed strip (slim vertical bar when collapsed)
  const collapsedStrip = document.createElement('div');
  collapsedStrip.id = 'zeroretry-collapsed-strip';
  collapsedStrip.className = 'zeroretry-collapsed-strip';
  collapsedStrip.title = 'Expand ZeroRetry Index';
  collapsedStrip.addEventListener('click', (e) => {
    e.stopPropagation();
    e.preventDefault();
    setUIState('expanded');
  });

  // Add logo to collapsed strip (using img with chrome.runtime.getURL)
  const stripLogo = document.createElement('div');
  stripLogo.className = 'zeroretry-strip-logo';
  const stripIcon = document.createElement('img');
  stripIcon.src = chrome.runtime.getURL('public/icons/header-icon.svg');
  stripIcon.alt = 'ZR';
  Object.assign(stripIcon.style, {
    width: '24px',
    height: '24px'
  });
  stripLogo.appendChild(stripIcon);

  // Add expand indicator to collapsed strip
  const expandIndicator = document.createElement('div');
  expandIndicator.className = 'zeroretry-expand-indicator';
  expandIndicator.innerHTML = '«';

  // Add close button to collapsed strip
  const stripCloseBtn = document.createElement('button');
  stripCloseBtn.className = 'zeroretry-strip-close';
  stripCloseBtn.innerHTML = '×';
  stripCloseBtn.title = 'Minimize';
  stripCloseBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    e.preventDefault();
    setUIState('minimized');
  });

  collapsedStrip.appendChild(stripLogo);
  collapsedStrip.appendChild(expandIndicator);
  collapsedStrip.appendChild(stripCloseBtn);
  sidebar.appendChild(collapsedStrip);

  // Create expanded panel
  const expandedPanel = document.createElement('div');
  expandedPanel.id = 'zeroretry-panel';
  expandedPanel.className = 'zeroretry-panel';
  
  // Create header
  const header = document.createElement('div');
  header.className = 'zeroretry-header';
  
  const headerLogo = document.createElement('div');
  headerLogo.className = 'zeroretry-header-logo';
  Object.assign(headerLogo.style, {
    display: 'flex',
    alignItems: 'center',
    flexShrink: '0'
  });

  // Icon only - clean and non-intrusive
  const iconImg = document.createElement('img');
  iconImg.src = chrome.runtime.getURL('public/icons/header-icon.svg');
  iconImg.alt = 'ZeroRetry Index';
  iconImg.title = 'ZeroRetry Index';
  Object.assign(iconImg.style, {
    width: '20px',
    height: '20px'
  });

  headerLogo.appendChild(iconImg);
  
  const title = document.createElement('h3');
  title.id = SIDEBAR_TITLE_ID;
  title.textContent = 'Loading...';
  title.className = 'zeroretry-title';
  title.title = 'Click to edit title';
  
  // Create collapse button for header (collapses to strip)
  const collapseButton = document.createElement('button');
  collapseButton.id = 'zeroretry-collapse-btn';
  collapseButton.className = 'zeroretry-collapse-btn';
  collapseButton.innerHTML = '»';
  collapseButton.title = 'Collapse panel';
  collapseButton.addEventListener('click', (e) => {
    e.stopPropagation();
    e.preventDefault();
    setUIState('collapsed');
  });

  // Create close button for header (minimizes to icon)
  const closeButton = document.createElement('button');
  closeButton.id = 'zeroretry-close-btn';
  closeButton.className = 'zeroretry-close-btn';
  closeButton.innerHTML = '×';
  closeButton.title = 'Minimize';
  closeButton.addEventListener('click', (e) => {
    e.stopPropagation();
    e.preventDefault();
    setUIState('minimized');
  });

  // Create header left group (logo + title)
  const headerLeft = document.createElement('div');
  headerLeft.className = 'zeroretry-header-left';
  headerLeft.appendChild(headerLogo);
  headerLeft.appendChild(title);

  // Create header right group (collapse + close)
  const headerRight = document.createElement('div');
  headerRight.className = 'zeroretry-header-right';
  headerRight.appendChild(collapseButton);
  headerRight.appendChild(closeButton);

  header.appendChild(headerLeft);
  header.appendChild(headerRight);
  
  expandedPanel.appendChild(header);
  
  // Create body container
  const body = document.createElement('div');
  body.id = SIDEBAR_BODY_ID;

  // Create tab bar
  const tabBar = document.createElement('div');
  tabBar.className = 'zeroretry-tabs';
  Object.assign(tabBar.style, {
    display: 'flex',
    borderBottom: `1px solid ${themes[currentTheme].headerBorder}`,
    backgroundColor: themes[currentTheme].headerBg,
    flexShrink: '0'
  });

  // Index tab
  const tocTab = document.createElement('button');
  tocTab.id = SIDEBAR_TOC_TAB_ID;
  tocTab.textContent = 'Index';
  tocTab.className = 'zeroretry-tab active';
  styleTab(tocTab, true);
  tocTab.addEventListener('click', () => switchTab('index'));

  // Bookmarks tab
  const bookmarksTab = document.createElement('button');
  bookmarksTab.id = SIDEBAR_SAVED_TAB_ID;
  bookmarksTab.textContent = '★ Saved';
  bookmarksTab.className = 'zeroretry-tab';
  styleTab(bookmarksTab, false);
  bookmarksTab.addEventListener('click', () => switchTab('saved'));

  // Projects tab
  const projectsTab = document.createElement('button');
  projectsTab.id = SIDEBAR_PROJECTS_TAB_ID;
  projectsTab.textContent = 'Projects';
  projectsTab.className = 'zeroretry-tab';
  styleTab(projectsTab, false);
  projectsTab.addEventListener('click', () => switchTab('projects'));

  tabBar.appendChild(tocTab);
  tabBar.appendChild(bookmarksTab);
  tabBar.appendChild(projectsTab);
  body.appendChild(tabBar);

  // Search input container
  const searchContainer = document.createElement('div');
  searchContainer.id = 'zeroretry-search-container';
  searchContainer.className = 'zeroretry-search-container';
  Object.assign(searchContainer.style, {
    padding: '8px 12px',
    borderBottom: `1px solid ${themes[currentTheme].headerBorder}`,
    backgroundColor: themes[currentTheme].headerBg,
    display: activeTab === 'index' ? 'block' : 'none'
  });

  const searchInput = document.createElement('input');
  searchInput.id = 'zeroretry-search-input';
  searchInput.type = 'text';
  searchInput.placeholder = 'Filter messages...';
  Object.assign(searchInput.style, {
    width: '100%',
    padding: '8px 10px',
    fontSize: '13px',
    border: `1px solid ${themes[currentTheme].searchBorder}`,
    borderRadius: '6px',
    backgroundColor: themes[currentTheme].searchBg,
    color: themes[currentTheme].searchText,
    outline: 'none',
    boxSizing: 'border-box'
  });

  // Focus styles
  searchInput.addEventListener('focus', () => {
    searchInput.style.borderColor = themes[currentTheme].tabActiveBorder;
    searchInput.style.boxShadow = `0 0 0 2px ${themes[currentTheme].tabActiveBorder}33`;
  });
  searchInput.addEventListener('blur', () => {
    searchInput.style.borderColor = themes[currentTheme].searchBorder;
    searchInput.style.boxShadow = 'none';
  });

  searchContainer.appendChild(searchInput);
  body.appendChild(searchContainer);

  // Loading state
  const loading = document.createElement('div');
  loading.id = SIDEBAR_LOADING_ID;
  loading.textContent = 'Loading messages… (scroll if needed)';
  loading.style.padding = '16px';
  loading.style.color = themes[currentTheme].textMuted;
  loading.style.fontSize = '14px';
  loading.style.textAlign = 'center';
  loading.style.display = 'block';
  body.appendChild(loading);

  // Empty state
  const empty = document.createElement('div');
  empty.id = SIDEBAR_EMPTY_ID;
  empty.textContent = 'No messages found';
  empty.style.padding = '16px';
  empty.style.color = themes[currentTheme].textMuted;
  empty.style.fontSize = '14px';
  empty.style.textAlign = 'center';
  empty.style.display = 'none';
  body.appendChild(empty);
  
  // TOC list
  const toc = document.createElement('div');
  toc.id = SIDEBAR_TOC_ID;
  toc.style.display = 'none';
  toc.style.flex = '1';
  toc.style.overflowY = 'auto';
  body.appendChild(toc);

  // Bookmarks panel (hidden by default)
  const bookmarksPanel = document.createElement('div');
  bookmarksPanel.id = SIDEBAR_SAVED_PANEL_ID;
  Object.assign(bookmarksPanel.style, {
    display: 'none',
    flex: '1',
    overflowY: 'auto'
  });
  body.appendChild(bookmarksPanel);

  // Projects panel (hidden by default)
  const projectsPanel = document.createElement('div');
  projectsPanel.id = SIDEBAR_PROJECTS_PANEL_ID;
  Object.assign(projectsPanel.style, {
    display: 'none',
    flex: '1',
    overflowY: 'auto',
    position: 'relative'
  });
  body.appendChild(projectsPanel);

  expandedPanel.appendChild(body);
  
  sidebar.appendChild(expandedPanel);

  // Create minimized icon (shown when UI is minimized)
  const minimizedIcon = document.createElement('div');
  minimizedIcon.id = 'zeroretry-minimized-icon';
  minimizedIcon.className = 'zeroretry-minimized-icon';
  minimizedIcon.title = 'Open ZeroRetry Index';
  const minIcon = document.createElement('img');
  minIcon.src = chrome.runtime.getURL('public/icons/header-icon.svg');
  minIcon.alt = 'ZR';
  Object.assign(minIcon.style, {
    width: '20px',
    height: '20px'
  });
  minimizedIcon.appendChild(minIcon);
  minimizedIcon.addEventListener('click', (e) => {
    e.stopPropagation();
    e.preventDefault();
    setUIState('expanded');
  });

  // Style minimized icon
  Object.assign(minimizedIcon.style, {
    position: 'fixed',
    bottom: '20px',
    right: '20px',
    width: '40px',
    height: '40px',
    borderRadius: '20px',
    backgroundColor: 'rgba(107, 114, 128, 0.15)',
    border: '1px solid rgba(107, 114, 128, 0.3)',
    display: uiState === 'minimized' ? 'flex' : 'none',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    zIndex: '9998',
    backdropFilter: 'blur(4px)'
  });

  // Hover effect for minimized icon
  minimizedIcon.addEventListener('mouseenter', () => {
    minimizedIcon.style.backgroundColor = 'rgba(31, 41, 55, 0.9)';
    minimizedIcon.style.borderColor = '#10b981';
    minimizedIcon.style.transform = 'scale(1.1)';
  });
  minimizedIcon.addEventListener('mouseleave', () => {
    minimizedIcon.style.backgroundColor = 'rgba(107, 114, 128, 0.15)';
    minimizedIcon.style.borderColor = 'rgba(107, 114, 128, 0.3)';
    minimizedIcon.style.transform = 'scale(1)';
  });

  // Apply styles
  applySidebarStyles(sidebar, collapsedStrip, expandedPanel, header, title, collapseButton, closeButton, body);

  // Inject into page
  document.body.appendChild(sidebar);
  document.body.appendChild(minimizedIcon);

  log('Sidebar injected successfully');

  // Log initial UI state
  console.log('[ZeroRetry Index] UI state:', uiState);
}

/**
 * Applies inline styles to the sidebar and its elements
 */
function applySidebarStyles(
  sidebar: HTMLElement,
  collapsedStrip: HTMLElement,
  expandedPanel: HTMLElement,
  header: HTMLElement,
  title: HTMLElement,
  collapseButton: HTMLElement,
  closeButton: HTMLElement,
  body: HTMLElement
): void {
  // Main sidebar container (drawer wrapper)
  Object.assign(sidebar.style, {
    position: 'fixed',
    top: '80px',
    right: '20px',
    height: 'calc(100vh - 100px)',
    zIndex: '9999',
    display: 'flex',
    flexDirection: 'row',
    gap: '0',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    pointerEvents: 'none'
  });

  // Collapsed strip (slim vertical bar - styled as subtle "handle")
  const tCollapsed = themes[currentTheme];
  Object.assign(collapsedStrip.style, {
    pointerEvents: 'auto',
    display: uiState === 'collapsed' ? 'flex' : 'none',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    width: '48px',
    height: '100%',
    backgroundColor: tCollapsed.collapsedBg,
    border: `1px solid ${tCollapsed.collapsedBorder}`,
    borderRadius: '8px',
    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
    backdropFilter: 'blur(8px)',
    padding: '12px 0',
    gap: '12px',
    cursor: 'pointer',
    transition: 'all 0.2s ease'
  });

  // Strip logo styles
  const stripLogo = collapsedStrip.querySelector('.zeroretry-strip-logo') as HTMLElement;
  if (stripLogo) {
    Object.assign(stripLogo.style, {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: '32px',
      height: '32px'
    });
  }

  // Expand indicator styles
  const expandIndicator = collapsedStrip.querySelector('.zeroretry-expand-indicator') as HTMLElement;
  if (expandIndicator) {
    Object.assign(expandIndicator.style, {
      fontSize: '18px',
      color: '#10b981',
      fontWeight: 'bold'
    });
  }

  // Strip close button styles
  const stripCloseBtn = collapsedStrip.querySelector('.zeroretry-strip-close') as HTMLElement;
  if (stripCloseBtn) {
    Object.assign(stripCloseBtn.style, {
      padding: '4px 8px',
      fontSize: '14px',
      fontWeight: 'bold',
      color: '#9ca3af',
      backgroundColor: 'transparent',
      border: '1px solid rgba(156, 163, 175, 0.5)',
      borderRadius: '4px',
      cursor: 'pointer',
      transition: 'all 0.2s'
    });
    stripCloseBtn.addEventListener('mouseenter', () => {
      stripCloseBtn.style.backgroundColor = 'rgba(254, 226, 226, 0.9)';
      stripCloseBtn.style.borderColor = '#fca5a5';
      stripCloseBtn.style.color = '#dc2626';
    });
    stripCloseBtn.addEventListener('mouseleave', () => {
      stripCloseBtn.style.backgroundColor = 'transparent';
      stripCloseBtn.style.borderColor = 'rgba(156, 163, 175, 0.5)';
      stripCloseBtn.style.color = '#9ca3af';
    });
  }

  // Hover effect for collapsed strip
  collapsedStrip.addEventListener('mouseenter', () => {
    collapsedStrip.style.backgroundColor = tCollapsed.collapsedHoverBg;
  });
  collapsedStrip.addEventListener('mouseleave', () => {
    collapsedStrip.style.backgroundColor = tCollapsed.collapsedBg;
  });

  // Expanded panel (drawer)
  const t = themes[currentTheme];
  Object.assign(expandedPanel.style, {
    pointerEvents: 'auto',
    display: uiState === 'expanded' ? 'flex' : 'none',
    flexDirection: 'column',
    width: '320px',
    height: '100%',
    backgroundColor: t.panelBg,
    border: `1px solid ${t.panelBorder}`,
    borderRadius: '8px',
    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
    overflow: 'hidden',
    transition: 'all 0.3s ease'
  });

  // Header styles
  Object.assign(header.style, {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '8px',
    padding: '12px 16px',
    borderBottom: `1px solid ${t.headerBorder}`,
    backgroundColor: t.headerBg,
    flexShrink: '0'
  });

  // Header left group (logo + title)
  const headerLeft = header.querySelector('.zeroretry-header-left') as HTMLElement;
  if (headerLeft) {
    Object.assign(headerLeft.style, {
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      flex: '1',
      minWidth: '0'
    });
  }

  // Header right group (collapse + pause)
  const headerRight = header.querySelector('.zeroretry-header-right') as HTMLElement;
  if (headerRight) {
    Object.assign(headerRight.style, {
      display: 'flex',
      alignItems: 'center',
      gap: '6px',
      flexShrink: '0'
    });
  }

  const headerLogo = header.querySelector('.zeroretry-header-logo') as HTMLElement;
  if (headerLogo) {
    Object.assign(headerLogo.style, {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: '20px',
      height: '20px',
      flexShrink: '0'
    });
  }

  // Title styles
  Object.assign(title.style, {
    margin: '0',
    fontSize: '16px',
    fontWeight: '600',
    color: t.tabActive,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    cursor: 'pointer'
  });

  // Collapse button styles (in header)
  Object.assign(collapseButton.style, {
    padding: '6px 10px',
    fontSize: '14px',
    fontWeight: 'bold',
    color: t.buttonText,
    backgroundColor: t.buttonBg,
    border: `1px solid ${t.buttonBorder}`,
    borderRadius: '6px',
    cursor: 'pointer',
    transition: 'all 0.2s',
    flexShrink: '0'
  });

  // Add hover effect to collapse button
  collapseButton.addEventListener('mouseenter', () => {
    collapseButton.style.backgroundColor = t.buttonBorder;
  });

  collapseButton.addEventListener('mouseleave', () => {
    collapseButton.style.backgroundColor = t.buttonBg;
  });

  // Close button styles (minimize to icon)
  Object.assign(closeButton.style, {
    padding: '6px 10px',
    fontSize: '16px',
    fontWeight: 'bold',
    color: t.closeBtnText,
    backgroundColor: t.closeBtnBg,
    border: `1px solid ${t.closeBtnBorder}`,
    borderRadius: '6px',
    cursor: 'pointer',
    transition: 'all 0.2s',
    flexShrink: '0'
  });

  // Add hover effect to close button
  closeButton.addEventListener('mouseenter', () => {
    closeButton.style.backgroundColor = t.closeBtnHoverBg;
    closeButton.style.borderColor = t.closeBtnHoverBorder;
    closeButton.style.color = t.closeBtnHoverText;
  });

  closeButton.addEventListener('mouseleave', () => {
    closeButton.style.backgroundColor = t.closeBtnBg;
    closeButton.style.borderColor = t.closeBtnBorder;
    closeButton.style.color = t.closeBtnText;
  });

  // Body styles
  Object.assign(body.style, {
    flex: '1',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden'
  });
}

/**
 * Sets the UI state (expanded, collapsed, or minimized)
 */
function setUIState(newState: UIState): void {
  uiState = newState;

  const panel = document.getElementById('zeroretry-panel') as HTMLElement;
  const strip = document.getElementById('zeroretry-collapsed-strip') as HTMLElement;
  const icon = document.getElementById('zeroretry-minimized-icon') as HTMLElement;

  // Always log state changes
  console.log('[ZeroRetry Index] UI state:', uiState);

  if (panel) {
    panel.style.display = newState === 'expanded' ? 'flex' : 'none';
  }

  if (strip) {
    strip.style.display = newState === 'collapsed' ? 'flex' : 'none';
  }

  if (icon) {
    icon.style.display = newState === 'minimized' ? 'flex' : 'none';
  }
}

/**
 * Updates the sidebar title from the adapter
 */
function updateTitle(adapter: NonNullable<ReturnType<typeof getAdapterForUrl>>, session: Session): void {
  if (!isSessionCurrent(session)) return;
  if (session.titleLocked) return;

  const titleResult = adapter.getConversationTitle();
  const titleEl = document.getElementById(SIDEBAR_TITLE_ID);

  if (titleEl && titleResult.value !== session.currentTitle?.value) {
    titleEl.textContent = titleResult.value;
    titleEl.dataset.source = titleResult.source;
    session.currentTitle = titleResult;
    log('Title updated:', titleResult.value, `(${titleResult.source})`);
  }
}

/**
 * Resolves and caches bookmarks for the current session (current conversation only)
 */
async function resolveAndCacheBookmarks(
  adapter: NonNullable<ReturnType<typeof getAdapterForUrl>>,
  session: Session
): Promise<void> {
  if (!isSessionCurrent(session)) return;

  // Load current conversation items only if we have a conversationKey
  if (session.conversationKey) {
    const messages = adapter.getMessages();
    const rawSavedItems = await getSavedItemsForConversation(session.conversationKey);

    session.savedItems = resolveSavedItems(rawSavedItems, messages);
    session.savedMessageIds = new Set(
      session.savedItems
        .filter((item: ResolvedSavedItem) => item.status === 'active')
        .map((item: ResolvedSavedItem) => item.anchor.messageId)
    );

    console.log('[ZeroRetry Index] BOOT_RESOLVE: raw=' + rawSavedItems.length, 'resolved=' + session.savedItems.length, 'active=' + session.savedMessageIds.size);
  }
}

/**
 * Toggles save for a message
 */
async function toggleSave(
  msg: ChatMessage,
  msgIndex: number,
  session: Session,
  saveBtn: HTMLElement
): Promise<void> {
  if (!session.conversationKey || !session.platformId) {
    console.log('[ZeroRetry Index] TOGGLE_SAVE: SKIPPED - no convKey or platformId');
    return;
  }

  const isSaved = session.savedMessageIds.has(msg.messageId);

  if (isSaved) {
    // Remove saved item
    const removed = await removeSavedItemByMessageId(session.conversationKey, msg.messageId);
    if (removed) {
      session.savedMessageIds.delete(msg.messageId);
      session.savedItems = session.savedItems.filter((item: ResolvedSavedItem) => item.anchor.messageId !== msg.messageId);

      // If Saved tab is active, re-render to reflect removal
      if (activeTab === 'saved') {
        renderSavedPanel(session);
      }

      saveBtn.innerHTML = '☆';
      saveBtn.style.color = '#9ca3af';
      saveBtn.title = 'Save';
      console.log('[ZeroRetry Index] UNSAVED:', msg.messageId, 'remaining:', session.savedItems.length);
    }
  } else {
    // Add saved item
    const savedItem = createSavedItem(msg, msgIndex, session.conversationKey, session.platformId as ChatPlatformId);
    await addSavedItem(savedItem);
    session.savedMessageIds.add(msg.messageId);
    session.savedItems.push({ ...savedItem, status: 'active', resolvedMessageId: msg.messageId });

    // If Saved tab is active, re-render to show new item
    if (activeTab === 'saved') {
      renderSavedPanel(session);
    }

    saveBtn.innerHTML = '★';
    saveBtn.style.color = '#f59e0b';
    saveBtn.title = 'Remove';
    console.log('[ZeroRetry Index] SAVED:', msg.messageId, 'convKey:', session.conversationKey, 'total:', session.savedItems.length);

    // Show project selector dropdown
    const sidebarBody = document.getElementById(SIDEBAR_BODY_ID);
    if (sidebarBody) {
      try {
        const projects = await loadProjects();
        if (projects.length > 0) {
          showProjectSelector(
            saveBtn,
            sidebarBody,
            projects,
            themes[currentTheme],
            async (projectId) => {
              if (projectId) {
                await assignItemToProject(savedItem.id, projectId);
                console.log('[ZeroRetry Index] ASSIGNED to project:', projectId);
              }
            },
            async () => {
              const name = prompt('Project name:');
              if (!name) return;
              const desc = prompt('Description (optional):') || undefined;
              const project = createProject(name, desc);
              await addProjectToStorage(project);
              await assignItemToProject(savedItem.id, project.id);
              console.log('[ZeroRetry Index] CREATED+ASSIGNED project:', project.id);
            }
          );
        }
      } catch (err) {
        console.log('[ZeroRetry Index] PROJECT_SELECTOR_ERROR:', err);
      }
    }
  }
}

/**
 * Styles a tab button based on active state
 */
function styleTab(tab: HTMLElement, isActive: boolean): void {
  const t = themes[currentTheme];
  Object.assign(tab.style, {
    flex: '1',
    padding: '10px 12px',
    border: 'none',
    background: 'transparent',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: isActive ? '600' : '400',
    color: isActive ? t.tabActive : t.tabInactive,
    borderBottom: isActive ? `2px solid ${t.tabActiveBorder}` : '2px solid transparent',
    transition: 'all 0.2s'
  });
}

/**
 * Switches between Index and Saved tabs
 */
function switchTab(tab: SidebarTab): void {
  console.log('[ZeroRetry Index] SWITCH_TAB:', tab, 'session?', !!currentSession, 'items:', currentSession?.savedItems.length);
  activeTab = tab;

  const tocTab = document.getElementById(SIDEBAR_TOC_TAB_ID);
  const savedTab = document.getElementById(SIDEBAR_SAVED_TAB_ID);
  const projectsTab = document.getElementById(SIDEBAR_PROJECTS_TAB_ID);
  const toc = document.getElementById(SIDEBAR_TOC_ID);
  const savedPanel = document.getElementById(SIDEBAR_SAVED_PANEL_ID);
  const projectsPanel = document.getElementById(SIDEBAR_PROJECTS_PANEL_ID);
  const loading = document.getElementById(SIDEBAR_LOADING_ID);
  const empty = document.getElementById(SIDEBAR_EMPTY_ID);
  const searchContainer = document.getElementById('zeroretry-search-container');

  // Style all tabs
  if (tocTab) styleTab(tocTab, tab === 'index');
  if (savedTab) styleTab(savedTab, tab === 'saved');
  if (projectsTab) styleTab(projectsTab, tab === 'projects');

  // Hide all panels first
  if (toc) toc.style.display = 'none';
  if (savedPanel) savedPanel.style.display = 'none';
  if (projectsPanel) projectsPanel.style.display = 'none';
  if (searchContainer) searchContainer.style.display = 'none';
  if (loading) loading.style.display = 'none';
  if (empty) empty.style.display = 'none';

  if (tab === 'index') {
    if (toc) toc.style.display = 'block';
    if (searchContainer) searchContainer.style.display = 'block';
  } else if (tab === 'saved') {
    if (savedPanel) savedPanel.style.display = 'block';
    if (currentSession) {
      renderSavedPanel(currentSession);
    }
  } else if (tab === 'projects') {
    if (projectsPanel) projectsPanel.style.display = 'flex';
    renderProjectsPanel();
  }
}

/**
 * Renders the saved panel content - shows only current conversation's saved items
 */
function renderSavedPanel(session: Session): void {
  const panel = document.getElementById(SIDEBAR_SAVED_PANEL_ID);
  if (!panel) return;

  panel.innerHTML = '';
  const t = themes[currentTheme];

  // Only show items from current conversation
  const items = session.savedItems;
  console.log('[ZeroRetry Index] RENDER_SAVED: items=' + items.length, 'convKey:', session.conversationKey, 'v:', session.version);

  if (items.length === 0) {
    // Fallback: try loading from storage in case in-memory state was lost
    if (session.conversationKey) {
      getSavedItemsForConversation(session.conversationKey).then(stored => {
        console.log('[ZeroRetry Index] STORAGE_FALLBACK: found=' + stored.length);
        if (stored.length > 0) {
          session.savedItems = stored.map(item => ({
            ...item,
            status: 'active' as const,
            resolvedMessageId: item.anchor.messageId
          }));
          session.savedMessageIds = new Set(stored.map(i => i.anchor.messageId));
          renderSavedPanel(session); // Re-render with loaded items
        }
      });
    }

    const emptyMsg = document.createElement('div');
    emptyMsg.className = 'zeroretry-saved-empty';
    emptyMsg.textContent = 'No saved items in this conversation';
    Object.assign(emptyMsg.style, {
      padding: '24px 16px',
      textAlign: 'center',
      color: t.textMuted,
      fontSize: '14px'
    });
    panel.appendChild(emptyMsg);
    return;
  }

  // Get adapter for scrollToMessage
  const url = new URL(window.location.href);
  const adapter = getAdapterForUrl(url);

  // Render each saved item (all from current conversation)
  items.forEach(item => {
    const itemElement = renderSavedItem(item, session.platformId as ChatPlatformId, {
      onDelete: async (id: string) => {
        await removeSavedItem(id);
        session.savedItems = session.savedItems.filter(i => i.id !== id);
        session.savedMessageIds.delete(item.anchor.messageId);
        renderSavedPanel(session);
        // Re-render TOC to update bookmark indicators
        if (adapter) refreshTOC(adapter, false, false, session);
      },
      onUpdate: async () => {
        // Refresh saved items after update
        if (adapter) {
          await resolveAndCacheBookmarks(adapter, session);
          renderSavedPanel(session);
        }
      },
      scrollToMessage: (messageId: string) => {
        return adapter ? adapter.scrollToMessage(messageId) : false;
      }
    });
    panel.appendChild(itemElement);
  });
}

// Track which project detail is being viewed (null = list view)
let activeProjectId: string | null = null;

/**
 * Renders the projects panel content
 */
async function renderProjectsPanel(): Promise<void> {
  const panel = document.getElementById(SIDEBAR_PROJECTS_PANEL_ID);
  if (!panel) return;

  panel.innerHTML = '';
  const t = themes[currentTheme];

  try {
    const projects = await loadProjects();

    if (activeProjectId) {
      // Detail view
      const project = projects.find(p => p.id === activeProjectId);
      if (!project) {
        activeProjectId = null;
        renderProjectsPanel();
        return;
      }

      const items = await getSavedItemsForProject(activeProjectId);
      const detailEl = renderProjectDetail(
        project,
        items,
        t,
        () => { activeProjectId = null; renderProjectsPanel(); },
        async () => {
          await deleteProjectFromStorage(activeProjectId!);
          activeProjectId = null;
          renderProjectsPanel();
        },
        (item) => {
          // Navigate to item's conversation
          const url = new URL(window.location.href);
          const adapter = getAdapterForUrl(url);
          if (adapter && item.anchor?.messageId) {
            adapter.scrollToMessage(item.anchor.messageId);
          }
        }
      );
      panel.appendChild(detailEl);
    } else {
      // List view
      const itemCounts = new Map<string, number>();
      for (const project of projects) {
        const items = await getSavedItemsForProject(project.id);
        itemCounts.set(project.id, items.length);
      }

      const listEl = renderProjectsList(
        projects,
        itemCounts,
        t,
        (projectId) => { activeProjectId = projectId; renderProjectsPanel(); },
        async () => {
          const name = prompt('Project name:');
          if (!name) return;
          const desc = prompt('Description (optional):') || undefined;
          const project = createProject(name, desc);
          await addProjectToStorage(project);
          renderProjectsPanel();
        }
      );
      panel.appendChild(listEl);
    }
  } catch (err) {
    console.log('[ZeroRetry Index] PROJECTS_PANEL_ERROR:', err);
    const errorMsg = document.createElement('div');
    errorMsg.textContent = 'Failed to load projects';
    Object.assign(errorMsg.style, {
      padding: '24px 16px',
      textAlign: 'center',
      color: t.textMuted,
      fontSize: '14px'
    });
    panel.appendChild(errorMsg);
  }
}

/**
 * Sets up the search input functionality
 */
function setupSearchInput(adapter: NonNullable<ReturnType<typeof getAdapterForUrl>>, session: Session): void {
  const searchInput = document.getElementById('zeroretry-search-input') as HTMLInputElement;
  if (!searchInput) return;

  // Clear previous value on new session
  searchInput.value = '';
  searchQuery = '';

  // Create debounced search handler
  const handleSearch = debounce((value: string) => {
    if (!isSessionCurrent(session)) return;
    searchQuery = value.toLowerCase();
    refreshTOC(adapter, false, false, session);
  }, 150);

  // Remove old listeners by replacing the element
  const newSearchInput = searchInput.cloneNode(true) as HTMLInputElement;
  searchInput.parentNode?.replaceChild(newSearchInput, searchInput);

  // Add new listener
  newSearchInput.addEventListener('input', (e) => {
    const target = e.target as HTMLInputElement;
    handleSearch(target.value);
  });

  // Re-apply styles (they get lost on clone)
  Object.assign(newSearchInput.style, {
    width: '100%',
    padding: '8px 10px',
    fontSize: '13px',
    border: `1px solid ${themes[currentTheme].searchBorder}`,
    borderRadius: '6px',
    backgroundColor: themes[currentTheme].searchBg,
    color: themes[currentTheme].searchText,
    outline: 'none',
    boxSizing: 'border-box'
  });

  newSearchInput.addEventListener('focus', () => {
    newSearchInput.style.borderColor = themes[currentTheme].tabActiveBorder;
    newSearchInput.style.boxShadow = `0 0 0 2px ${themes[currentTheme].tabActiveBorder}33`;
  });
  newSearchInput.addEventListener('blur', () => {
    newSearchInput.style.borderColor = themes[currentTheme].searchBorder;
    newSearchInput.style.boxShadow = 'none';
  });
}

/**
 * Sets up click-to-edit functionality for the title
 */
function setupTitleEdit(session: Session): void {
  const titleEl = document.getElementById(SIDEBAR_TITLE_ID);
  if (!titleEl) return;

  titleEl.addEventListener('click', () => {
    const current = titleEl.textContent || '';
    const newTitle = prompt('Edit conversation title:', current);

    if (newTitle !== null && newTitle.trim() !== current) {
      const finalTitle = newTitle.trim() || current;
      titleEl.textContent = finalTitle;
      session.titleLocked = true;
      session.currentTitle = { value: finalTitle, source: 'ui' };
      log('Title manually set:', finalTitle);
    }
  });
}

/**
 * Checks if the extension context is still valid (not reloaded)
 */
function isExtensionContextValid(): boolean {
  try {
    return !!chrome.runtime?.id;
  } catch {
    return false;
  }
}

/**
 * Initialize the extension
 */
function init(): void {
  console.log('[ZeroRetry Index] Build: 2026-02-13-fix1');

  // Exit early if extension context is invalid (extension was reloaded)
  if (!isExtensionContextValid()) {
    console.warn('[ZeroRetry Index] Extension was reloaded. Please refresh the page.');
    return;
  }

  // Get the current page URL and find matching adapter
  const url = new URL(window.location.href);
  const adapter = getAdapterForUrl(url);

  // Exit if no adapter matches this URL
  if (!adapter) {
    log('No matching adapter for URL:', url.hostname);
    return;
  }

  // Log which adapter is being used
  log('Using adapter:', adapter.id);

  // Initialize theme detection
  initThemeDetection();

  // Wait for DOM to be ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      injectSidebar();
      setupConversationWatcher(adapter);
    });
  } else {
    injectSidebar();
    setupConversationWatcher(adapter);
  }
}

/**
 * Sets up conversation change listener and starts initial session
 */
function setupConversationWatcher(adapter: NonNullable<ReturnType<typeof getAdapterForUrl>>): void {
  // Start initial session
  startNewSession(adapter);

  // Watch for conversation changes
  adapter.onConversationChange(() => {
    log('Conversation changed');
    startNewSession(adapter);
  });
}

/**
 * Starts a new session for the current conversation
 */
function startNewSession(adapter: NonNullable<ReturnType<typeof getAdapterForUrl>>): void {
  // Increment session version and tear down old session
  currentSessionVersion++;
  if (currentSession) {
    teardownSession(currentSession);
  }

  // Create and initialize new session
  const conversationId = adapter.getConversationId();
  const newSession = createSession(conversationId, currentSessionVersion, adapter.id);
  currentSession = newSession;

  console.log('[ZeroRetry Index] NEW_SESSION: v=' + newSession.version, 'convId:', conversationId, 'key:', newSession.conversationKey);

  // Reset UI to loading
  resetUIToLoading();

  // Set up title edit handler
  setupTitleEdit(newSession);

  // Set up search input
  setupSearchInput(adapter, newSession);

  // Set up title observation for auto-sync
  newSession.titleUnsubscribe = adapter.observeTitleChanges(() => {
    if (!newSession.titleLocked) {
      updateTitle(adapter, newSession);
    }
  });

  // Boot the TOC for this session
  bootTOC(adapter, newSession);
}

/**
 * Starts live update observer after initial TOC render
 * Watches for new messages and updates TOC without reloading
 */
function startLiveUpdates(adapter: NonNullable<ReturnType<typeof getAdapterForUrl>>, session: Session): void {
  if (!isSessionCurrent(session)) return;

  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let lastRefreshTime = 0;
  const debounceDelay = 400; // 400ms debounce for streaming
  const minRefreshInterval = 1000; // Never refresh more than once per second even if signature changes

  /**
   * Re-evaluate and refresh TOC if messages changed and throttle allows
   */
  const updateTOC = () => {
    if (!isSessionCurrent(session)) return;

    const now = Date.now();
    // Check throttle: ensure minimum interval between refreshes
    if (now - lastRefreshTime < minRefreshInterval) {
      log('Session', session.version, 'throttled refresh (< 1s since last update)');
      return;
    }

    const messages = adapter.getMessages();
    const userMessages = getUserMessages(messages);
    const newSignature = userMessages.map((m) => m.messageId).join(',');

    // Only update if signature changed (new/removed messages)
    if (newSignature !== session.lastSignature) {
      session.lastSignature = newSignature;
      lastRefreshTime = now;
      refreshTOC(adapter, false, false, session);
      if (newSignature !== '') {
        log('Session', session.version, 'TOC updated with', newSignature.split(',').length, 'user messages');
      }
    }
  };

  /**
   * Debounced mutation handler
   */
  const onMutation = () => {
    if (!isSessionCurrent(session)) return;

    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }
    debounceTimer = setTimeout(updateTOC, debounceDelay);
  };

  /**
   * Observer that ignores mutations inside sidebar to avoid self-triggering
   */
  const liveObserver = new MutationObserver((mutations) => {
    if (!isSessionCurrent(session)) return;

    // Filter out mutations from within the sidebar (ignore self-triggers)
    const sidebar = document.getElementById(SIDEBAR_ID);
    const hasSidebarMutation = mutations.some((mutation) => {
      if (sidebar && mutation.target) {
        // Check if mutation target or any ancestor is the sidebar
        let current: Node | null = mutation.target;
        while (current) {
          if (current === sidebar) {
            return true;
          }
          current = current.parentNode;
        }
      }
      return false;
    });

    if (!hasSidebarMutation) {
      onMutation();
    }
  });

  // Store observer reference in session
  session.liveObserver = liveObserver;
  session.liveDebounceTimer = debounceTimer;

  // Start observing document body
  liveObserver.observe(document.body, {
    childList: true,
    subtree: true
  });

  log('Session', session.version, 'live updates enabled');
}
function bootTOC(adapter: NonNullable<ReturnType<typeof getAdapterForUrl>>, session: Session): void {
  let attempt = 0;
  const maxAttempts = 10;

  /**
   * Attempts to load TOC by extracting messages
   */
  const attemptLoad = () => {
    if (!isSessionCurrent(session)) return;
    if (session.isComplete) return;

    attempt++;
    const isLoading = attempt < maxAttempts;
    const isObserverActive = attempt < maxAttempts;
    const newSignature = refreshTOC(adapter, isLoading, isObserverActive, session);

    // If we found messages and signature changed, mark complete and transition to live updates
    if (newSignature && newSignature !== '' && newSignature !== session.lastSignature) {
      if (!isSessionCurrent(session)) return;

      session.lastSignature = newSignature;
      session.isComplete = true;

      log('Session', session.version, 'TOC loaded with', newSignature.split(',').length, 'user messages');

      // Update title now that we have messages
      updateTitle(adapter, session);

      // Resolve bookmarks and re-render TOC with bookmark indicators
      resolveAndCacheBookmarks(adapter, session).then(() => {
        if (isSessionCurrent(session)) {
          refreshTOC(adapter, false, false, session);
        }
      });

      // Clean up boot observer and retry timeout
      if (session.bootObserver) {
        session.bootObserver.disconnect();
        session.bootObserver = null;
      }
      if (session.bootRetryTimeout) {
        clearTimeout(session.bootRetryTimeout);
        session.bootRetryTimeout = null;
      }

      // Transition to live update mode
      startLiveUpdates(adapter, session);
      return;
    }

    // If we haven't exceeded max attempts, schedule next retry
    if (attempt < maxAttempts) {
      if (!isSessionCurrent(session)) return;
      session.bootRetryTimeout = setTimeout(attemptLoad, 500);
    } else {
      // Max attempts reached with no messages
      if (!isSessionCurrent(session)) return;
      log('Session', session.version, 'boot max retries exhausted - showing empty state');
      refreshTOC(adapter, false, true, session); // isObserverActive=true even after retries
    }
  };

  /**
   * Observer callback: triggers re-evaluation on any DOM mutation
   * Debounced to avoid thrashing on rapid mutations
   */
  const onMutationObserved = () => {
    if (!isSessionCurrent(session)) return;

    // Clear existing debounce timer
    if (session.bootDebounceTimer) {
      clearTimeout(session.bootDebounceTimer);
    }

    // Debounce: wait 100ms for mutations to settle before re-checking
    session.bootDebounceTimer = setTimeout(() => {
      if (!isSessionCurrent(session)) return;
      log('Session', session.version, 'DOM mutation detected, re-evaluating messages');
      attemptLoad();
    }, 100);
  };

  /**
   * MutationObserver to detect any DOM changes
   * This will trigger re-evaluation when virtualized messages appear
   */
  const bootObserver = new MutationObserver(onMutationObserved);

  session.bootObserver = bootObserver;

  // Start observing the document body for any changes
  bootObserver.observe(document.body, {
    childList: true,
    subtree: true
  });

  log('Session', session.version, 'boot started');

  // Start immediate retry loop
  attemptLoad();
}

// Start the extension
init();
