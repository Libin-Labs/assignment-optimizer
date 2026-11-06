import { optimizeAssignments, AssignmentError } from '@lp-labs/assignment-optimizer';
const api = [optimizeAssignments, AssignmentError];
void api;
const plan = optimizeAssignments(
  [{ id: 't', requires: [] }],
  [{ id: 'w', capacity: 1, skills: [] }],
);
const total: number = plan.objective;
const worker: string | undefined = plan.assignments[0]?.worker;
void total;
void worker;
// @ts-expect-error skills must be an array of strings
optimizeAssignments([], [{ id: 'bad', capacity: 1, skills: 1 }]);
