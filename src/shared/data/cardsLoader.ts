import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { z } from '../../vendor/zod';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Schemas ──────────────────────────────────────────────────────────────────

const discoveryCardSchema = z.object({
  cardId: z.string(),
  category: z.string(),
  title: z.string(),
  description: z.string(),
  typicalScenarios: z.array(z.string()),
  azureServices: z.array(z.string()),
  optionalCategory: z.string().optional(),
});

const cardsDatasetSchema = z.object({
  categories: z.array(z.string()),
  cards: z.array(discoveryCardSchema),
});

// ── Types ────────────────────────────────────────────────────────────────────

export type CardCategory = string;
export type DiscoveryCardData = ReturnType<typeof discoveryCardSchema.parse>;
export type CardsDataset = ReturnType<typeof cardsDatasetSchema.parse>;

// ── Loader ───────────────────────────────────────────────────────────────────

let cachedDataset: CardsDataset | null = null;

/**
 * Load and validate the AI Discovery Cards dataset.
 * The result is cached after the first load.
 */
export async function loadCardsDataset(): Promise<CardsDataset> {
  if (cachedDataset) return cachedDataset;

  const filePath = join(__dirname, 'cards.json');
  const raw = await readFile(filePath, 'utf-8');
  const parsed = JSON.parse(raw) as unknown;
  cachedDataset = cardsDatasetSchema.parse(parsed);
  return cachedDataset;
}

/**
 * Get all cards in a specific category.
 */
export async function getCardsByCategory(category: string): Promise<DiscoveryCardData[]> {
  const dataset = await loadCardsDataset();
  return dataset.cards.filter((c: DiscoveryCardData) => c.category === category);
}

/**
 * Search cards by keyword in title, description, or typicalScenarios.
 */
export async function searchCards(query: string): Promise<DiscoveryCardData[]> {
  const dataset = await loadCardsDataset();
  const lowerQuery = query.toLowerCase();
  return dataset.cards.filter(
    (c: DiscoveryCardData) =>
      c.title.toLowerCase().includes(lowerQuery) ||
      c.description.toLowerCase().includes(lowerQuery) ||
      c.typicalScenarios.some((s: string) => s.toLowerCase().includes(lowerQuery)),
  );
}
