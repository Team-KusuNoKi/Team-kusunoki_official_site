// 保存した画面を、現在のシナリオで表示できる範囲に戻す。
export function restorePlayView(scenario, state, raw) {
  const p = scenario.problems.find(item => item.id === state.selected) ?? scenario.problems[0];
  const number = (value, max) => Number.isFinite(value) ? Math.max(0, Math.min(max, Math.floor(value))) : 0;
  const validMessage = m => m && typeof m.text === 'string' && m.text.length <= 32768
    && typeof m.speaker === 'string' && ['dialogue', 'answer', 'error', 'success'].includes(m.kind)
    && (!m.problemId || scenario.problems.some(item => item.id === m.problemId));
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    const messages = state.messages.filter(m => m.problemId === p.id && !['answer', 'success', 'error'].includes(m.kind));
    return { startView: !state.solved.length && p.id === scenario.problems[0].id,
      yoiEndView: p.completionScreen === 'yoi' && state.solved.includes(p.id), investigationView: false,
      repeatAnswer: false, composerExpanded: !state.solved.includes(p.id) && !(!state.solved.length && p.id === scenario.problems[0].id), sceneStart: state.messages.length,
      displayedMessages: messages, isPlaying: false, investigationScrollTop: 0, investigationReturnId: null,
      puzzleImageIndex: 0, chatScrollTop: 0, selectedPuzzleAnswer: '', selectedSymbols: [] };
  }
  const investigationView = Boolean(raw.investigationView) && scenario.investigation.problemIds.includes(p.id);
  const sceneStart = number(raw.sceneStart, state.messages.length);
  const scene = state.messages.slice(sceneStart).filter(m => m.problemId === p.id && !['answer', 'success', 'error'].includes(m.kind));
  const displayedMessages = Array.isArray(raw.displayedMessages) ? raw.displayedMessages.filter(validMessage).slice(0, 2000) : [];
  return {
    startView: Boolean(raw.startView) && p.id === scenario.problems[0].id,
    yoiEndView: Boolean(raw.yoiEndView) && p.completionScreen === 'yoi' && state.solved.includes(p.id),
    investigationView, repeatAnswer: Boolean(raw.repeatAnswer) && state.solved.includes(p.id),
    composerExpanded: Boolean(raw.composerExpanded) && !investigationView,
    sceneStart, displayedMessages, isPlaying: Boolean(raw.isPlaying) && scene.length > 0 && !investigationView,
    investigationScrollTop: number(raw.investigationScrollTop, 1000000),
    investigationReturnId: scenario.investigation.problemIds.includes(raw.investigationReturnId) ? raw.investigationReturnId : null,
    puzzleImageIndex: number(raw.puzzleImageIndex, Math.max(0, (p.images?.length ?? 1) - 1)),
    chatScrollTop: number(raw.chatScrollTop, 1000000),
    selectedPuzzleAnswer: p.options?.some(item => item.id === raw.selectedPuzzleAnswer) ? raw.selectedPuzzleAnswer : '',
    selectedSymbols: Array.from({ length: p.answerSlots ?? 0 }, (_, i) => p.symbolChoices?.includes(raw.selectedSymbols?.[i]) ? raw.selectedSymbols[i] : ''),
  };
}

export function pendingConversation(state, view) {
  if (!view.isPlaying) return [];
  const scene = state.messages.slice(view.sceneStart).filter(m => m.problemId === state.selected && !['answer', 'success', 'error'].includes(m.kind));
  // 表示済みの件数を超えて、次の会話へ飛ばさない。
  let shown = 0;
  while (shown < view.displayedMessages.length && shown < scene.length
    && scene[shown].text === view.displayedMessages[shown].text && scene[shown].speaker === view.displayedMessages[shown].speaker) shown++;
  return scene.slice(shown);
}
