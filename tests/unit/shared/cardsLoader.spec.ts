/**
 * Cards loader tests.
 *
 * Validates that the AI Discovery Cards dataset:
 * - Loads and validates against the Zod schema
 * - Filters cards by category
 * - Searches cards by keyword
 * - Caches the dataset after first load
 */
import { describe, it, expect } from 'vitest';

import {
  loadCardsDataset,
  getCardsByCategory,
  searchCards,
} from '../../../src/shared/data/cardsLoader.js';

describe('cardsLoader', () => {
  it('loads the cards dataset successfully', async () => {
    const dataset = await loadCardsDataset();
    expect(dataset).toBeDefined();
    expect(dataset.categories).toBeInstanceOf(Array);
    expect(dataset.categories.length).toBeGreaterThan(0);
    expect(dataset.cards).toBeInstanceOf(Array);
    expect(dataset.cards.length).toBeGreaterThan(0);
  });

  it('cards have required fields', async () => {
    const dataset = await loadCardsDataset();
    for (const card of dataset.cards) {
      expect(card.cardId).toBeDefined();
      expect(card.category).toBeDefined();
      expect(card.title).toBeDefined();
      expect(card.description).toBeDefined();
      expect(card.typicalScenarios).toBeInstanceOf(Array);
      expect(card.azureServices).toBeInstanceOf(Array);
    }
  });

  it('categories are non-empty strings', async () => {
    const dataset = await loadCardsDataset();
    for (const cat of dataset.categories) {
      expect(typeof cat).toBe('string');
      expect(cat.length).toBeGreaterThan(0);
    }
  });

  it('filters cards by category', async () => {
    const dataset = await loadCardsDataset();
    const firstCategory = dataset.categories[0];
    const filtered = await getCardsByCategory(firstCategory);

    expect(filtered.length).toBeGreaterThan(0);
    expect(filtered.every((c) => c.category === firstCategory)).toBe(true);
  });

  it('returns empty array for unknown category', async () => {
    const filtered = await getCardsByCategory('NonexistentCategory123');
    expect(filtered).toEqual([]);
  });

  it('searches cards by keyword in title', async () => {
    const dataset = await loadCardsDataset();
    const firstCard = dataset.cards[0];
    // Search for a word from the first card's title
    const keyword = firstCard.title.split(' ')[0];
    const results = await searchCards(keyword);

    expect(results.length).toBeGreaterThan(0);
    expect(results.some((c) => c.cardId === firstCard.cardId)).toBe(true);
  });

  it('searches cards case-insensitively', async () => {
    const dataset = await loadCardsDataset();
    const firstCard = dataset.cards[0];
    const keyword = firstCard.title.split(' ')[0].toLowerCase();
    const results = await searchCards(keyword);

    expect(results.length).toBeGreaterThan(0);
  });

  it('returns empty for unmatched search', async () => {
    const results = await searchCards('xyzzy_nonexistent_query_99999');
    expect(results).toEqual([]);
  });

  it('caches dataset on subsequent loads', async () => {
    const first = await loadCardsDataset();
    const second = await loadCardsDataset();
    // Same object reference (cached)
    expect(first).toBe(second);
  });
});
