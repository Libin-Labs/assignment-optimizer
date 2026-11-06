import test from 'node:test';
import assert from 'node:assert/strict';
import { optimizeAssignments } from '../dist/esm/index.js';

test('fairness favors lightly loaded workers using incremental squared cost', () => {
  const plan = optimizeAssignments(
    [{ id: 'task', requires: [] }],
    [
      { id: 'busy', capacity: 10, load: 5, skills: [] },
      { id: 'idle', capacity: 10, load: 0, skills: [] },
    ],
  );
  assert.equal(plan.assignments[0].worker, 'idle');
  assert.equal(plan.fairnessCost, 1);
});

test('high preference penalties still cannot reduce maximal feasible coverage', () => {
  const plan = optimizeAssignments(
    [
      { id: 'flex', requires: [], costs: { a: 0, b: 1000000 } },
      { id: 'special', requires: ['x'], costs: { a: 1000000 } },
    ],
    [
      { id: 'a', capacity: 1, skills: ['x'] },
      { id: 'b', capacity: 1, skills: [] },
    ],
    { fairnessWeight: 0 },
  );
  assert.equal(plan.assignments.length, 2);
  assert.equal(plan.cost, 2000000);
});

test('fixed size bounds are enforced before graph allocation', () => {
  assert.throws(
    () =>
      optimizeAssignments(
        Array.from({ length: 101 }, (_, index) => ({ id: String(index), requires: [] })),
        [],
      ),
    { code: 'limit' },
  );
  assert.throws(
    () =>
      optimizeAssignments(
        [],
        Array.from({ length: 51 }, (_, index) => ({ id: String(index), capacity: 1, skills: [] })),
      ),
    { code: 'limit' },
  );
});
