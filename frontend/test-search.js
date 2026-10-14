import assert from 'node:assert/strict';
import { getSearchRelevanceRank, filterAndRankDishes } from './src/utils/searchUtils.js';

console.log('Running Customer Search Filtering and Relevance Sorting Unit Tests...');

const sampleDishes = [
  { id: 1, name: 'Aloo Tikki Burger', category: 'Burgers' },
  { id: 2, name: 'Chicken Burger', category: 'Burgers' },
  { id: 3, name: 'mango shake', category: 'Beverages' },
  { id: 4, name: 'Oreo shake', category: 'Beverages' },
  { id: 5, name: 'Strawberry Milkshake', category: 'Beverages' },
  { id: 6, name: 'Burger', category: 'Burgers' },
  { id: 7, name: 'Burger Deluxe Combo', category: 'Burgers' },
  { id: 8, name: 'Cheeseburger', category: 'Burgers' },
  { id: 9, name: 'French Fries', category: 'Burgers' },
  { id: 10, name: 'Veg Pizza', category: 'Pizza' },
];

// Test 1: Query "s"
// Aloo Tikki Burger and Chicken Burger names do NOT contain 's'.
// "mango shake" and "Oreo shake" names DO contain 's' ("shake").
// When category is 'Burgers', 'Burgers' has 's' so it's a category-only match (Rank 5).
// "mango shake" and "Oreo shake" match by name (Rank 4), so they MUST rank higher than category-only matches!
{
  const results = filterAndRankDishes(sampleDishes, 's');
  const resultNames = results.map(d => d.name);

  // mango shake and Oreo shake must be ranked above any category-only matches like Aloo Tikki Burger
  const mangoIdx = resultNames.indexOf('mango shake');
  const oreoIdx = resultNames.indexOf('Oreo shake');
  const alooIdx = resultNames.indexOf('Aloo Tikki Burger');
  const chickenIdx = resultNames.indexOf('Chicken Burger');

  assert.ok(mangoIdx !== -1, 'mango shake should match "s"');
  assert.ok(oreoIdx !== -1, 'Oreo shake should match "s"');
  assert.ok(mangoIdx < alooIdx, 'mango shake must rank above Aloo Tikki Burger for query "s"');
  assert.ok(oreoIdx < alooIdx, 'Oreo shake must rank above Aloo Tikki Burger for query "s"');
  assert.ok(mangoIdx < chickenIdx, 'mango shake must rank above Chicken Burger for query "s"');

  // When dishes have category "Burger" (singular, no 's'):
  const singularCatDishes = [
    { id: 1, name: 'Aloo Tikki Burger', category: 'Burger' },
    { id: 2, name: 'Chicken Burger', category: 'Burger' },
    { id: 3, name: 'mango shake', category: 'Beverages' },
    { id: 4, name: 'Oreo shake', category: 'Beverages' },
  ];
  const sResults = filterAndRankDishes(singularCatDishes, 's');
  const sNames = sResults.map(d => d.name);
  assert.ok(!sNames.includes('Aloo Tikki Burger'), 'Aloo Tikki Burger should not match "s" when category has no "s"');
  assert.ok(!sNames.includes('Chicken Burger'), 'Chicken Burger should not match "s" when category has no "s"');
  assert.deepEqual(sNames, ['mango shake', 'Oreo shake'], 'Only dishes with "s" should match');
  console.log('✓ Test 1 Passed: Query "s" correctly filters and ranks shake above burger');
}

// Test 2: Query "shake"
// "mango shake" and "Oreo shake" contain "shake" as complete word (Rank 3)
// "Strawberry Milkshake" contains "shake" inside "Milkshake" (Rank 4)
{
  const results = filterAndRankDishes(sampleDishes, 'shake');
  const names = results.map(d => d.name);
  assert.ok(names.includes('mango shake'), 'mango shake should match "shake"');
  assert.ok(names.includes('Oreo shake'), 'Oreo shake should match "shake"');
  assert.ok(names.includes('Strawberry Milkshake'), 'Strawberry Milkshake should match "shake"');

  const mangoIdx = names.indexOf('mango shake');
  const oreoIdx = names.indexOf('Oreo shake');
  const milkIdx = names.indexOf('Strawberry Milkshake');

  assert.ok(mangoIdx < milkIdx, 'mango shake (word match) should rank above Strawberry Milkshake (substring match)');
  assert.ok(oreoIdx < milkIdx, 'Oreo shake (word match) should rank above Strawberry Milkshake (substring match)');
  console.log('✓ Test 2 Passed: Query "shake" ranks word matches above substring matches');
}

// Test 3: Query "mango"
// "mango shake" starts with "mango" (Rank 2)
{
  const results = filterAndRankDishes(sampleDishes, 'mango');
  assert.equal(results.length, 1);
  assert.equal(results[0].name, 'mango shake');
  assert.equal(getSearchRelevanceRank(results[0], 'mango'), 2);
  console.log('✓ Test 3 Passed: Query "mango" ranks mango shake at top with Rank 2');
}

// Test 4: Query "burger"
// Hierarchy:
// 1. "Burger" (Exact match -> Rank 1)
// 2. "Burger Deluxe Combo" (Starts with query -> Rank 2)
// 3. "Aloo Tikki Burger", "Chicken Burger" (Complete word -> Rank 3)
// 4. "Cheeseburger" (Contains elsewhere -> Rank 4)
// 5. "French Fries" (Category-only match -> Rank 5)
{
  const results = filterAndRankDishes(sampleDishes, 'burger');
  const names = results.map(d => d.name);

  assert.equal(names[0], 'Burger', 'Exact match "Burger" must rank #1');
  assert.equal(names[1], 'Burger Deluxe Combo', 'Starts-with "Burger Deluxe Combo" must rank #2');
  assert.ok(names.indexOf('Aloo Tikki Burger') < names.indexOf('Cheeseburger'), 'Complete word match ranks above substring');
  assert.ok(names.indexOf('Chicken Burger') < names.indexOf('Cheeseburger'), 'Complete word match ranks above substring');
  assert.ok(names.indexOf('Cheeseburger') < names.indexOf('French Fries'), 'Name substring ranks above category-only match');
  assert.equal(names[names.length - 1], 'French Fries', 'Category-only match ranks last');
  console.log('✓ Test 4 Passed: Query "burger" follows strict 5-tier relevance ordering');
}

// Test 5: Query "xyz123"
// No matching results
{
  const results = filterAndRankDishes(sampleDishes, 'xyz123');
  assert.equal(results.length, 0);
  console.log('✓ Test 5 Passed: Query "xyz123" returns empty array');
}

// Test 6: Empty query
// Empty string or whitespace returns empty array
{
  assert.equal(filterAndRankDishes(sampleDishes, '').length, 0);
  assert.equal(filterAndRankDishes(sampleDishes, '   ').length, 0);
  assert.equal(filterAndRankDishes(sampleDishes, null).length, 0);
  console.log('✓ Test 6 Passed: Empty query returns empty array');
}

// Test 7: Case insensitivity (Query "S" vs "s")
{
  const lowerResults = filterAndRankDishes(sampleDishes, 's');
  const upperResults = filterAndRankDishes(sampleDishes, 'S');
  assert.deepEqual(
    lowerResults.map(d => d.name),
    upperResults.map(d => d.name),
    'Query "S" and query "s" must produce identical results'
  );

  const burgerLower = filterAndRankDishes(sampleDishes, 'burger');
  const burgerUpper = filterAndRankDishes(sampleDishes, 'BURGER');
  assert.deepEqual(
    burgerLower.map(d => d.name),
    burgerUpper.map(d => d.name),
    'Query "BURGER" and query "burger" must produce identical results'
  );
  console.log('✓ Test 7 Passed: Case-insensitive queries produce identical results');
}

// Test 8: Stable sort preservation
// Dishes with identical rank should maintain their relative order from the input
{
  const input = [
    { id: 101, name: 'Alpha Burger', category: 'Burgers' },
    { id: 102, name: 'Beta Burger', category: 'Burgers' },
    { id: 103, name: 'Gamma Burger', category: 'Burgers' },
  ];
  const output = filterAndRankDishes(input, 'burger');
  assert.deepEqual(output.map(d => d.id), [101, 102, 103]);
  console.log('✓ Test 8 Passed: Stable sort maintains original order for ties');
}

console.log('\nAll 8 unit tests passed successfully!');
