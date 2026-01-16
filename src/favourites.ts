import { readFile, writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';
import { randomUUID } from 'crypto';
import { parseSource } from './git.js';
import type { Favourite, FavouritesData } from './types.js';

const CONFIG_DIR = join(homedir(), '.config', 'skill');
const DATA_FILE = join(CONFIG_DIR, 'data.json');

function getDefaultData(): FavouritesData {
  return {
    version: 1,
    favourites: [],
  };
}

export async function loadFavourites(): Promise<FavouritesData> {
  try {
    const content = await readFile(DATA_FILE, 'utf-8');
    const data = JSON.parse(content) as FavouritesData;
    if (!data.version || !Array.isArray(data.favourites)) {
      return getDefaultData();
    }
    return data;
  } catch {
    return getDefaultData();
  }
}

export async function saveFavourites(data: FavouritesData): Promise<void> {
  await mkdir(CONFIG_DIR, { recursive: true });
  await writeFile(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

export function normalizeRepo(input: string): string {
  const parsed = parseSource(input);

  // Extract owner/repo from the URL
  const match = parsed.url.match(/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?$/);
  if (match) {
    return `${match[1]}/${match[2]}`;
  }

  const gitlabMatch = parsed.url.match(/gitlab\.com\/([^/]+)\/([^/]+?)(?:\.git)?$/);
  if (gitlabMatch) {
    return `gitlab:${gitlabMatch[1]}/${gitlabMatch[2]}`;
  }

  // Return the original URL if we can't normalize
  return parsed.url;
}

export async function addFavourite(repo: string, description: string, skipNormalize = false): Promise<Favourite> {
  const data = await loadFavourites();

  const favourite: Favourite = {
    id: randomUUID().slice(0, 8),
    repo: skipNormalize ? repo : normalizeRepo(repo),
    description,
    addedAt: new Date().toISOString(),
  };

  data.favourites.push(favourite);
  await saveFavourites(data);
  return favourite;
}

export async function removeFavourite(id: string): Promise<boolean> {
  const data = await loadFavourites();
  const index = data.favourites.findIndex(f => f.id === id);

  if (index === -1) {
    return false;
  }

  data.favourites.splice(index, 1);
  await saveFavourites(data);
  return true;
}

export async function getFavourites(): Promise<Favourite[]> {
  const data = await loadFavourites();
  return data.favourites;
}
