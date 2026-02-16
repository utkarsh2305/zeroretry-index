/**
 * Storage Layer for ZeroRetry Index
 * Provides persistence for bookmarks and saved items using chrome.storage.local
 */

import type { Bookmark, BookmarkAnchor } from './bookmarks';
import type { SavedItem } from './savedItem';
import type { Project } from './project';
import type { ChatPlatformId } from '../adapters/base';

const BOOKMARKS_KEY = 'zeroretry:bookmarks';
const SAVED_ITEMS_KEY = 'zeroretry:savedItems';
const PROJECTS_KEY = 'zeroretry:projects';
const MIGRATION_KEY = 'zeroretry:migrationVersion';

const CURRENT_MIGRATION_VERSION = 1;

/**
 * Checks if the extension context is still valid
 * Returns false if the extension was reloaded (user needs to refresh page)
 */
export function isExtensionContextValid(): boolean {
  try {
    // Check both runtime and storage APIs are available
    return !!chrome.runtime?.id && !!chrome.storage?.local;
  } catch {
    return false;
  }
}

/**
 * Wraps storage operations with context validation
 * Silently fails if context is invalidated (user needs to refresh)
 */
function handleStorageError(error: unknown, operation: string): void {
  const errorMessage = error instanceof Error ? error.message : String(error);

  if (errorMessage.includes('Extension context invalidated')) {
    // This is expected after extension reload - user needs to refresh the page
    console.warn(`[ZeroRetry Index] ${operation}: Extension was reloaded. Please refresh the page.`);
  } else {
    console.error(`[ZeroRetry Index] ${operation} failed:`, error);
  }
}

/**
 * Loads all bookmarks from storage
 */
export async function loadBookmarks(): Promise<Bookmark[]> {
  if (!isExtensionContextValid()) return [];

  try {
    const result = await chrome.storage.local.get(BOOKMARKS_KEY);
    return result[BOOKMARKS_KEY] || [];
  } catch (error) {
    handleStorageError(error, 'Load bookmarks');
    return [];
  }
}

/**
 * Saves all bookmarks to storage
 */
export async function saveBookmarks(bookmarks: Bookmark[]): Promise<void> {
  if (!isExtensionContextValid()) return;

  try {
    await chrome.storage.local.set({ [BOOKMARKS_KEY]: bookmarks });
  } catch (error) {
    handleStorageError(error, 'Save bookmarks');
  }
}

/**
 * Gets bookmarks for a specific conversation
 */
export async function getBookmarksForConversation(
  conversationKey: string
): Promise<Bookmark[]> {
  const all = await loadBookmarks();
  return all.filter(b => b.conversationKey === conversationKey);
}

/**
 * Adds a new bookmark
 */
export async function addBookmark(bookmark: Bookmark): Promise<void> {
  const all = await loadBookmarks();

  // Check for duplicates (same conversation + messageId)
  const exists = all.some(
    b => b.conversationKey === bookmark.conversationKey &&
         b.anchor.messageId === bookmark.anchor.messageId
  );

  if (!exists) {
    all.push(bookmark);
    await saveBookmarks(all);
  }
}

/**
 * Removes a bookmark by ID
 */
export async function removeBookmark(id: string): Promise<void> {
  const all = await loadBookmarks();
  await saveBookmarks(all.filter(b => b.id !== id));
}

/**
 * Updates a bookmark by ID
 */
export async function updateBookmark(
  id: string,
  updates: Partial<Omit<Bookmark, 'id'>>
): Promise<void> {
  const all = await loadBookmarks();
  const idx = all.findIndex(b => b.id === id);

  if (idx !== -1) {
    all[idx] = { ...all[idx], ...updates };
    await saveBookmarks(all);
  }
}

/**
 * Updates a bookmark's anchor (for reattachment)
 */
export async function reattachBookmark(
  id: string,
  anchor: BookmarkAnchor
): Promise<void> {
  await updateBookmark(id, { anchor });
}

/**
 * Finds a bookmark by message ID within a conversation
 */
export async function findBookmarkByMessageId(
  conversationKey: string,
  messageId: string
): Promise<Bookmark | undefined> {
  const bookmarks = await getBookmarksForConversation(conversationKey);
  return bookmarks.find(b => b.anchor.messageId === messageId);
}

/**
 * Checks if a message is bookmarked
 */
export async function isMessageBookmarked(
  conversationKey: string,
  messageId: string
): Promise<boolean> {
  const bookmark = await findBookmarkByMessageId(conversationKey, messageId);
  return bookmark !== undefined;
}

/**
 * Removes a bookmark by message ID
 */
export async function removeBookmarkByMessageId(
  conversationKey: string,
  messageId: string
): Promise<boolean> {
  const all = await loadBookmarks();
  const idx = all.findIndex(
    b => b.conversationKey === conversationKey &&
         b.anchor.messageId === messageId
  );

  if (idx !== -1) {
    all.splice(idx, 1);
    await saveBookmarks(all);
    return true;
  }

  return false;
}

// ============================================================================
// SavedItem Storage (Progressive Save System)
// ============================================================================

/**
 * Extracts platform ID from conversation key
 */
function extractPlatformFromKey(conversationKey: string): ChatPlatformId {
  const [platform] = conversationKey.split(':');
  if (['chatgpt', 'claude', 'perplexity', 'grok', 'gemini', 'copilot'].includes(platform)) {
    return platform as ChatPlatformId;
  }
  return 'chatgpt'; // Fallback
}

/**
 * Migrates a Bookmark to SavedItem format
 */
function migrateBookmarkToSavedItem(bookmark: Bookmark): SavedItem {
  return {
    ...bookmark,
    sourcePlatform: extractPlatformFromKey(bookmark.conversationKey),
    fullMessageText: bookmark.cachedText, // Best effort - only have cached text
    schemaVersion: 1
  };
}

/**
 * Performs one-time migration from bookmarks to saved items
 */
export async function runMigration(): Promise<void> {
  if (!isExtensionContextValid()) return;

  try {
    const result = await chrome.storage.local.get([MIGRATION_KEY, BOOKMARKS_KEY]);
    const currentVersion = (result[MIGRATION_KEY] as number | undefined) || 0;

    if (currentVersion >= CURRENT_MIGRATION_VERSION) {
      return; // Already migrated
    }

    const bookmarks = (result[BOOKMARKS_KEY] as Bookmark[] | undefined) || [];
    if (bookmarks.length > 0) {
      const savedItems: SavedItem[] = bookmarks.map(migrateBookmarkToSavedItem);

      await chrome.storage.local.set({
        [SAVED_ITEMS_KEY]: savedItems,
        [MIGRATION_KEY]: CURRENT_MIGRATION_VERSION
      });

      console.log(`[ZeroRetry Index] Migrated ${bookmarks.length} bookmarks to saved items`);
    } else {
      await chrome.storage.local.set({ [MIGRATION_KEY]: CURRENT_MIGRATION_VERSION });
    }
  } catch (error) {
    handleStorageError(error, 'Migration');
  }
}

/**
 * Loads all saved items from storage (for current conversation filtering)
 */
export async function loadSavedItems(): Promise<SavedItem[]> {
  if (!isExtensionContextValid()) return [];

  try {
    await runMigration(); // Ensure migration runs first
    const result = await chrome.storage.local.get(SAVED_ITEMS_KEY);
    return (result[SAVED_ITEMS_KEY] as SavedItem[] | undefined) || [];
  } catch (error) {
    handleStorageError(error, 'Load saved items');
    return [];
  }
}

/**
 * Loads ALL saved items from storage (for global view)
 * Alias for loadSavedItems() - explicitly named for clarity
 */
export const loadAllSavedItems = loadSavedItems;

/**
 * Saves all saved items to storage
 */
export async function saveSavedItems(items: SavedItem[]): Promise<void> {
  if (!isExtensionContextValid()) return;

  try {
    await chrome.storage.local.set({ [SAVED_ITEMS_KEY]: items });
  } catch (error) {
    handleStorageError(error, 'Save saved items');
  }
}

/**
 * Adds a new saved item
 */
export async function addSavedItem(item: SavedItem): Promise<void> {
  const all = await loadSavedItems();

  // Check for duplicates (same conversation + messageId)
  const exists = all.some(
    i => i.conversationKey === item.conversationKey &&
         i.anchor.messageId === item.anchor.messageId
  );

  if (!exists) {
    all.push(item);
    await saveSavedItems(all);
  }
}

/**
 * Updates a saved item by ID
 */
export async function updateSavedItem(
  id: string,
  updates: Partial<Omit<SavedItem, 'id' | 'schemaVersion'>>
): Promise<void> {
  const all = await loadSavedItems();
  const idx = all.findIndex(i => i.id === id);

  if (idx !== -1) {
    all[idx] = { ...all[idx], ...updates, modifiedAt: Date.now() };
    await saveSavedItems(all);
  }
}

/**
 * Removes a saved item by ID
 */
export async function removeSavedItem(id: string): Promise<void> {
  const all = await loadSavedItems();
  await saveSavedItems(all.filter(i => i.id !== id));
}

/**
 * Gets saved items for a specific conversation
 */
export async function getSavedItemsForConversation(
  conversationKey: string
): Promise<SavedItem[]> {
  const all = await loadSavedItems();
  return all.filter(i => i.conversationKey === conversationKey);
}

/**
 * Finds a saved item by message ID within a conversation
 */
export async function findSavedItemByMessageId(
  conversationKey: string,
  messageId: string
): Promise<SavedItem | undefined> {
  const items = await getSavedItemsForConversation(conversationKey);
  return items.find(i => i.anchor.messageId === messageId);
}

/**
 * Checks if a message is saved
 */
export async function isMessageSaved(
  conversationKey: string,
  messageId: string
): Promise<boolean> {
  const item = await findSavedItemByMessageId(conversationKey, messageId);
  return item !== undefined;
}

/**
 * Removes a saved item by message ID
 */
export async function removeSavedItemByMessageId(
  conversationKey: string,
  messageId: string
): Promise<boolean> {
  const all = await loadSavedItems();
  const idx = all.findIndex(
    i => i.conversationKey === conversationKey &&
         i.anchor.messageId === messageId
  );

  if (idx !== -1) {
    all.splice(idx, 1);
    await saveSavedItems(all);
    return true;
  }

  return false;
}

// ============================================================================
// Project Storage
// ============================================================================

/**
 * Loads all projects from storage
 */
export async function loadProjects(): Promise<Project[]> {
  if (!isExtensionContextValid()) return [];

  try {
    const result = await chrome.storage.local.get(PROJECTS_KEY);
    return (result[PROJECTS_KEY] as Project[] | undefined) || [];
  } catch (error) {
    handleStorageError(error, 'Load projects');
    return [];
  }
}

/**
 * Saves all projects to storage
 */
export async function saveProjects(projects: Project[]): Promise<void> {
  if (!isExtensionContextValid()) return;

  try {
    await chrome.storage.local.set({ [PROJECTS_KEY]: projects });
  } catch (error) {
    handleStorageError(error, 'Save projects');
  }
}

/**
 * Adds a new project
 */
export async function addProject(project: Project): Promise<void> {
  const all = await loadProjects();
  all.push(project);
  await saveProjects(all);
}

/**
 * Updates a project by ID
 */
export async function updateProject(
  id: string,
  updates: Partial<Omit<Project, 'id'>>
): Promise<void> {
  const all = await loadProjects();
  const idx = all.findIndex(p => p.id === id);

  if (idx !== -1) {
    all[idx] = { ...all[idx], ...updates, modifiedAt: Date.now() };
    await saveProjects(all);
  }
}

/**
 * Deletes a project and unassigns all its items
 */
export async function deleteProject(id: string): Promise<void> {
  // Remove the project
  const allProjects = await loadProjects();
  await saveProjects(allProjects.filter(p => p.id !== id));

  // Unassign items from this project
  const allItems = await loadSavedItems();
  let changed = false;
  allItems.forEach(item => {
    if (item.projectId === id) {
      item.projectId = undefined;
      changed = true;
    }
  });
  if (changed) {
    await saveSavedItems(allItems);
  }
}

/**
 * Assigns a saved item to a project
 * Updates both the SavedItem.projectId and the Project.itemIds array
 */
export async function assignItemToProject(
  itemId: string,
  projectId: string | undefined
): Promise<void> {
  // Get the current item to find old project
  const allItems = await loadSavedItems();
  const item = allItems.find(i => i.id === itemId);
  const oldProjectId = item?.projectId;

  // Update the SavedItem's projectId
  await updateSavedItem(itemId, { projectId } as any);

  // Update project itemIds arrays
  const allProjects = await loadProjects();

  // Remove from old project's itemIds
  if (oldProjectId) {
    const oldProj = allProjects.find(p => p.id === oldProjectId);
    if (oldProj) {
      oldProj.itemIds = (oldProj.itemIds || []).filter(id => id !== itemId);
    }
  }

  // Add to new project's itemIds
  if (projectId) {
    const newProj = allProjects.find(p => p.id === projectId);
    if (newProj) {
      newProj.itemIds = (newProj.itemIds || []).filter(id => id !== itemId); // Remove duplicates
      newProj.itemIds.push(itemId);
    }
  }

  // Save updated projects
  await saveProjects(allProjects);
}

/**
 * Gets saved items for a specific project
 */
export async function getSavedItemsForProject(
  projectId: string
): Promise<SavedItem[]> {
  const all = await loadSavedItems();
  return all.filter(i => i.projectId === projectId);
}

/**
 * Sets or clears the milestone on a saved item
 */
export async function setMilestone(
  itemId: string,
  milestone: { label: string; order: number } | undefined
): Promise<void> {
  if (!isExtensionContextValid()) return;
  try {
    await updateSavedItem(itemId, { milestone });
  } catch (err) {
    console.log('[ZeroRetry Index] setMilestone error:', err);
  }
}

/**
 * Gets all milestone-marked items for a project, sorted by order
 */
export async function getMilestonesForProject(
  projectId: string
): Promise<SavedItem[]> {
  const items = await getSavedItemsForProject(projectId);
  return items
    .filter(i => i.milestone)
    .sort((a, b) => (a.milestone!.order) - (b.milestone!.order));
}
