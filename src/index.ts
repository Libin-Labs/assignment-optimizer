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
  assignments: { task: string; worker: string; cost: number }[];
  unassigned: { task: string; reason: 'no-eligible-worker' | 'capacity' }[];
  loads: { worker: string; before: number; after: number }[];
  objective: number;
  cost: number;
  fairnessCost: number;
}
export class AssignmentError extends Error {
  constructor(
    readonly code: 'invalid' | 'limit' | 'overflow',
    message: string,
  ) {
    super(message);
    this.name = 'AssignmentError';
  }
}
interface Edge {
  to: number;
  reverse: number;
  capacity: number;
  cost: number;
}
function names(values: readonly string[]): Set<string> {
  if (
    !Array.isArray(values) ||
    values.length > 64 ||
    values.some((value) => typeof value !== 'string' || !value || value.length > 128) ||
    new Set(values).size !== values.length
  )
    throw new AssignmentError('invalid', 'Invalid skills.');
  return new Set(values);
}
export function optimizeAssignments(
  tasks: readonly AssignmentTask[],
  workers: readonly AssignmentWorker[],
  options: AssignmentOptions = {},
): AssignmentPlan {
  if (!Array.isArray(tasks) || !Array.isArray(workers) || tasks.length > 100 || workers.length > 50)
    throw new AssignmentError('limit', 'At most 100 unit tasks and 50 workers supported.');
  const fairnessWeight = options.fairnessWeight ?? 1;
  if (!Number.isSafeInteger(fairnessWeight) || fairnessWeight < 0 || fairnessWeight > 1000000)
    throw new AssignmentError('invalid', 'fairnessWeight must be an integer from 0 to 1000000.');
  const ids = new Set<string>();
  const team = workers.map((worker) => {
    if (
      !worker ||
      typeof worker.id !== 'string' ||
      !worker.id ||
      worker.id.length > 256 ||
      ids.has(worker.id) ||
      !Number.isSafeInteger(worker.capacity) ||
      worker.capacity < 0 ||
      worker.capacity > 10000 ||
      !Number.isSafeInteger(worker.load ?? 0) ||
      (worker.load ?? 0) < 0 ||
      (worker.load ?? 0) > worker.capacity
    )
      throw new AssignmentError('invalid', 'Invalid worker/duplicate ID.');
    ids.add(worker.id);
    return {
      id: worker.id,
      capacity: worker.capacity,
      load: worker.load ?? 0,
      skills: names(worker.skills),
    };
  });
  ids.clear();
  const work = tasks.map((task) => {
    if (
      !task ||
      typeof task.id !== 'string' ||
      !task.id ||
      task.id.length > 256 ||
      ids.has(task.id)
    )
      throw new AssignmentError('invalid', 'Invalid task/duplicate ID.');
    ids.add(task.id);
    const required = names(task.requires);
    const costs = new Map<string, number>();
    if (task.costs !== undefined) {
      if (
        !task.costs ||
        Object.getPrototypeOf(task.costs) !== Object.prototype ||
        Object.getOwnPropertySymbols(task.costs).length ||
        Object.keys(task.costs).length > 50
      )
        throw new AssignmentError('invalid', 'Invalid cost data.');
      for (const id of Object.keys(task.costs)) {
        const descriptor = Object.getOwnPropertyDescriptor(task.costs, id)!;
        if (
          !team.some((worker) => worker.id === id) ||
          !('value' in descriptor) ||
          !Number.isSafeInteger(descriptor.value) ||
          descriptor.value < 0 ||
          descriptor.value > 1000000
        )
          throw new AssignmentError(
            'invalid',
            'Cost must reference a known worker and be 0..1000000.',
          );
        costs.set(id, descriptor.value);
      }
    }
    return { id: task.id, required, costs };
  });
  const source = 0,
    taskStart = 1,
    workerStart = taskStart + work.length,
    sink = workerStart + team.length;
  const graph: Edge[][] = Array.from({ length: sink + 1 }, () => []);
  const add = (from: number, to: number, cost: number): Edge => {
    const forward = { to, reverse: graph[to]!.length, capacity: 1, cost };
    const backward = { to: from, reverse: graph[from]!.length, capacity: 0, cost: -cost };
    graph[from]!.push(forward);
    graph[to]!.push(backward);
    return forward;
  };
  const pairs: { task: number; worker: number; edge: Edge; cost: number }[] = [];
  const eligible = work.map(() => 0);
  work.forEach((task, i) => {
    add(source, taskStart + i, 0);
    team.forEach((worker, j) => {
      if ([...task.required].every((skill) => worker.skills.has(skill))) {
        eligible[i] = eligible[i]! + 1;
        const cost = task.costs.get(worker.id) ?? 0;
        pairs.push({ task: i, worker: j, edge: add(taskStart + i, workerStart + j, cost), cost });
      }
    });
  });
  team.forEach((worker, j) => {
    const slots = Math.min(work.length, worker.capacity - worker.load);
    for (let slot = 1; slot <= slots; slot++)
      add(workerStart + j, sink, fairnessWeight * (2 * (worker.load + slot) - 1));
  });
  let objective = 0;
  // Successive shortest augmenting paths retain reverse edges, so earlier assignments can be rerouted.
  while (true) {
    const distance = Array<number>(graph.length).fill(Infinity);
    const previous: ({ node: number; edge: number } | undefined)[] = Array.from({
      length: graph.length,
    });
    distance[source] = 0;
    for (let pass = 0; pass < graph.length - 1; pass++) {
      let changed = false;
      for (let from = 0; from < graph.length; from++) {
        if (!Number.isFinite(distance[from])) continue;
        graph[from]!.forEach((edge, index) => {
          const candidate = distance[from]! + edge.cost;
          if (edge.capacity && candidate < distance[edge.to]!) {
            distance[edge.to] = candidate;
            previous[edge.to] = { node: from, edge: index };
            changed = true;
          }
        });
      }
      if (!changed) break;
    }
    if (!Number.isFinite(distance[sink])) break;
    objective += distance[sink]!;
    if (!Number.isSafeInteger(objective))
      throw new AssignmentError('overflow', 'Objective overflow.');
    for (let node = sink; node !== source;) {
      const step = previous[node];
      if (!step) throw new AssignmentError('invalid', 'Residual path invariant failed.');
      const edge = graph[step.node]![step.edge]!;
      edge.capacity--;
      graph[node]![edge.reverse]!.capacity++;
      node = step.node;
    }
  }
  const assignments: AssignmentPlan['assignments'] = [];
  const assigned = new Set<number>();
  const counts = team.map(() => 0);
  let cost = 0;
  for (const pair of pairs)
    if (pair.edge.capacity === 0) {
      assignments.push({
        task: work[pair.task]!.id,
        worker: team[pair.worker]!.id,
        cost: pair.cost,
      });
      assigned.add(pair.task);
      counts[pair.worker] = counts[pair.worker]! + 1;
      cost += pair.cost;
    }
  const loads = team.map((worker, index) => ({
    worker: worker.id,
    before: worker.load,
    after: worker.load + counts[index]!,
  }));
  const fairnessCost = loads.reduce(
    (sum, item) => sum + fairnessWeight * (item.after ** 2 - item.before ** 2),
    0,
  );
  if (cost + fairnessCost !== objective)
    throw new AssignmentError('invalid', 'Objective accounting invariant failed.');
  return {
    assignments,
    unassigned: work.flatMap((task, index) =>
      assigned.has(index)
        ? []
        : [
            {
              task: task.id,
              reason:
                eligible[index] === 0 ? ('no-eligible-worker' as const) : ('capacity' as const),
            },
          ],
    ),
    loads,
    objective,
    cost,
    fairnessCost,
  };
}
