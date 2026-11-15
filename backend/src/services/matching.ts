import { fail } from '../utils/validation';

export const algorithms = [
  'GALE_SHAPLEY_GROUP',
  'GALE_SHAPLEY_TOPIC',
  'SERIAL',
  'OPTIMAL',
] as const;
export const criteria = ['LECTURER_RANK', 'GPA', 'SKILLS', 'REGISTERED_AT', 'CODE'] as const;
type Criterion = (typeof criteria)[number];
export type Config = { algorithm: (typeof algorithms)[number]; criteria: Criterion[] };
export type Pair = { group_id: string; topic_id: string; locked: boolean; manual: boolean };
export type Input = {
  groups: {
    id: string;
    name: string;
    code: string;
    size: number;
    eligible: boolean;
    gpa: number | null;
    skills: string[];
  }[];
  topics: {
    id: string;
    title: string;
    capacity: number;
    supervisor_id: string;
    supervisor: string;
    skills: string[];
  }[];
  quota: { supervisor_id: string; students: number; topics: number }[];
  wishes: {
    group_id: string;
    topic_id: string;
    priority: number;
    rank: number | null;
    registered_at: string | null;
  }[];
  declined: { group_id: string; topic_id: string }[];
};
type Group = Input['groups'][number];
type Topic = Input['topics'][number];
type Edge = { group: Group; topic: Topic; wish?: Input['wishes'][number] };
const key = (group: string, topic: string) => group + '/' + topic;
const norm = (v: string) => v.normalize('NFC').trim().toLowerCase();
const score = (edge: Edge) => {
  const skills = new Set(edge.group.skills.map(norm));
  const required = [...new Set(edge.topic.skills.map(norm).filter(Boolean))];
  return required.length ? required.filter((s) => skills.has(s)).length / required.length : 0;
};

export function matchingModel(input: Input, config: Config) {
  const groups = new Map(input.groups.map((g) => [g.id, g]));
  const topics = new Map(input.topics.map((t) => [t.id, t]));
  const quota = new Map(input.quota.map((q) => [q.supervisor_id, q]));
  const wishes = new Map(input.wishes.map((w) => [key(w.group_id, w.topic_id), w]));
  const declined = new Set(input.declined.map((w) => key(w.group_id, w.topic_id)));
  function edge(groupId: string, topicId: string): Edge | undefined {
    const group = groups.get(groupId);
    const topic = topics.get(topicId);
    if (
      !group?.eligible ||
      !topic ||
      group.size > topic.capacity ||
      declined.has(key(groupId, topicId))
    )
      return;
    const q = quota.get(topic.supervisor_id);
    if (!q || q.students < group.size || q.topics < 1) return;
    return { group, topic, wish: wishes.get(key(groupId, topicId)) };
  }
  function compare(a: Edge, b: Edge) {
    for (const criterion of config.criteria) {
      const delta = {
        LECTURER_RANK: () => (a.wish?.rank ?? 1e9) - (b.wish?.rank ?? 1e9),
        GPA: () => (b.group.gpa ?? -1) - (a.group.gpa ?? -1),
        SKILLS: () => score(b) - score(a),
        REGISTERED_AT: () =>
          (a.wish?.registered_at ?? '~').localeCompare(b.wish?.registered_at ?? '~'),
        CODE: () => a.group.code.localeCompare(b.group.code),
      }[criterion]();
      if (delta) return delta;
    }
    return (
      a.group.code.localeCompare(b.group.code) ||
      a.group.id.localeCompare(b.group.id) ||
      a.topic.id.localeCompare(b.topic.id)
    );
  }
  function fits(pairs: readonly Pair[]) {
    const usedGroups = new Set<string>();
    const usedTopics = new Set<string>();
    const used = new Map<string, { students: number; topics: number }>();
    for (const pair of pairs) {
      const candidate = edge(pair.group_id, pair.topic_id);
      if (!candidate || usedGroups.has(pair.group_id) || usedTopics.has(pair.topic_id))
        return false;
      const supervisor = candidate.topic.supervisor_id;
      const limit = quota.get(supervisor)!;
      const load = used.get(supervisor) ?? { students: 0, topics: 0 };
      load.students += candidate.group.size;
      load.topics++;
      if (load.students > limit.students || load.topics > limit.topics) return false;
      used.set(supervisor, load);
      usedGroups.add(pair.group_id);
      usedTopics.add(pair.topic_id);
    }
    return true;
  }
  const edges: Edge[] = [];
  for (const wish of input.wishes) {
    const e = edge(wish.group_id, wish.topic_id);
    if (e) edges.push(e);
  }
  const candidates = new Map<string, Edge[]>();
  const byTopic = new Map<string, Edge[]>();
  for (const e of edges) {
    if (!candidates.has(e.group.id)) candidates.set(e.group.id, []);
    if (!byTopic.has(e.topic.id)) byTopic.set(e.topic.id, []);
    candidates.get(e.group.id)!.push(e);
    byTopic.get(e.topic.id)!.push(e);
  }
  for (const choices of candidates.values())
    choices.sort((a, b) => a.wish!.priority - b.wish!.priority || compare(a, b));
  for (const applicants of byTopic.values()) applicants.sort(compare);
  return { edge, compare, fits, candidates, byTopic, edges };
}

function pair(e: Edge): Pair {
  return { group_id: e.group.id, topic_id: e.topic.id, locked: false, manual: false };
}

export function solve(input: Input, config: Config, locked: Pair[]) {
  const model = matchingModel(input, config);
  if (!model.fits(locked))
    fail('Cặp khóa không còn hợp lệ. Bỏ khóa hoặc chỉnh lại trước khi chạy.', 409);
  const groups = new Set(locked.map((p) => p.group_id));
  const topics = new Set(locked.map((p) => p.topic_id));
  const available = (e: Edge) => !groups.has(e.group.id) && !topics.has(e.topic.id);
  const options = [...model.candidates.values()]
    .filter((xs) => !groups.has(xs[0]!.group.id))
    .map((xs) => xs.filter(available))
    .filter((xs) => xs.length);
  const fits = (pairs: Pair[], e: Edge) => model.fits([...pairs, pair(e)]);
  if (config.algorithm === 'SERIAL') {
    const result = [...locked];
    const earliest = (xs: Edge[]) =>
      xs.reduce((min, e) => {
        const time = e.wish?.registered_at ?? '~';
        return time < min ? time : min;
      }, '~');
    options.sort(
      (a, b) =>
        (b[0]!.group.gpa ?? -1) - (a[0]!.group.gpa ?? -1) ||
        earliest(a).localeCompare(earliest(b)) ||
        model.compare(a[0]!, b[0]!),
    );
    for (const xs of options) {
      const choice = xs.find((e) => fits(result, e));
      if (choice) result.push(pair(choice));
    }
    return result;
  }
  if (config.algorithm === 'OPTIMAL') {
    // Exact search with both topic capacity and shared supervisor quotas.
    if (options.length > 25)
      fail(
        'Tối ưu chính xác hỗ trợ tối đa 25 nhóm có lựa chọn hợp lệ. Hãy chọn thuật toán khác.',
        409,
      );
    options.sort((a, b) => a.length - b.length || model.compare(a[0]!, b[0]!));
    let best = locked.slice();
    let bestScore = 0;
    let visits = 0;
    const suffix = options.map(() => 0);
    const utility = (e: Edge) =>
      (6 - e.wish!.priority) * 1000 +
      Math.round(900 / ((model.byTopic.get(e.topic.id)?.indexOf(e) ?? 0) + 1));
    for (let i = options.length - 1; i >= 0; i--) {
      suffix[i] = (suffix[i + 1] ?? 0) + Math.max(...options[i]!.map(utility));
    }
    const walk = (i: number, current: Pair[], total: number) => {
      if (++visits > 75000)
        fail('Bài toán vượt giới hạn tìm kiếm chính xác. Hãy chọn thuật toán khác.', 409);
      if (total + (suffix[i] ?? 0) <= bestScore) return;
      if (i === options.length) {
        best = current;
        bestScore = total;
        return;
      }
      for (const e of options[i]!)
        if (fits(current, e)) walk(i + 1, [...current, pair(e)], total + utility(e));
      walk(i + 1, current, total);
    };
    walk(0, [...locked], 0);
    return best;
  }

  if (config.algorithm === 'GALE_SHAPLEY_TOPIC') {
    const proposals = new Map(
      [...model.byTopic]
        .filter(([id]) => !topics.has(id))
        .map(([id, edges]) => [id, edges.filter(available)]),
    );
    let held: Edge[] = [];
    let progressed = true;
    while (progressed) {
      progressed = false;
      for (const [id, list] of proposals) {
        if (held.some((e) => e.topic.id === id)) continue;
        const e = list.shift();
        if (!e) continue;
        progressed = true;
        const old = held.find((h) => h.group.id === e.group.id);
        if (old && old.wish!.priority <= e.wish!.priority) continue;
        const next = held.filter((h) => h !== old);
        if (fits([...locked, ...next.map(pair)], e)) held = [...next, e];
      }
    }
    return [...locked, ...held.map(pair)];
  }
  const queue = options.map((xs) => xs.slice());
  const remaining = new Map(queue.map((xs) => [xs[0]!.group.id, xs]));
  let held: Edge[] = [];
  for (let i = 0; i < queue.length; i++) {
    const e = queue[i]!.shift();
    if (!e) continue;
    const competing = held.filter((h) => h.topic.supervisor_id === e.topic.supervisor_id);
    const next = held.filter((h) => h.topic.supervisor_id !== e.topic.supervisor_id);
    for (const h of [...competing, e].sort(model.compare)) {
      if (fits([...locked, ...next.map(pair)], h)) next.push(h);
      else {
        const choices = remaining.get(h.group.id);
        if (choices?.length) queue.push(choices);
      }
    }
    held = next;
  }
  return [...locked, ...held.map(pair)];
}

export function summarize(input: Input, config: Config, pairs: Pair[]) {
  const model = matchingModel(input, config);
  const groups = new Map(pairs.map((p) => [p.group_id, p]));
  const topics = new Map(pairs.map((p) => [p.topic_id, p]));
  const byPriority = [0, 0, 0, 0, 0];
  let outside = 0;
  let blocking = 0;
  for (const p of pairs) {
    const rank = model.edge(p.group_id, p.topic_id)?.wish?.priority;
    if (rank) byPriority[rank - 1] = (byPriority[rank - 1] ?? 0) + 1;
    else outside++;
  }
  // Count feasible one-pair deviations with locked pairs fixed.
  for (const e of model.edges) {
    const own = groups.get(e.group.id);
    const occupant = topics.get(e.topic.id);
    if (own?.locked || occupant?.locked || own?.topic_id === e.topic.id) continue;
    if (
      own &&
      (model.edge(own.group_id, own.topic_id)?.wish?.priority ?? Infinity) <= e.wish!.priority
    )
      continue;
    const incumbent = occupant && model.edge(occupant.group_id, occupant.topic_id);
    if (incumbent && model.compare(e, incumbent) >= 0) continue;
    if (model.fits([...pairs.filter((p) => p !== own && p !== occupant), pair(e)])) blocking++;
  }
  return {
    by_priority: byPriority,
    outside_wishes: outside,
    matched: pairs.length,
    blocking_pairs: config.algorithm.startsWith('GALE_SHAPLEY') ? blocking : null,
    unmatched: input.groups
      .filter((g) => !groups.has(g.id))
      .map((g) => ({
        group_id: g.id,
        reason: !g.eligible
          ? 'Nhóm chưa đủ điều kiện'
          : model.candidates.has(g.id)
            ? 'Chưa có cặp phù hợp với hạn mức và thứ hạng'
            : 'Không có nguyện vọng hợp lệ',
      })),
  };
}
