export type AgentType = 'opencode' | 'claude-code' | 'codex' | 'cursor' | 'amp' | 'kilo' | 'roo' | 'goose' | 'antigravity';

export interface Skill {
  name: string;
  description: string;
  path: string;
  metadata?: Record<string, string>;
}

export interface AgentConfig {
  name: string;
  displayName: string;
  skillsDir: string;
  globalSkillsDir: string;
  detectInstalled: () => Promise<boolean>;
}

export interface ParsedSource {
  type: 'github' | 'gitlab' | 'git';
  url: string;
  subpath?: string;
}

export interface Favourite {
  id: string;
  repo: string;
  description: string;
  addedAt: string;
}

export interface FavouritesData {
  version: number;
  favourites: Favourite[];
}

export interface SearchSkill {
  id: string;
  name: string;
  author: string;
  description: string;
  githubUrl: string;
  skillUrl: string;
  stars: number;
  updatedAt: number;
}

export interface SearchPagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export interface SearchFilters {
  search: string;
  sortBy: string;
  marketplaceOnly: boolean;
}

export interface SearchResult {
  skills: SearchSkill[];
  pagination: SearchPagination;
  filters: SearchFilters;
}

export interface SearchResponse {
  success: boolean;
  data: SearchResult;
  meta: {
    requestId: string;
    responseTimeMs: number;
  };
}
