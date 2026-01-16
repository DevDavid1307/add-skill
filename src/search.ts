import type { SearchResult, SearchResponse, SearchSkill } from './types.js';

const API_BASE = 'https://skillsmp.com/api/v1';

export function getApiToken(): string | undefined {
  return process.env.SKILLS_MP_AI;
}

export async function searchSkills(
  query: string,
  options: {
    page?: number;
    limit?: number;
    sortBy?: 'stars' | 'recent';
  } = {}
): Promise<SearchResult> {
  const token = getApiToken();

  if (!token) {
    throw new Error('SKILLS_MP_API environment variable is not set. Please set your API token.');
  }

  const params = new URLSearchParams({
    q: query,
    page: String(options.page ?? 1),
    limit: String(options.limit ?? 20),
  });

  if (options.sortBy) {
    params.set('sortBy', options.sortBy);
  }

  const response = await fetch(`${API_BASE}/skills/search?${params}`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('Invalid API token. Please check your SKILLS_MP_API environment variable.');
    }
    throw new Error(`Search API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json() as SearchResponse;

  if (!data.success) {
    throw new Error('Search failed');
  }

  return data.data;
}

export function formatStars(stars: number): string {
  if (stars >= 1000000) {
    return `${(stars / 1000000).toFixed(1)}M`;
  }
  if (stars >= 1000) {
    return `${(stars / 1000).toFixed(1)}k`;
  }
  return String(stars);
}

export function formatDate(timestamp: number): string {
  const date = new Date(timestamp * 1000);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'today';
  if (diffDays === 1) return 'yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`;
  return `${Math.floor(diffDays / 365)} years ago`;
}
