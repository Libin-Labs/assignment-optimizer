import test from 'node:test';
import assert from 'node:assert/strict';
import { optimizeAssignments, AssignmentError } from '../dist/esm/index.js';
test('documented workflow produces required outputs', async () => {
  const plan = optimizeAssignments(
    [
      { id: 'general', requires: [] },
      { id: 'special', requires: ['sql'] },
    ],
    [
      { id: 'expert', capacity: 1, skills: ['sql'] },
      { id: 'generalist', capacity: 1, skills: [] },
    ],
  );
  assert.equal(plan.assignments.length, 2);
  assert.equal(plan.assignments.find((item) => item.task === 'special').worker, 'expert');
  assert.equal(plan.unassigned.length, 0);
  assert.equal(plan.objective, plan.cost + plan.fairnessCost);
});
test('reroutes unconstrained work instead of losing feasible assignment', () => {
  const p = optimizeAssignments(
    [
      { id: 'a', requires: [] },
      { id: 'b', requires: ['x'] },
    ],
    [
      { id: 'expert', capacity: 1, skills: ['x'] },
      { id: 'other', capacity: 1, skills: [] },
    ],
    { fairnessWeight: 0 },
  );
  assert.equal(p.assignments.length, 2);
  assert.equal(p.assignments.find((a) => a.task === 'b').worker, 'expert');
  assert.equal(p.assignments.find((a) => a.task === 'a').worker, 'other');
});
test('preference cost and convex fairness accounting exact', () => {
  const p = optimizeAssignments(
    [
      { id: 'a', requires: [], costs: { one: 0, two: 3 } },
      { id: 'b', requires: [], costs: { one: 0, two: 3 } },
    ],
    [
      { id: 'one', capacity: 2, skills: [] },
      { id: 'two', capacity: 2, skills: [] },
    ],
    { fairnessWeight: 2 },
  );
  assert.equal(p.assignments.filter((a) => a.worker === 'one').length, 1);
  assert.equal(p.cost, 3);
  assert.equal(p.fairnessCost, 4);
  assert.equal(p.objective, 7);
});
test('existing load, full workers and missing skills explain unassigned work', () => {
  const p = optimizeAssignments(
    [
      { id: 'a', requires: ['x'] },
      { id: 'b', requires: ['missing'] },
    ],
    [{ id: 'w', capacity: 1, load: 1, skills: ['x'] }],
  );
  assert.deepEqual(p.unassigned, [
    { task: 'a', reason: 'capacity' },
    { task: 'b', reason: 'no-eligible-worker' },
  ]);
  assert.equal(p.loads[0].after, 1);
});
test('coverage takes priority over cost and empty tasks are valid', () => {
  const p = optimizeAssignments(
    [{ id: 'a', requires: [], costs: { w: 1000000 } }],
    [{ id: 'w', capacity: 1, skills: [] }],
  );
  assert.equal(p.assignments.length, 1);
  assert.equal(p.cost, 1000000);
  assert.equal(optimizeAssignments([], []).objective, 0);
});
test('malformed capacities duplicate IDs and unknown cost workers reject', () => {
  assert.throws(() => optimizeAssignments([], [{ id: 'w', capacity: 1, load: 2, skills: [] }]), {
    code: 'invalid',
  });
  assert.throws(() =>
    optimizeAssignments(
      [
        { id: 'x', requires: [] },
        { id: 'x', requires: [] },
      ],
      [],
    ),
  );
  assert.throws(() => optimizeAssignments([{ id: 'x', requires: [], costs: { unknown: 1 } }], []));
  assert.throws(() => optimizeAssignments([], [], { fairnessWeight: -1 }));
});
function exhaustive(tasks, workers, weight) {
  let bestCount = -1,
    best = Infinity;
  const loads = workers.map((w) => w.load ?? 0);
  function visit(index, count, cost) {
    if (index === tasks.length) {
      const fair = loads.reduce(
        (sum, n, j) => sum + weight * (n * n - (workers[j].load ?? 0) ** 2),
        0,
      );
      if (count > bestCount || (count === bestCount && cost + fair < best)) {
        bestCount = count;
        best = cost + fair;
      }
      return;
    }
    visit(index + 1, count, cost);
    for (let j = 0; j < workers.length; j++) {
      const w = workers[j];
      if (loads[j] >= w.capacity || !tasks[index].requires.every((s) => w.skills.includes(s)))
        continue;
      loads[j]++;
      visit(index + 1, count + 1, cost + (tasks[index].costs?.[w.id] ?? 0));
      loads[j]--;
    }
  }
  visit(0, 0, 0);
  return { count: bestCount, cost: best };
}
test('optimizer matches independent exhaustive oracle on 80 small seeded cases', () => {
  let state = 7;
  const random = (n) => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state % n;
  };
  for (let sample = 0; sample < 80; sample++) {
    const workers = Array.from({ length: 3 }, (_, j) => ({
      id: 'w' + j,
      capacity: random(3),
      load: 0,
      skills: random(2) ? ['x'] : [],
    }));
    const tasks = Array.from({ length: 5 }, (_, i) => ({
      id: 't' + i,
      requires: random(2) ? ['x'] : [],
      costs: Object.fromEntries(workers.map((w) => [w.id, random(5)])),
    }));
    const weight = random(4);
    const expected = exhaustive(tasks, workers, weight);
    const actual = optimizeAssignments(tasks, workers, { fairnessWeight: weight });
    assert.equal(actual.assignments.length, expected.count);
    assert.equal(actual.objective, expected.cost);
    for (const worker of workers)
      assert.ok(actual.assignments.filter((a) => a.worker === worker.id).length <= worker.capacity);
  }
});
test('equal inputs deterministic and returned plans detached', () => {
  const tasks = [{ id: 'a', requires: [] }];
  const workers = [{ id: 'w', capacity: 1, skills: [] }];
  const a = optimizeAssignments(tasks, workers);
  assert.deepEqual(a, optimizeAssignments(tasks, workers));
  a.loads[0].after = 9;
  assert.equal(workers[0].capacity, 1);
});
