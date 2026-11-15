const assert = require('node:assert/strict');
const test = require('node:test');
const { solve, summarize, matchingModel, algorithms } = require('../dist/services/matching');

function fixture() {
  return {
    groups: [
      { id: 'a', name: 'A', code: 'A', size: 2, eligible: true, gpa: 4, skills: ['SQL'] },
      { id: 'b', name: 'B', code: 'B', size: 1, eligible: true, gpa: 3, skills: [] },
      { id: 'c', name: 'C', code: 'C', size: 1, eligible: false, gpa: 4, skills: [] },
    ],
    topics: [
      { id: 'x', title: 'X', capacity: 2, supervisor_id: 'u', supervisor: 'U', skills: ['SQL'] },
      { id: 'y', title: 'Y', capacity: 2, supervisor_id: 'v', supervisor: 'V', skills: [] },
    ],
    quota: [
      { supervisor_id: 'u', students: 2, topics: 1 },
      { supervisor_id: 'v', students: 2, topics: 1 },
    ],
    wishes: [
      { group_id: 'a', topic_id: 'x', priority: 1, rank: 2, registered_at: null },
      { group_id: 'a', topic_id: 'y', priority: 2, rank: 1, registered_at: null },
      { group_id: 'b', topic_id: 'y', priority: 1, rank: 2, registered_at: null },
      { group_id: 'b', topic_id: 'x', priority: 2, rank: 1, registered_at: null },
      { group_id: 'c', topic_id: 'x', priority: 1, rank: 1, registered_at: null },
    ],
    declined: [],
  };
}
const config = (algorithm) => ({ algorithm, criteria: ['LECTURER_RANK', 'GPA', 'CODE'] });
const pairs = (result) => result.map((p) => p.group_id + p.topic_id).sort();

test('Gale–Shapley proposes from the selected side', () => {
  const input = fixture();
  assert.deepEqual(pairs(solve(input, config('GALE_SHAPLEY_GROUP'), [])), ['ax', 'by']);
  assert.deepEqual(pairs(solve(input, config('GALE_SHAPLEY_TOPIC'), [])), ['ay', 'bx']);
});

test('ranks competing applicants and measures a feasible blocking pair', () => {
  const input = fixture();
  input.wishes.find((w) => w.group_id === 'b' && w.topic_id === 'x').priority = 1;
  input.wishes.find((w) => w.group_id === 'b' && w.topic_id === 'y').priority = 2;
  const settings = config('GALE_SHAPLEY_GROUP');
  assert.deepEqual(pairs(solve(input, settings, [])), ['ay', 'bx']);
  const previous = [
    { group_id: 'a', topic_id: 'x', locked: false, manual: false },
    { group_id: 'b', topic_id: 'y', locked: false, manual: false },
  ];
  assert.equal(summarize(input, settings, previous).blocking_pairs, 1);
});

test('all algorithms respect shared supervisor quotas, group eligibility and published refusals', () => {
  const input = fixture();
  input.topics[1].supervisor_id = 'u';
  input.declined = [{ group_id: 'a', topic_id: 'x' }];
  for (const algorithm of algorithms) {
    const settings = config(algorithm);
    const result = solve(input, settings, []);
    assert.equal(result.length, 1);
    assert.ok(!pairs(result).includes('ax') && result.every((p) => p.group_id !== 'c'));
    assert.ok(matchingModel(input, settings).fits(result));
  }
});

test('exact optimization can use a second choice to accommodate another group', () => {
  const input = fixture();
  input.wishes = input.wishes.filter((w) => w.group_id !== 'b' || w.topic_id === 'x');
  input.wishes.find((w) => w.group_id === 'b').priority = 1;
  assert.deepEqual(pairs(solve(input, config('SERIAL'), [])), ['ax']);
  assert.deepEqual(pairs(solve(input, config('OPTIMAL'), [])), ['ay', 'bx']);
});
