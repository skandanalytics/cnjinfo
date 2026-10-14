/**
 * Search filtering and relevance sorting utilities for Foodie customer dishes.
 */

export function escapeRegex(string) {
  return String(string || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Returns relevance rank for a dish given a search query:
 * 1: Exact name match
 * 2: Name starts with query
 * 3: Name contains query as a complete word / phrase with word boundaries
 * 4: Name contains query elsewhere
 * 5: Category-only matches
 * null: No match
 */
export function getSearchRelevanceRank(dish, query) {
  const q = String(query || '').trim().toLowerCase();
  if (!q || !dish) return null;

  const name = String(dish.name || dish.title || dish.label || '').trim().toLowerCase();
  const category = String(
    (dish.category && typeof dish.category === 'object' ? dish.category.name : dish.category) ||
    dish.category_name ||
    dish.subtitle ||
    ''
  ).trim().toLowerCase();

  const nameMatches = name.includes(q);
  const categoryMatches = category.includes(q);

  if (!nameMatches && !categoryMatches) {
    return null;
  }

  // 1. Exact name match
  if (name === q) {
    return 1;
  }

  // 2. Name starts with the query
  if (name.startsWith(q)) {
    return 2;
  }

  // 3. Name contains the query as a complete word / phrase
  // Match with word boundaries: beginning of string or non-alphanumeric, query, end of string or non-alphanumeric
  const wordBoundaryRegex = new RegExp(`(^|[^a-z0-9])${escapeRegex(q)}([^a-z0-9]|$)`, 'i');
  if (wordBoundaryRegex.test(name)) {
    return 3;
  }

  // 4. Name contains the query elsewhere
  if (nameMatches) {
    return 4;
  }

  // 5. Category-only matches
  if (categoryMatches) {
    return 5;
  }

  return null;
}

/**
 * Filters and sorts dishes by search relevance using a stable sort.
 */
export function filterAndRankDishes(dishes, query) {
  const q = String(query || '').trim().toLowerCase();
  if (!q || !Array.isArray(dishes)) return [];

  const seen = new Set();
  const scored = [];

  for (let i = 0; i < dishes.length; i++) {
    const dish = dishes[i];
    if (!dish) continue;

    const rank = getSearchRelevanceRank(dish, q);
    if (rank === null) continue;

    const idKey = dish.id !== undefined && dish.id !== null ? dish.id : '';
    const nameKey = String(dish.name || dish.title || dish.label || '').trim().toLowerCase();
    const key = idKey ? `${idKey}|${nameKey}` : nameKey;

    if (seen.has(key)) continue;
    seen.add(key);

    scored.push({
      item: dish,
      rank,
      originalIndex: i,
    });
  }

  // Stable sort: by rank ascending, then original index ascending
  scored.sort((a, b) => {
    if (a.rank !== b.rank) {
      return a.rank - b.rank;
    }
    return a.originalIndex - b.originalIndex;
  });

  return scored.map((entry) => entry.item);
}

export default {
  escapeRegex,
  getSearchRelevanceRank,
  filterAndRankDishes,
};
