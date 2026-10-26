export function normalizeAnswer(value) {
  return String(value ?? '').normalize('NFKC').trim().toLocaleLowerCase('ja-JP');
}

export function checkAnswer(problem, answer) {
  if (problem.type === 'text') return problem.answers.some(item => normalizeAnswer(item) === normalizeAnswer(answer));
  if (!Array.isArray(answer)) return false;
  const selected = new Set(answer);
  return selected.size === answer.length && selected.size === problem.answers.length && problem.answers.every(item => selected.has(item));
}

export function findCombination(scenario, ids) {
  if (ids.length !== 2 || ids[0] === ids[1]) return null;
  return scenario.combinations.find(item => item.cards.length === ids.length && item.cards.every(id => ids.includes(id))) ?? null;
}

export function initialState(scenario) {
  return { version: 1, selected: scenario.problems[0].id, solved: [], branches: {}, hints: {}, combinations: [], messages: scenario.opening.map(line => ({ ...line, kind: 'dialogue' })) };
}

export function restoreState(scenario, raw) {
  try {
    const saved = JSON.parse(raw);
    if (saved.version !== 1 || !Array.isArray(saved.messages)) return initialState(scenario);
    const validIds = new Set(scenario.problems.map(p => p.id));
    const solved = [...new Set((saved.solved ?? []).filter(id => validIds.has(id)))];
    const branches = {};
    const hints = {};
    for (const p of scenario.problems) {
      if (solved.includes(p.id) && p.branches?.some(b => b.id === saved.branches?.[p.id])) branches[p.id] = saved.branches[p.id];
      const count = saved.hints?.[p.id];
      if (Number.isInteger(count) && count >= 0) hints[p.id] = Math.min(count, p.hints.length);
    }
    const messages = saved.messages.filter(m => typeof m.text === 'string' && typeof m.speaker === 'string' && ['dialogue', 'answer', 'error', 'success'].includes(m.kind) && (!m.problemId || validIds.has(m.problemId)));
    return { version: 1, selected: validIds.has(saved.selected) ? saved.selected : scenario.problems[0].id, solved, branches, hints, combinations: (saved.combinations ?? []).filter(id => scenario.combinations.some(c => c.id === id)), messages: messages.length ? messages : initialState(scenario).messages };
  } catch { return initialState(scenario); }
}

export function submitAnswer(scenario, state, answer) {
  const problem = scenario.problems.find(p => p.id === state.selected);
  if (state.solved.includes(problem.id)) return { state, status: 'already-solved' };
  if (problem.answerSlots && (typeof answer !== 'string' || Array.from(normalizeAnswer(answer)).length !== problem.answerSlots)) return { state, status: 'empty' };
  const labels = Array.isArray(answer) ? answer.map(id => problem.options.find(o => o.id === id)?.label).filter(Boolean).join('、') : String(answer ?? '').trim();
  if (!labels) return { state, status: 'empty' };
  const correct = checkAnswer(problem, answer);
  if (!correct) return { state, status: 'incorrect' };
  if (correct && problem.advanceTo) {
    return { state: { ...state, selected: problem.advanceTo, solved: [...state.solved, problem.id] }, status: 'correct' };
  }
  const messages = [...state.messages, { speaker: 'あなた', text: labels, kind: 'answer', problemId: problem.id }];
  if (correct) {
    messages.push({ speaker: 'システム', text: `問${problem.id} 正解`, kind: 'success', problemId: problem.id });
    messages.push(...problem.dialogue.map(line => ({ ...line, kind: 'dialogue', problemId: problem.id })));
  }
  return { state: { ...state, messages, solved: correct ? [...state.solved, problem.id] : state.solved }, status: correct ? 'correct' : 'incorrect' };
}

export function chooseBranch(scenario, state, problemId, branchId) {
  const branch = scenario.problems.find(p => p.id === problemId)?.branches?.find(b => b.id === branchId);
  if (!branch || !state.solved.includes(problemId) || state.branches[problemId]) return state;
  return { ...state, branches: { ...state.branches, [problemId]: branchId }, messages: [...state.messages, { speaker: 'あなた', text: branch.label, kind: 'answer', problemId }, ...branch.dialogue.map(line => ({ ...line, kind: 'dialogue', problemId }))] };
}

export function unlockedCards(scenario, state) {
  const ids = new Set(scenario.problems.filter(p => state.solved.includes(p.id)).flatMap(p => p.unlock));
  return scenario.cards.filter(c => ids.has(c.id));
}
