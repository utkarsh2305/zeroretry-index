/**
 * Project Types for ZeroRetry Index
 * Projects group saved items across conversations and platforms
 */

import { generateId } from './bookmarks';

/**
 * A project groups related saved items
 */
export interface Project {
  /** Unique identifier (UUID) */
  id: string;
  /** User-defined project name */
  name: string;
  /** Optional description */
  description?: string;
  /** Creation timestamp */
  createdAt: number;
  /** Last modification timestamp */
  modifiedAt: number;
}

/**
 * Creates a new project with the given name
 */
export function createProject(name: string, description?: string): Project {
  const now = Date.now();
  return {
    id: generateId(),
    name,
    description,
    createdAt: now,
    modifiedAt: now
  };
}
