# @lp-labs/assignment-optimizer

Exact bounded unit-task assignment maximizing coverage then minimizing preference and convex load costs.

Original independent MIT TypeScript implementation with **zero runtime or peer dependencies**. ESM/CommonJS with separate declarations; Node 18+ and compatible browser runtimes. No external code is downloaded or service started at import. TypeScript/Prettier are development-only tools.

## Install

```sh
npm install @lp-labs/assignment-optimizer
```

## Working example

```js
import assert from 'node:assert/strict';
import { optimizeAssignments, AssignmentError } from '@lp-labs/assignment-optimizer';
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
```

CommonJS: `const api = require('@lp-labs/assignment-optimizer')`. Use type-only imports for exported interfaces in TypeScript.

## Behavior, customization, limits and performance

Real successive-shortest-augmenting-path min-cost maximum-flow optimizer for UNIT tasks. It maximizes assignment count FIRST, then minimizes sum(task-worker preference cost) + fairnessWeight * sum(afterLoad² - beforeLoad²). Defaults fairnessWeight1; integer0..1,000,000. More expensive feasible work is still assigned because coverage is primary. Existing load consumes capacity. Workers <=50, tasks<=100, capacity<=10,000, skills/requires <=64 unique strings each; preference costs0..1,000,000 for known workers, omitted costs0. Eligibility requires ALL declared skills, even when remaining capacity is zero. Unassigned reason no-eligible-worker vs capacity is explicit.

This is not a heuristic greedy planner: reverse residual edges can reroute previous assignments to satisfy constrained tasks. Bellman-Ford handles reverse negative edges; at most100 unit augmentations. Input order deterministically breaks equal-cost path ties, but equal-objective assignments have no fairness guarantee beyond the declared quadratic cost. Worst-case O(tasks * vertices * residualEdges), bounded for small interactive planning, not millions of tasks. Plan is pure, detached, safe-integer objective checked; no scheduling time, indivisible multi-unit demand, legal labor rules, priority tiers, reservations, worker execution or distributed locking. Skills supplied by caller, not inferred or verified credentials. Use the complete declared workload/availability snapshot and atomically reserve separately.

## Errors and application integration

Use the exported error class and its documented code (where present); invalid structural input throws rather than silently defaulting. Await async methods and handle rejections. Trusted adapters/callbacks must meet documented ownership and isolation requirements. Hostile proxies and custom prototype objects are outside the contract; ordinary data properties are required. No runtime network/worker/database dependency is hidden behind the API. Examples use Node assertions for reproducible outcomes, not as package dependencies. The declared bounded subset is the supported functionality, not a claim of complete compatibility with another library.

## Complete API and customization contract

The public declaration below specifies all exported functions, field names, options, return shapes and error codes. Configure explicit limits and supply callbacks/adapters through these interfaces; do not modify package internals. Optional fields follow the defaults and missing-data policies above. TypeScript consumers receive this same contract through both ESM and CommonJS exports.

```ts
export interface AssignmentWorker {
  id: string;
  capacity: number;
  load?: number;
  skills: readonly string[];
}
export interface AssignmentTask {
  id: string;
  requires: readonly string[];
  costs?: Readonly<Record<string, number>>;
}
export interface AssignmentOptions {
  fairnessWeight?: number;
}
export interface AssignmentPlan {
  assignments: {
    task: string;
    worker: string;
    cost: number;
  }[];
  unassigned: {
    task: string;
    reason: 'no-eligible-worker' | 'capacity';
  }[];
  loads: {
    worker: string;
    before: number;
    after: number;
  }[];
  objective: number;
  cost: number;
  fairnessCost: number;
}
export declare class AssignmentError extends Error {
  readonly code: 'invalid' | 'limit' | 'overflow';
  constructor(code: 'invalid' | 'limit' | 'overflow', message: string);
}
export declare function optimizeAssignments(
  tasks: readonly AssignmentTask[],
  workers: readonly AssignmentWorker[],
  options?: AssignmentOptions,
): AssignmentPlan;
```

## Support

If this library is useful to you, consider supporting its maintenance with a [donation via PayPal](https://www.paypal.me/LibinPrasanth).

## Author

Created by [Libin Prasanth](https://www.linkedin.com/in/libinprasanth/). Connect on LinkedIn for updates and discussion.
