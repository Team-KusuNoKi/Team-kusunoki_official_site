import { scenario } from './scenario.js';
import { initialState, restoreState, submitAnswer, chooseBranch, unlockedCards, findCombination, canOpenProblem, investigationComplete, availableNavigationProblems } from './engine.js';
import { createConversationPlayer, latestSceneStart } from './conversation.js';
import { createPlaySaveController, normalizePlayCode } from './play-save.js';
import { restorePlayView, pendingConversation } from './save-view.js';
import { bindVisualViewport } from './viewport.js';

const app = document.querySelector('#app');
const panel = document.querySelector('#panel');
const storageKey = `webbot:${scenario.id}`;
let state = initialState(scenario);
let storageWarning = '';
let playSaves;
let gateVisible = true;
let gateBusy = false;
let gateError = '';
let gateCode = '';
let gateDigits = Array(6).fill('');
let gateInput = false;
let localRecord = null;
let legacyState = null;
let announcedCode = false;
let changingSession = false;
let saveMutationBusy = false;
let feedback = '';
let answerErrorAnimation;
let historyView = false;
let historyChatScrollTop = 0;
let historyScrollTop = 0;
let historyOpenProblems = new Set();
let selectedPuzzleAnswer = '';
let selectedSymbols = [];
let activeSymbolSlot = 0;
let puzzleImageIndex = 0;
let puzzleSwipeStart = null;
let composerExpanded = false;
let menuExpanded = false;
let problemMenuExpanded = false;
let startView = true;
let yoiEndView = false;
let investigationView = false;
let investigationScrollTop = 0;
let investigationReturnId = null;
let repeatAnswer = false;
let sceneStart = latestSceneStart(state.messages, state.selected);
let displayedMessages = [];
let isPlaying = false;
let followChat = true;
let unreadConversationCount = 0;
let chatPointerDown = false;
let chatTouchDown = false;
let chatWheelActive = false;
let chatWheelTimer;
const viewportLayout = bindVisualViewport(window, document);

const chatIsBeingHandled = () => chatPointerDown || chatTouchDown || chatWheelActive;
const chatIsAtBottom = chat => chat.scrollHeight - chat.clientHeight - chat.scrollTop <= 32;

function updateConversationNotice() {
  const notice = document.querySelector('#conversation-notice');
  if (!notice) return;
  notice.hidden = !unreadConversationCount;
  const label = `↓ 続きの会話（${unreadConversationCount}）`;
  if (notice.textContent !== label) notice.textContent = label;
}

function resumeChatFollowIfAtBottom() {
  const chat = document.querySelector('.chat-area');
  if (chat && !chatIsBeingHandled() && chatIsAtBottom(chat)) {
    followChat = true;
    unreadConversationCount = 0;
    updateConversationNotice();
  }
}

function pauseChatFollow() {
  followChat = false;
  const chat = document.querySelector('.chat-area');
  // 実行中のスムーズスクロールも現在の位置で止める。
  chat?.scrollTo({ top: chat.scrollTop, behavior: 'instant' });
}

function resetChatFollow() {
  clearTimeout(chatWheelTimer);
  chatPointerDown = chatTouchDown = chatWheelActive = false;
  followChat = true;
  unreadConversationCount = 0;
}

function bindChatScroll() {
  const chat = document.querySelector('.chat-area');
  chat.addEventListener('pointerdown', () => { chatPointerDown = true; pauseChatFollow(); }, { passive: true });
  chat.addEventListener('touchstart', () => { chatTouchDown = true; pauseChatFollow(); }, { passive: true });
  chat.addEventListener('wheel', () => {
    chatWheelActive = true;
    pauseChatFollow();
    clearTimeout(chatWheelTimer);
    chatWheelTimer = setTimeout(() => { chatWheelActive = false; resumeChatFollowIfAtBottom(); }, 180);
  }, { passive: true });
  chat.addEventListener('keydown', event => {
    if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '].includes(event.key)) pauseChatFollow();
  });
  chat.addEventListener('scroll', () => {
    resumeChatFollowIfAtBottom();
  }, { passive: true });
}

const conversationPlayer = createConversationPlayer({
  onMessage(message) {
    displayedMessages.push(message);
    save();
    const messages = document.querySelector('#messages');
    messages.insertAdjacentHTML('beforeend', messageMarkup(message));
    messages.lastElementChild.classList.add('message-enter');
    document.querySelector(`.history-screen [data-history-problem="${message.problemId}"] .history-messages`)?.insertAdjacentHTML('beforeend', messageMarkup(message));
    if (followChat && !chatIsBeingHandled()) scrollConversationToEnd();
    else {
      const chat = document.querySelector('.chat-area');
      if (!chatIsAtBottom(chat)) unreadConversationCount++;
      updateConversationNotice();
    }
  },
  onComplete() {
    isPlaying = false;
    save();
    render({ scroll: true });
    if (yoiEndView) document.querySelector('#yoi-completion-title')?.focus({ preventScroll: true });
    for (const selector of ['.answer-fab', '.branch-options', '.chapter-end', '.yoi-completion']) animateSurface(document.querySelector(selector), true, 8);
  },
});

function scrollConversationToEnd(force = false) {
  requestAnimationFrame(() => {
    if (historyView) return;
    if (!force && (!followChat || chatIsBeingHandled())) return;
    const chat = document.querySelector('.chat-area');
    if (chat && chat.scrollHeight > chat.clientHeight) {
      chat.scrollTo({ top: chat.scrollHeight - chat.clientHeight, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    }
  });
}

function conversationMessages(messages) {
  return messages.filter(message => !['answer', 'success', 'error'].includes(message.kind));
}

function playConversation(start) {
  startView = false;
  yoiEndView = false;
  resetChatFollow();
  sceneStart = start;
  displayedMessages = [];
  isPlaying = true;
  composerExpanded = false;
  menuExpanded = false;
  problemMenuExpanded = false;
  render();
  document.querySelector('.chat-area').scrollTop = 0;
  conversationPlayer.play(conversationMessages(state.messages.slice(sceneStart).filter(m => m.problemId === state.selected)));
}
const icons = {
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  chat: '<path d="M21 11.5a8.4 8.4 0 0 1-8.5 8.5H8l-5 2 1.8-5A8.5 8.5 0 1 1 21 11.5Z"/>',
  hint: '<path d="M9 18h6m-5 4h4M8 14a6 6 0 1 1 8 0l-1 2H9Z"/>',
  book: '<path d="M12 5v16M12 5C8 2 4 3 2 4v15c4-1 7 0 10 2 3-2 6-3 10-2V4c-2-1-6-2-10 1Z"/>',
  history: '<path d="M3 11a9 9 0 1 1 2 7M3 3v8h8m1-5v6l4 2"/>',
  arrow: '<path d="M5 12h14m-6-6 6 6-6 6"/>',
  send: '<path d="m3 3 19 9-19 9 4-9-4-9Zm4 9h15"/>',
  edit: '<path d="m16 5 3 3M4 20l4.2-.8L20 7.4 16.6 4 4.8 15.8 4 20Z"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  copy: '<rect x="8" y="8" width="12" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h3"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  reset: '<path d="M3 11a9 9 0 1 1 2 7M3 3v8h8"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v1"/>',
  chevron: '<path d="m6 9 6 6 6-6"/>',
  'question-circle': '<circle cx="12" cy="12" r="8"/>',
  'question-cross': '<path d="m6 6 12 12M18 6 6 18"/>',
  'question-triangle': '<path d="M12 4 21 20H3Z"/>',
  'question-square': '<rect x="4" y="4" width="16" height="16"/>',

};
const icon = name => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] ?? ''}</svg>`;
const esc = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const current = () => scenario.problems.find(p => p.id === state.selected);
const followingProblem = p => {
  if (p.standalone) return undefined;
  if (isInvestigation(p.id)) return scenario.problems.find(item => item.id === p.continueTo);
  const next = scenario.problems[scenario.problems.indexOf(p) + 1];
  return next?.standalone ? undefined : next;
};
const isInvestigation = (id = state.selected) => scenario.investigation.problemIds.includes(id);
const problemLabel = problem => problem.displayId ?? (isInvestigation(problem.id) && problem.listSymbol ? `${scenario.investigation.id} ${problem.listSymbol}` : problem.id);
const problemTitle = problem => isInvestigation(problem.id) && problem.title === problem.id ? problem.listPrompt ?? problem.prompt : problem.title;

function showInvestigation() {
  conversationPlayer.stop(); isPlaying = false;
  startView = yoiEndView = repeatAnswer = composerExpanded = menuExpanded = problemMenuExpanded = false;
  investigationView = true;
  state = { ...state, selected: scenario.investigation.id };
  displayedMessages = [];
  resetChatFollow(); save(); render();
  document.querySelector('.chat-area').scrollTop = investigationScrollTop;
  document.querySelector(`[data-action="investigation-open"][data-id="${investigationReturnId}"]`)?.focus({ preventScroll: true });
}

function openInvestigationProblem(id) {
  if (!isInvestigation(id)) return;
  if (investigationView) investigationScrollTop = document.querySelector('.chat-area').scrollTop;
  investigationReturnId = id === 'Q3.3.1' ? 'Q3.3' : id;
  composerExpanded = !state.solved.includes(id);
  selectProblem(id, { answering: !state.solved.includes(id), investigationDetail: true });
}

function questionSymbolMarkup(p) {
  const shape = { '○': 'question-circle', '✗': 'question-cross', '△': 'question-triangle', '□': 'question-square' }[p.listSymbol];
  return shape ? `<span class="question-symbol" role="img" aria-label="${esc(p.listSymbol)}">${icon(shape)}</span>` : '';
}

function problemPromptMarkup(p) {
  const text = p.promptEmphasis
    ? String(p.prompt).split(p.promptEmphasis).map(esc).join(`<strong>${esc(p.promptEmphasis)}</strong>`)
    : esc(p.prompt);
  return questionSymbolMarkup(p) + text;
}

function investigationMarkup() {
  const entries = scenario.investigation.entries.map(id => scenario.problems.find(p => p.id === id));
  const complete = p => state.solved.includes(p.id) && (!p.continueTo || state.solved.includes(p.continueTo));
  return `<div class="investigation-intro"><h1>残された謎</h1><p>気になる問いをタップして、好きな順番で考えよう。</p><p class="investigation-progress" role="status">${entries.filter(complete).length} / ${entries.length} 解答済み</p></div><div class="investigation-questions">${entries.map(p => `<button class="investigation-question" data-action="investigation-open" data-id="${esc(p.id)}"><span class="investigation-status">${complete(p) ? '✓ 解答済み' : state.solved.includes(p.id) ? '続きの謎あり' : '未解答'}</span><strong>${questionSymbolMarkup(p)}${esc(p.listPrompt)}</strong><span class="investigation-open-label">${complete(p) ? '会話を読み返す' : '考える'} ${icon('arrow')}</span></button>`).join('')}</div>`;
}

function navigationProblems() {
  if (playSaves?.getStatus().mode !== 'debug') return availableNavigationProblems(scenario, state);
  return scenario.problems.filter(p => !isInvestigation(p.id) || p.id === scenario.investigation.id);
}
const surfaceAnimations = new WeakMap();
let puzzleSubmitObserver;
let puzzleImageLoadCleanup;

function bindPuzzleSubmitLayout() {
  puzzleSubmitObserver?.disconnect();
  puzzleImageLoadCleanup?.();
  const card = document.querySelector('.start-puzzle-card');
  if (!card) return;
  const field = card.querySelector('.text-composer, .answer-choice-trigger, .symbol-slot-fields, .answer-options .option:last-of-type');
  const visual = card.querySelector('.puzzle-visual');
  const image = card.querySelector('.puzzle-diagram-image');
  if (!field || !visual || !image) return;
  let choiceClearance = 0;
  function update() {
    if (!card.isConnected) return;
    const cardRect = card.getBoundingClientRect();
    if (!cardRect.width) return;
    const fieldRect = field.getBoundingClientRect();
    const visualRect = visual.getBoundingClientRect();
    const gap = parseFloat(getComputedStyle(card).columnGap) || 0;
    if (current().id === 'N4.2') {
      // 三択は左列に保ち、③の横の送信が資料切り替えと重なる分だけ間隔を補う。
      choiceClearance = Math.max(0, visualRect.bottom + gap - (fieldRect.top - choiceClearance));
      card.style.setProperty('--choice-clearance', `${choiceClearance}px`);
      return;
    }
    // 図の下に回答欄と同じ高さの行を確保できるときだけ、送信を右列へ置く。
    const beside = image.complete && image.naturalWidth > 0 && visualRect.bottom + gap <= fieldRect.top && visualRect.width >= 80;
    if (beside) {
      card.style.setProperty('--submit-top', `${fieldRect.top - cardRect.top}px`);
      card.style.setProperty('--submit-left', `${visualRect.left - cardRect.left}px`);
      card.style.setProperty('--submit-width', `${visualRect.width}px`);
      card.style.setProperty('--submit-height', `${fieldRect.height}px`);
      card.style.setProperty('--answer-row-width', `${visualRect.right - fieldRect.left}px`);
    }
    card.classList.toggle('has-side-submit', beside);
  }
  if (typeof ResizeObserver !== 'undefined') {
    puzzleSubmitObserver = new ResizeObserver(update);
    for (const element of [card, field, visual, card.querySelector('.puzzle-card-copy')]) puzzleSubmitObserver.observe(element);
  }
  image.addEventListener('load', update);
  puzzleImageLoadCleanup = () => image.removeEventListener('load', update);
  requestAnimationFrame(update);
}

function animateSurface(element, opening, offset = 20, axis = 'Y') {
  if (!element) return Promise.resolve(false);
  const previous = surfaceAnimations.get(element);
  const currentStyle = previous ? getComputedStyle(element) : null;
  const interruptedFrame = currentStyle ? { opacity: currentStyle.opacity, transform: currentStyle.transform } : null;
  previous?.cancel();
  surfaceAnimations.delete(element);
  if (!element.animate || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return Promise.resolve(true);
  const hiddenFrame = { opacity: 0, transform: `translate${axis}(${typeof offset === 'number' ? `${offset}px` : offset})` };
  const visibleFrame = { opacity: 1, transform: `translate${axis}(0)` };
  const animation = element.animate([interruptedFrame ?? (opening ? hiddenFrame : visibleFrame), opening ? visibleFrame : hiddenFrame], {
    duration: opening ? 260 : 180, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'both',
  });
  surfaceAnimations.set(element, animation);
  return animation.finished.then(() => {
    if (surfaceAnimations.get(element) !== animation) return false;
    surfaceAnimations.delete(element);
    animation.cancel();
    return true;
  }).catch(() => false);
}

function setMenuExpanded(expanded) {
  if (expanded) setProblemMenuExpanded(false);
  if (menuExpanded === expanded) return;
  menuExpanded = expanded;
  const menu = document.querySelector('#navigation-menu');
  document.querySelector('.menu-button')?.setAttribute('aria-expanded', String(expanded));
  if (!menu) return;
  menu.hidden = false;
  menu.inert = !expanded;
  animateSurface(menu, expanded, -8).then(finished => {
    if (finished && !menuExpanded && menu.isConnected) menu.hidden = true;
  });
}

function setComposerExpanded(expanded) {
  if (composerExpanded === expanded) return;
  composerExpanded = expanded;
  save();
  if (current().answerPresentation === 'page') {
    render();
    animateSurface(document.querySelector(expanded ? '.composer-area' : '.chat-area'), true, 8);
    document.querySelector(expanded ? '.composer-area' : '.answer-fab')?.focus({ preventScroll: true });
    return;
  }
  const composer = document.querySelector('.composer-area');
  const fab = document.querySelector('.answer-fab');
  if (!composer || !fab) return;
  const focusWasInside = composer.contains(document.activeElement);
  composer.hidden = false;
  composer.inert = !expanded;
  viewportLayout.schedule();
  fab.hidden = expanded;
  fab.setAttribute('aria-expanded', String(expanded));
  animateSurface(composer, expanded).then(finished => {
    if (finished && !composerExpanded && composer.isConnected) composer.hidden = true;
  });
  if (!expanded) {
    animateSurface(fab, true, 8);
    if (focusWasInside) fab.focus({ preventScroll: true });
  }
}

function closePanel() {
  if (!panel.open || panel.classList.contains('is-closing')) return;
  const resumeSheet = panel.classList.contains('resume-sheet');
  if (resumeSheet && gateBusy) return;
  if (resumeSheet) gateInput = false;
  const returnSlot = panel.classList.contains('symbol-choice-dialog') ? activeSymbolSlot : null;
  puzzleSwipeStart = null;
  panel.classList.add('is-closing');
  panel.inert = true;
  animateSurface(panel, false, resumeSheet ? '100%' : 24).then(finished => {
    if (!finished) return;
    panel.close();
    panel.classList.remove('is-closing');
    panel.inert = false;
    if (returnSlot !== null) document.querySelector(`#symbol-slot-${returnSlot}`)?.focus({ preventScroll: true });
    if (resumeSheet && gateVisible) document.querySelector('[data-action="save-continue"]')?.focus({ preventScroll: true });
  });
}

function capturePlayView() {
  return { startView, yoiEndView, investigationView, investigationScrollTop, investigationReturnId,
    repeatAnswer, composerExpanded, sceneStart, displayedMessages: [...displayedMessages], isPlaying,
    puzzleImageIndex, chatScrollTop: historyView ? historyChatScrollTop : document.querySelector('.chat-area')?.scrollTop ?? 0,
    selectedPuzzleAnswer, selectedSymbols: [...selectedSymbols] };
}

function save() {
  if (!playSaves || gateVisible || changingSession) return;
  playSaves.update(state, capturePlayView());
}

function updateSaveStatus(status) {
  storageWarning = ['offline', 'local-only', 'conflict'].includes(status.phase) ? status.message : '';
  document.querySelectorAll('[data-save-status]').forEach(node => { node.textContent = status.message; });
  const record = playSaves?.getRecord();
  document.querySelectorAll('[data-save-code]').forEach(node => { node.textContent = record?.code ?? '発行待ち'; });
  document.querySelectorAll('[data-action="save-copy"]').forEach(node => { node.disabled = !normalizePlayCode(record?.code); });
  const debug = status.mode === 'debug';
  if (!debug && record?.code && record.creationId) {
    try { browserStorage?.setItem(`${storageKey}:migrated`, '1'); } catch {}
  }
  document.querySelector('.save-status-strip')?.classList.toggle('debug-mode', debug);
  document.querySelector('.save-status-strip')?.classList.toggle('save-warning', ['offline', 'local-only', 'conflict'].includes(status.phase));
  document.querySelector('[data-action="save-conflict"]')?.toggleAttribute('hidden', status.phase !== 'conflict');
  if (!gateVisible && !debug && record?.code && !announcedCode) {
    announcedCode = true;
    // 旧データの移行で後から番号が発行された場合も、必ず本人へ知らせる。
    if (!panel.open) openPanel('save-info', { showStartButton: startView && !state.solved.length });
  }
}

function renderEntry() {
  app.innerHTML = `<div class="shell title-shell"><main id="main" class="save-entry title-entry">
    <h1 class="sr-only">${esc(scenario.title)}</h1>
    <div class="title-art" aria-hidden="true"><img src="./assets/release-save-070da8b2b9d6/assets/title-patchwork-v3.webp" alt="" width="1024" height="1536" fetchpriority="high"></div>
    <div class="title-actions">
      <button class="primary-button full title-new" data-action="save-new" ${gateBusy ? 'disabled' : ''}>${gateBusy ? '読み込み中…' : 'はじめから'}</button>
      <button class="secondary-button full title-continue" data-action="save-continue" ${gateBusy ? 'disabled' : ''}>続きから</button>
      ${!gateInput ? `<p class="save-entry-error" role="alert">${esc(gateError)}</p>` : ''}
    </div></main></div>`;
  if (gateInput) openPanel('resume');
}

function setResumeDigits(index, raw) {
  if (gateBusy) return;
  const digits = String(raw).normalize('NFKC').replace(/[^0-9]/g, '').slice(0, 6 - index);
  if (!digits) gateDigits[index] = '';
  else [...digits].forEach((digit, offset) => { gateDigits[index + offset] = digit; });
  gateCode = gateDigits.join('');
  gateError = '';
  panel.querySelectorAll('[data-resume-digit]').forEach((input, position) => {
    input.value = gateDigits[position];
    input.setAttribute('aria-invalid', 'false');
  });
  const error = panel.querySelector('#resume-error');
  if (error) error.textContent = '';
  panel.querySelector(`#resume-digit-${Math.min(index + digits.length, 5)}`)?.focus({ preventScroll: true });
  if (gateDigits.every(digit => /^[0-9]$/.test(digit))) void beginPlay('code', gateCode);
}

function enterPlay(record) {
  conversationPlayer.stop();
  historyView = false;
  changingSession = true;
  state = restoreState(scenario, JSON.stringify(record.state));
  const view = restorePlayView(scenario, state, record.view, record.state.scenarioRevision ?? 0);
  ({ startView, yoiEndView, investigationView, investigationScrollTop, investigationReturnId,
    repeatAnswer, composerExpanded, sceneStart, displayedMessages, isPlaying, puzzleImageIndex,
    selectedPuzzleAnswer, selectedSymbols } = view);
  if (record.code !== '000000') localRecord = record;
  gateVisible = false;
  gateBusy = false;
  gateError = '';
  menuExpanded = problemMenuExpanded = false;
  selectedSymbols = [...selectedSymbols];
  feedback = '';
  resetChatFollow();
  closePanel();
  render();
  const chat = document.querySelector('.chat-area');
  if (chat) chat.scrollTop = view.chatScrollTop;
  changingSession = false;
  if (isPlaying) conversationPlayer.play(pendingConversation(state, view));
  updateSaveStatus(playSaves.getStatus());
  if (record.code && record.code !== '000000' && !announcedCode) {
    announcedCode = true;
    openPanel('save-info', { showStartButton: startView && !state.solved.length });
  }
}

async function transitionToPlay(record) {
  const cover = document.querySelector('.title-shell');
  const resumeSheet = panel.open && panel.classList.contains('resume-sheet');
  if (resumeSheet) {
    panel.classList.add('is-closing');
    panel.inert = true;
  }
  // 読み込み成功後に表紙と入力シートを退場させ、その後チャットを表示する。
  await Promise.all([
    animateSurface(cover, false, -12),
    resumeSheet ? animateSurface(panel, false, '100%') : Promise.resolve(),
  ]);
  if (resumeSheet) {
    panel.close();
    panel.classList.remove('is-closing');
    panel.inert = false;
  }
  gateInput = false;
  enterPlay(record);
  await animateSurface(document.querySelector('.shell'), true, 12);
  viewportLayout.update();
}

async function beginPlay(kind, code = '') {
  if (gateBusy) return;
  gateBusy = true;
  gateError = '';
  renderEntry();
  try {
    let record;
    if (kind === 'continue') {
      record = playSaves.getRecord() ?? playSaves.readLocal();
      if (!record && legacyState) record = playSaves.adoptLegacy(legacyState, restorePlayView(scenario, legacyState, null));
      if (!record) throw new Error('このブラウザには保存された記録がありません。');
      if (record.code && !record.pending) {
        try { record = await playSaves.loadCode(record.code); }
        catch (error) { if (error.status && error.status < 500 && error.status !== 429) throw error; }
      }
      announcedCode = Boolean(record.code);
    } else if (kind === 'code') {
      const normalized = normalizePlayCode(code);
      if (!normalized) throw new Error('数字6桁の再開番号を入力してください。');
      record = normalized === '000000'
        ? playSaves.enterDebug(initialState(scenario), restorePlayView(scenario, initialState(scenario), null))
        : await playSaves.loadCode(normalized);
      announcedCode = true;
    } else {
      record = await playSaves.startNew(initialState(scenario), restorePlayView(scenario, initialState(scenario), null));
      announcedCode = false;
    }
    if (!record) throw new Error('再開番号が見つかりません。');
    await transitionToPlay(record);
    if (kind === 'continue') void playSaves.retry();
  } catch (error) {
    gateBusy = false;
    gateError = error.message || '読み込めませんでした。通信を確認して、もう一度お試しください。';
    if (gateVisible) renderEntry();
    else openPanel('save-info');
  }
}

function messageMarkup(m) {
  // 保存済みの案内にも、現行の注意書きと赤字指定を適用する。
  if (m.problemId === 'N5' && m.kind === 'dialogue' && m.text.startsWith('伝達：以上で、構内での周遊、滞在が必須な部分は終了となります。')) {
    m = { ...m, ...scenario.problems.find(p => p.id === 'N5').dialogue.find(line => line.warningText) };
  }
  const text = esc(m.text);
  const formattedText = m.warningText ? text.replace(esc(m.warningText), `<strong class="message-warning">${esc(m.warningText)}</strong>`) : text;
  if (m.kind === 'success') return `<div class="milestone">${icon('check')}<span>${esc(m.text)}</span></div>`;
  if (!m.speaker) return `<p class="narration">${m.emphasis ? `<strong>${formattedText}</strong>` : formattedText}</p>`;
  const own = m.kind === 'answer';
  const portrait = scenario.portraits?.[m.speaker];
  const rightSide = m.speaker === 'タツ';
  const avatar = portrait
    ? `<div class="character-speaker"><span class="avatar character-avatar" aria-hidden="true"><img src="${esc(portrait)}" alt="" width="56" height="70"></span><span class="character-name">${esc(m.speaker)}</span></div>`
    : `<span class="avatar" aria-hidden="true">${esc(Array.from(m.speaker)[0])}</span>`;
  return `<article class="message ${own ? 'own' : ''} ${m.kind === 'error' ? 'retry' : ''} ${portrait ? 'has-character' : ''} ${rightSide ? 'character-right' : ''}">${own || rightSide ? '' : avatar}<div class="message-body">${portrait ? '' : `<span class="speaker">${esc(m.speaker)}</span>`}<div class="bubble">${formattedText}</div></div>${rightSide ? avatar : ''}</article>`;
}

function answerChoiceMarkup(option) {
  return `<span class="answer-number">${esc(option.label.normalize('NFKC'))}</span>`;
}

function symbolSlotButtonsMarkup(p, picker = false) {
  return Array.from({ length: p.answerSlots }, (_, index) => {
    const value = selectedSymbols[index] ?? '';
    return `<button id="${picker ? 'picker-' : ''}symbol-slot-${index}" type="button" class="symbol-slot-button" data-action="symbol-slot" data-index="${index}" data-filled="${Boolean(value)}" aria-label="${index + 1}文字目を選択：${esc(value || '未選択')}" aria-haspopup="dialog" aria-controls="panel"${picker ? ` aria-pressed="${index === activeSymbolSlot}"` : ''}>${esc(value || '—')}</button>`;
  }).join('');
}

function answerSelectMarkup(choices, id, placeholder) {
  const options = choices.map(choice => typeof choice === 'string' ? { id: choice, label: choice } : choice);
  return `<span class="text-composer select-composer"><select id="${esc(id)}" name="answer" required><option value="" disabled selected>${esc(placeholder)}</option>${options.map(option => `<option value="${esc(option.id)}">${esc(option.label)}</option>`).join('')}</select>${icon('chevron')}</span>`;
}

function answerFormMarkup(p) {
  return `<div class="answer-entry-label">回答欄</div>${answerInputsMarkup(p)}`;
}

function answerInputsMarkup(p) {
  const label = `${problemLabel(p)}の回答`;
  if (p.type === 'fields') {
    const inputs = p.fields.map((field, index) => field.answerChoices
      ? `<label class="answer-field"><span class="${p.answerParts ? 'sr-only' : 'answer-field-label'}">${esc(field.label)}</span>${answerSelectMarkup(field.answerChoices, `answer${index ? `-${index}` : ''}`, field.placeholder ?? '選択…')}</label>`
      : field.options
      ? `<fieldset class="answer-options answer-options-two-columns"><legend class="answer-field-label">${esc(field.label)}</legend>${field.options.map((option, optionIndex) => `<label class="option"><input id="answer-${index}-option-${optionIndex}" name="answer" type="radio" value="${esc(option.id)}" required><span>${esc(option.label)}</span></label>`).join('')}</fieldset>`
      : `<label class="answer-field"><span class="${p.answerParts ? 'sr-only' : 'answer-field-label'}">${esc(field.label)}</span><span class="text-composer"><input id="answer${index ? `-${index}` : ''}" name="answer" type="text" inputmode="${esc(field.inputMode ?? 'text')}" placeholder="${esc(field.placeholder)}" autocomplete="off" required></span></label>`);
    const fields = p.answerParts ? p.answerParts.map((part, index) => `${esc(part)}${inputs[index] ?? ''}`).join('') : inputs.join('');
    return `<form id="answer-form" class="multi-field-answer"><div class="answer-fields${p.answerParts ? ' answer-fields-inline' : ''}" role="group" aria-label="${esc(label)}">${fields}</div><button type="submit" class="primary-button">${icon('send')}<span>送信</span></button></form>`;
  }
  if (p.answerSlots) {
    const complete = selectedSymbols.length === p.answerSlots && selectedSymbols.every(Boolean);
    return `<form id="answer-form" class="puzzle-symbol-answer"><input id="answer" name="answer" type="hidden" value="${esc(selectedSymbols.join(''))}"><div class="symbol-slot-fields" role="group" aria-label="${esc(label)}・${p.answerSlots}文字">${symbolSlotButtonsMarkup(p)}</div><button type="submit" class="primary-button" ${complete ? '' : 'disabled'}>${icon('send')}<span>送信</span></button></form>`;
  }
  if (p.id === 'N1') {
    const selected = p.options.find(option => option.id === selectedPuzzleAnswer);
    return `<form id="answer-form" class="puzzle-card-answer"><label class="sr-only" for="answer-choice-trigger">答えを選択</label><input id="answer" name="answer" type="hidden" value="${esc(selected?.id ?? '')}"><button id="answer-choice-trigger" type="button" class="answer-choice-trigger" data-action="answer-choices" aria-haspopup="dialog" aria-controls="panel"><span id="answer-choice-label">${selected ? answerChoiceMarkup(selected) : '番号を選択'}</span>${icon('chevron')}</button><button type="submit" class="primary-button">${icon('send')}<span>送信</span></button></form>`;
  }
  if (p.answerChoices || p.answerControl === 'select') {
    return `<form id="answer-form" class="puzzle-text-answer"><label class="${p.answerLabel ? 'answer-field-label' : 'sr-only'}" for="answer">${esc(p.answerLabel ?? label)}</label>${answerSelectMarkup(p.answerChoices ?? p.options, 'answer', p.answerPlaceholder ?? '場所を選択…')}<button type="submit" class="primary-button">${icon('send')}<span>送信</span></button></form>`;
  }
  if (p.type === 'text') {
    if (p.diagram) return `<form id="answer-form" class="puzzle-text-answer"><label class="${p.answerLabel ? 'answer-field-label' : 'sr-only'}" for="answer">${esc(p.answerLabel ?? label)}</label><div class="text-composer"><input id="answer" name="answer" type="text" inputmode="${esc(p.inputMode ?? 'text')}" placeholder="${esc(p.placeholder)}" autocomplete="off" required></div><button type="submit" class="primary-button">${icon('send')}<span>送信</span></button></form>`;
    return `<form id="answer-form"${p.image ? ' class="puzzle-text-answer"' : ''}><label class="sr-only" for="answer">${esc(label)}</label><div class="text-composer"><input id="answer" name="answer" type="text" inputmode="${esc(p.inputMode ?? 'text')}" placeholder="${esc(p.placeholder)}" autocomplete="off" required><button type="submit" class="send-button" aria-label="答えを送信">${icon('send')}<span>送信</span></button></div></form>`;
  }
  return `<form id="answer-form"><fieldset class="answer-options${p.optionColumns === 2 ? ' answer-options-two-columns' : ''}"><legend class="${p.answerLabel ? 'answer-field-label' : 'sr-only'}">${esc(p.answerLabel ?? label)}</legend>${p.options.map(o => `<label class="option"><input id="${o.id}" type="${p.type === 'single' ? 'radio' : 'checkbox'}" name="answer" value="${esc(o.id)}" ${p.type === 'single' ? 'required' : ''}><span>${esc(o.label)}</span></label>`).join('')}<button type="submit" class="primary-button">${icon('send')}<span>送信</span></button></fieldset></form>`;
}

function problemNavigationMarkup() {
  const label = yoiEndView ? '宵 終了' : startView ? 'スタート' : investigationView ? scenario.investigation.id : problemLabel(current());
  return `<button class="problem-toggle" data-action="toggle-problems" aria-label="問題番号を選択：${esc(label)}" aria-expanded="${problemMenuExpanded}" aria-controls="problem-menu"><span>問題番号 <strong>${esc(label)}</strong></span>${icon('chevron')}</button><nav id="problem-menu" class="problem-menu" aria-label="問題番号" ${problemMenuExpanded ? '' : 'hidden'}><button data-action="start" ${startView ? 'aria-current="step"' : ''}><span>スタート</span></button>${navigationProblems().map(p => `<button data-action="select" data-id="${esc(p.id)}" ${canOpenProblem(p, state) ? '' : 'disabled'} ${!startView && !yoiEndView && (p.id === state.selected || isInvestigation(state.selected) && p.id === scenario.investigation.id) ? 'aria-current="step"' : ''} aria-label="${esc(p.id)}${(p.id === scenario.investigation.id ? investigationComplete(scenario, state) : state.solved.includes(p.id)) ? ' 解答済み' : ''}"><span>${esc(p.id)}</span>${(p.id === scenario.investigation.id ? investigationComplete(scenario, state) : state.solved.includes(p.id)) ? icon('check') : ''}</button>${p.completionScreen === 'yoi' && state.solved.includes(p.id) ? `<button data-action="yoi-end" ${yoiEndView ? 'aria-current="step"' : ''}><span>宵 終了</span></button>` : ''}`).join('')}</nav>`;
}

function alignCurrentProblem(menu = document.querySelector('#problem-menu')) {
  const active = menu?.querySelector?.('[aria-current="step"]');
  if (!active || !menu.clientHeight) return;
  const alignFrom = scenario.problems.findIndex(p => p.id === 'N4.2');
  const currentIndex = scenario.problems.findIndex(p => p.id === state.selected);
  if (startView || currentIndex < alignFrom) {
    menu.style.setProperty('--problem-menu-tail', '0px');
    menu.scrollTop = 0;
    return;
  }
  const style = getComputedStyle(menu);
  const paddingTop = parseFloat(style.paddingTop) || 0;
  const paddingBottom = parseFloat(style.paddingBottom) || 0;
  // N4.2以降は現在の問題を上端へ揃える。序盤は余白を足さず下端から表示する。
  menu.style.setProperty('--problem-menu-tail', `${Math.max(0, menu.clientHeight - paddingTop - paddingBottom - active.getBoundingClientRect().height)}px`);
  const offset = active.getBoundingClientRect().top - menu.getBoundingClientRect().top - paddingTop;
  menu.scrollTop += offset;
}

function updateProblemNavigation() {
  const navigation = document.querySelector('#problem-navigation');
  if (navigation) navigation.innerHTML = problemNavigationMarkup();
  if (problemMenuExpanded) alignCurrentProblem();
}

function setProblemMenuExpanded(expanded) {
  if (problemMenuExpanded === expanded) return;
  problemMenuExpanded = expanded;
  if (expanded) setMenuExpanded(false);
  const menu = document.querySelector('#problem-menu');
  document.querySelector('.problem-toggle')?.setAttribute('aria-expanded', String(expanded));
  if (!menu) return;
  menu.hidden = false;
  menu.inert = !expanded;
  if (expanded) alignCurrentProblem(menu);
  animateSurface(menu, expanded, -8).then(finished => {
    if (finished && !problemMenuExpanded && menu.isConnected) menu.hidden = true;
  });
  if (expanded) document.querySelector('.problem-toggle')?.focus({ preventScroll: true });
}

function composerContentMarkup(p) {
  const heading = p.answerPresentation === 'page'
    ? `<div class="answer-composer-heading"><h2>${esc(problemLabel(p))}</h2></div>`
    : `<div class="answer-composer-heading"><h2>${esc(problemLabel(p))}</h2><button class="composer-close" data-action="close-composer" aria-label="回答エリアを閉じる">${icon('close')}</button></div>`;
  if (p.type === 'pending') return `${heading}<div class="answer-problem"><p>${esc(p.prompt)}</p></div>`;
  const content = p.image ? puzzleCardMarkup(p) : `<div class="answer-problem"><p>${problemPromptMarkup(p)}</p>${p.answerTemplate ? `<p class="answer-template">${esc(p.answerTemplate)}</p>` : ''}${p.wordBank ? `<div class="word-bank"><span>語群</span><p>${p.wordBank.map(esc).join('、')}</p></div>` : ''}</div>
    ${answerFormMarkup(p)}
    ${['text', 'fields'].includes(p.type) ? '' : `<div class="composer-meta"><span>${p.type === 'multiple' ? p.selectionCount ? `${p.selectionCount}つ選んでください。` : '当てはまるものをすべて選んでください。' : 'ひとつ選んでください。'}</span></div>`}`;
  return `${heading}${content}<div id="answer-error" class="sr-only" role="status"></div><div class="feedback" role="status">${esc(feedback || storageWarning)}</div>`;
}

function puzzleTextMarkup(text) {
  return String(text).split('{blank}').map(esc).join('<span class="puzzle-blank">？</span>');
}

function puzzleImages(p = current()) {
  return p.images ?? (p.diagram || p.image ? [{ src: p.diagram ?? p.image, alt: p.diagramAlt ?? p.imageAlt ?? `${problemLabel(p)}の問題図` }] : []);
}

function puzzlePageButtonsMarkup(p = current()) {
  return puzzleImages(p).map((_, index) => `<button type="button" data-action="puzzle-page" data-index="${index}" aria-label="資料${index + 1}を表示" aria-pressed="${index === puzzleImageIndex}"><span>${index + 1}</span></button>`).join('');
}

function puzzlePagesMarkup(p = current()) {
  return puzzleImages(p).length > 1 ? `<nav class="puzzle-gallery-pages" aria-label="問題資料の切り替え">${puzzlePageButtonsMarkup(p)}</nav>` : '';
}

function puzzleVisualMarkup(p) {
  const image = puzzleImages(p)[puzzleImageIndex] ?? puzzleImages(p)[0];
  return `<button class="puzzle-preview" data-action="puzzle-image" aria-label="${esc(problemLabel(p))}の図を拡大表示">
    <img class="puzzle-diagram-image" src="${esc(image.src)}" alt="${esc(image.alt)}">
  </button>${puzzlePagesMarkup(p)}`;
}

function setPuzzleImage(index) {
  const p = current();
  const images = puzzleImages(p);
  if (!Number.isInteger(index) || index < 0 || index >= images.length || index === puzzleImageIndex) return;
  const pageHadFocus = document.activeElement?.dataset?.action === 'puzzle-page';
  const direction = index > puzzleImageIndex ? 1 : -1;
  puzzleImageIndex = index;
  const visual = document.querySelector('.puzzle-visual');
  if (visual) {
    visual.innerHTML = puzzleVisualMarkup(p);
    bindPuzzleSubmitLayout();
    animatePuzzleImage(visual.querySelector('.puzzle-diagram-image'), direction);
  }
  if (panel.open && panel.classList.contains('image-viewer')) {
    const image = panel.querySelector('.puzzle-full-image');
    if (image) { image.src = images[index].src; image.alt = images[index].alt; animatePuzzleImage(image, direction); }
    const pages = panel.querySelector('.puzzle-gallery-pages');
    if (pages) pages.innerHTML = puzzlePageButtonsMarkup(p);
  }
  save();
  if (pageHadFocus) (panel.open ? panel : visual)?.querySelector(`[data-action="puzzle-page"][data-index="${index}"]`)?.focus({ preventScroll: true });
}

// 読み込み前の空画像を動かさず、連続切り替えでは最後に選んだ資料だけを表示する。
const puzzleImageReveals = new WeakMap();
function animatePuzzleImage(image, direction) {
  if (!image) return;
  const previous = puzzleImageReveals.get(image);
  if (previous) image.removeEventListener('load', previous);
  surfaceAnimations.get(image)?.cancel();
  surfaceAnimations.delete(image);
  const reveal = () => {
    image.removeEventListener('load', reveal);
    puzzleImageReveals.delete(image);
    if (image.isConnected && image.naturalWidth > 0) animateSurface(image, true, direction * 12, 'X');
  };
  if (image.complete) reveal();
  else if (image.addEventListener) {
    puzzleImageReveals.set(image, reveal);
    image.addEventListener('load', reveal, { once: true });
  }
}

function puzzleCopyMarkup(p) {
  const prompt = `<h2>${p.cardQuestionIcon ? `<img class="puzzle-question-icon" src="${esc(p.cardQuestionIcon)}" alt="${esc(p.cardQuestionIconAlt)}" width="54" height="83">` : ''}${puzzleTextMarkup(p.cardHeading ?? p.prompt)}</h2>
      ${p.cardInstruction ? `<p class="puzzle-card-instruction">${puzzleTextMarkup(p.cardInstruction)}</p>` : ''}
      ${p.cardDestination ? `<p class="puzzle-card-destination">${puzzleTextMarkup(p.cardDestination)}</p>` : ''}`;
  return `${prompt}${answerFormMarkup(p)}`;
}

function puzzleCardMarkup(p) {
  return `<article class="start-puzzle-card" data-problem-id="${esc(p.id)}" aria-label="${esc(problemLabel(p))}の問題カード">
    <div class="puzzle-card-copy">${puzzleCopyMarkup(p)}</div>
    <div class="puzzle-visual">
      ${puzzleVisualMarkup(p)}
    </div>
  </article>`;
}

function yoiCompletionMarkup() {
  return `<section class="yoi-completion" aria-labelledby="yoi-completion-title">
    <div class="yoi-completion-copy"><p class="yoi-completion-label">11月の救祭</p><h1 id="yoi-completion-title" tabindex="-1">宵</h1><p class="yoi-completion-end">終幕</p><p>「11月の救祭 宵」はここで終了です。<br>遊んでいただき、ありがとうございました。</p><p>冊子後半「11月の救祭 冥」をご購入の方は続きを会場または自宅でお楽しみいただけます</p></div>
    <div class="yoi-completion-actions" role="group" aria-label="続きの遊び方">
      <button class="primary-button yoi-venue-button" data-action="continue-at-venue"><span>会場で続きを解く</span>${icon('arrow')}</button>
      <button class="secondary-button yoi-online-button" disabled aria-describedby="yoi-online-status"><span>オンライン版を利用して自宅で解く</span></button><p id="yoi-online-status">オンライン版は準備中です。</p>
    </div>
    ${storageWarning ? `<p class="feedback" role="status">${esc(storageWarning)}</p>` : ''}
  </section>`;
}

function historyProblems() {
  return scenario.problems.filter(item => state.solved.includes(item.id) && !item.advanceTo).reverse();
}

function historyScreenMarkup() {
  const visibleMessages = isPlaying ? [...state.messages.slice(0, sceneStart), ...displayedMessages] : state.messages;
  const entries = historyProblems().map(item =>
    `<details class="history-entry" data-history-problem="${esc(item.id)}" ${historyOpenProblems.has(item.id) ? 'open' : ''}><summary><span class="history-question">${esc(problemLabel(item))}</span><span class="history-title">${esc(problemTitle(item))}</span>${icon('chevron')}</summary><div class="history-messages">${visibleMessages.filter(m => m.problemId === item.id && !['error', 'answer', 'success'].includes(m.kind)).map(messageMarkup).join('')}</div></details>`).join('');
  return `<section class="history-screen" aria-labelledby="history-heading"><header class="history-header"><button class="history-back" data-action="history-back" aria-label="トークに戻る">${icon('arrow')}<span>トーク</span></button><h1 id="history-heading" tabindex="-1">会話履歴</h1></header><div class="history-body"><p class="history-intro">問題を開くと、これまでの会話を読み返せます。</p>${entries || '<div class="history-empty"><p>まだ会話履歴はありません。</p><p>問題に正解すると、ここに会話が届きます。</p></div>'}</div></section>`;
}

function openHistoryScreen() {
  if (historyView) return;
  closePanel();
  setMenuExpanded(false);
  setProblemMenuExpanded(false);
  historyChatScrollTop = document.querySelector('.chat-area')?.scrollTop ?? 0;
  historyScrollTop = 0;
  const entries = historyProblems();
  historyOpenProblems = new Set(entries.length ? [entries[0].id] : []);
  historyView = true;
  const workspace = document.querySelector('.workspace');
  workspace?.classList.add('history-is-open');
  workspace?.insertAdjacentHTML('beforeend', historyScreenMarkup());
  animateSurface(document.querySelector('.history-screen'), true, 12, 'X');
  document.querySelector('#history-heading')?.focus({ preventScroll: true });
}

function closeHistoryScreen() {
  historyView = false;
  document.querySelector('.history-screen')?.remove();
  document.querySelector('.workspace')?.classList.remove('history-is-open');
  const chat = document.querySelector('.chat-area');
  if (chat) chat.scrollTop = historyChatScrollTop;
  document.querySelector('.menu-button')?.focus({ preventScroll: true });
}

document.addEventListener('toggle', event => {
  const id = event.target.dataset?.historyProblem;
  if (!id) return;
  if (event.target.open) historyOpenProblems.add(id);
  else historyOpenProblems.delete(id);
}, true);

function render({ scroll = false } = {}) {
  if (gateVisible) { renderEntry(); return; }
  if (historyView) historyScrollTop = document.querySelector('.history-body')?.scrollTop ?? historyScrollTop;
  const chatScrollTop = document.querySelector('.chat-area')?.scrollTop ?? 0;
  const p = current();
  const solved = state.solved.includes(p.id);
  const inInvestigation = !startView && !investigationView && isInvestigation();
  const investigationReturnVisible = inInvestigation && solved && !isPlaying && !repeatAnswer;
  const nextProblem = followingProblem(p);
  const answerTarget = !startView && !repeatAnswer && solved ? nextProblem ?? p : p;
  const sectionFinished = solved && !nextProblem && !startView && !repeatAnswer;
  const completionPending = p.completionScreen === 'yoi' && solved && !isPlaying && !startView && !repeatAnswer && !yoiEndView;
  const composerVisible = !investigationView && !yoiEndView && (!solved || startView || repeatAnswer) && !isPlaying && composerExpanded;
  const answerPageVisible = p.answerPresentation === 'page' && composerVisible;
  const branchPending = solved && !isPlaying && !startView && p.branches && !state.branches[p.id];
  app.innerHTML = `<div class="shell">
    <main id="main" class="workspace${p.chapter === '第二章' ? ' chapter-mei' : ''}${historyView ? ' history-is-open' : ''}">
      <header class="topbar"><div class="brand"><div class="navigation-menu"><button class="menu-button" data-action="toggle-menu" aria-label="メニュー" aria-controls="navigation-menu" aria-expanded="${menuExpanded}">${icon('menu')}</button><nav id="navigation-menu" class="menu-items" ${menuExpanded ? '' : 'hidden'} aria-label="メインメニュー"><button class="active" data-action="chat" aria-current="page">${icon('chat')}<span>トーク</span></button><button data-action="hints">${icon('hint')}<span>ヒント</span></button><button data-action="notebook">${icon('book')}<span>ノート</span>${unlockedCards(scenario, state).length ? `<small class="nav-badge">${unlockedCards(scenario, state).length}</small>` : ''}</button><button data-action="history">${icon('history')}<span>履歴</span></button><button data-action="save-info">${icon('info')}<span>進行を保存</span></button><button data-action="help">${icon('info')}<span>使い方</span></button></nav></div><span class="brand-title">${esc(scenario.title)}</span></div><button class="hint-button" data-action="hints" aria-label="ヒント">${icon('hint')}<span>ヒント</span></button><div id="problem-navigation" class="problem-navigation">${problemNavigationMarkup()}</div></header>
      ${playSaves?.getStatus().mode === 'debug' ? '' : `<div class="save-status-strip${['offline', 'local-only', 'conflict'].includes(playSaves?.getStatus().phase) ? ' save-warning' : ''}"><span data-save-status>${esc(playSaves?.getStatus().message ?? '')}</span><button data-action="save-conflict" ${playSaves?.getStatus().phase === 'conflict' ? '' : 'hidden'}>保存を確認</button></div>`}
      ${yoiEndView ? yoiCompletionMarkup() : ''}
      ${p.type === 'pending' ? `<section class="q4-pending"><h1>${esc(p.title)}</h1><p>${esc(p.prompt)}</p><button class="primary-button" data-action="investigation-back">問題一覧へ戻る</button></section>` : ''}
      ${inInvestigation && !investigationReturnVisible ? '<button class="investigation-back" data-action="investigation-back">← 問題一覧へ</button>' : ''}
      <section class="chat-area${investigationView ? ' investigation-hub' : ''}${inInvestigation ? ' investigation-detail' : ''}" aria-label="${investigationView ? '残された謎の一覧' : '謎解き会話'}" tabindex="0" ${yoiEndView || p.type === 'pending' || answerPageVisible ? 'hidden' : ''}>
        ${investigationView ? investigationMarkup() : ''}
        <div id="messages" class="messages" role="log" aria-label="会話" aria-live="polite" aria-relevant="additions text">${investigationView ? '' : displayedMessages.map(messageMarkup).join('')}</div>
        ${inInvestigation && solved && !isPlaying && !p.dialogue.length ? '<p class="investigation-complete-note" role="status">正解しました。</p>' : ''}
        ${branchPending ? `<div class="branch-options" aria-label="会話の選択肢">${p.branches.map(b => `<button data-action="branch" data-id="${esc(b.id)}">${esc(b.label)}${icon('arrow')}</button>`).join('')}</div>` : ''}
        ${p.instruction && solved && !isPlaying && !startView ? `<div class="chapter-end"><span>${esc(p.instruction)}</span></div>` : ''}
        ${(solved || isPlaying) && storageWarning ? `<div class="feedback" role="status">${esc(storageWarning)}</div>` : ''}
      </section>
      ${investigationView ? `<p id="investigation-next-status" class="sr-only">${investigationComplete(scenario, state) ? 'すべての謎を解きました。' : 'すべての謎を解くと、次へ進めます。'}</p><button class="answer-fab investigation-next" data-action="investigation-next" ${investigationComplete(scenario, state) ? '' : 'disabled'} aria-describedby="investigation-next-status">${icon('arrow')}<span>次へ</span></button>` : ''}
      ${investigationReturnVisible ? '<button class="investigation-return" data-action="investigation-back">問題一覧へ戻る</button>' : ''}
      <button id="conversation-notice" class="conversation-notice" data-action="continue-conversation" aria-live="polite" aria-atomic="true" hidden>↓ 続きの会話</button>
      <section id="composer-area" class="composer-area${answerPageVisible ? ' answer-page' : ''}" aria-label="${answerPageVisible ? `${esc(p.id)}の回答画面` : '問題と回答'}" tabindex="-1" ${composerVisible ? '' : 'hidden'}>
        ${p.answerPresentation === 'page' && !composerVisible ? '' : composerContentMarkup(p)}
      </section>
      ${completionPending ? `<button class="answer-fab" data-action="yoi-next">${icon('arrow')}<span>次へ</span></button>` : ''}
      ${completionPending || investigationView || p.type === 'pending' || isPlaying || branchPending || yoiEndView || sectionFinished ? '' : `<button class="answer-fab" data-action="open-composer" aria-label="${esc(answerTarget.entryButtonLabel ?? '回答エリアを開く')}" aria-controls="composer-area" aria-expanded="${composerExpanded}" ${composerExpanded ? 'hidden' : ''}>${icon('edit')}<span>${esc(answerTarget.entryButtonLabel ?? '回答')}</span></button>`}
      ${historyView ? historyScreenMarkup() : ''}
    </main>
  </div>`;
  document.querySelector('.chat-area').scrollTop = chatScrollTop;
  const historyBody = document.querySelector('.history-body');
  if (historyBody) historyBody.scrollTop = historyScrollTop;
  bindChatScroll();
  bindPuzzleSubmitLayout();
  if (problemMenuExpanded) alignCurrentProblem();
  viewportLayout.update();
  updateConversationNotice();
  if (scroll) scrollConversationToEnd();
  save();
}

function openPanel(kind, { keepFocus = false, revealSelector = null, showStartButton = false } = {}) {
  const wasOpen = panel.open;
  const scrollTop = panel.scrollTop;
  surfaceAnimations.get(panel)?.cancel();
  surfaceAnimations.delete(panel);
  panel.classList.remove('is-closing');
  panel.classList.toggle('image-viewer', kind === 'puzzle-image');
  panel.classList.toggle('answer-choice-dialog', ['answer-choices', 'symbol-choices'].includes(kind));
  panel.classList.toggle('symbol-choice-dialog', kind === 'symbol-choices');
  panel.classList.toggle('resume-sheet', kind === 'resume');
  const saveInfo = ['save-info', 'save-conflict'].includes(kind);
  panel.classList.toggle('save-info-sheet', saveInfo);
  panel.inert = false;
  const focusedId = keepFocus ? document.activeElement?.id : null;
  let title = '';
  let content = '';
  const p = current();
  puzzleSwipeStart = null;
  panel.classList.toggle('image-gallery', kind === 'puzzle-image' && puzzleImages(p).length > 1);
  if (kind === 'resume') {
    title = '続きから';
    content = `<form id="resume-form"><p id="resume-help">6桁の再開番号を入力してください。</p><fieldset class="resume-digits" aria-describedby="resume-help resume-error" ${gateBusy ? 'disabled' : ''}><legend class="sr-only">再開番号（数字6桁）</legend>${gateDigits.map((digit, index) => `<input id="resume-digit-${index}" data-resume-digit="${index}" name="digit" type="text" inputmode="numeric" pattern="[0-9０-９]" maxlength="1" required autocomplete="${index === 0 ? 'one-time-code' : 'off'}" aria-label="再開番号 ${index + 1}桁目" aria-invalid="${Boolean(gateError)}" value="${esc(digit)}">`).join('')}</fieldset><p id="resume-error" class="resume-error" role="alert">${esc(gateError)}</p><button class="primary-button full" type="submit" ${gateBusy ? 'disabled' : ''}>${gateBusy ? '確認中…' : '続きから'}</button></form>`;
  } else if (kind === 'symbol-choices') {
    title = `${p.id}：${activeSymbolSlot + 1}文字目を選択`;
    content = `<div class="symbol-picker-slots" role="group" aria-label="回答する空欄">${symbolSlotButtonsMarkup(p, true)}</div><div class="symbol-choice-grid" role="group" aria-label="数字0〜9と8方向の矢印">${p.symbolChoices.map(value => `<button type="button" data-action="choose-symbol" data-id="${esc(value)}" aria-label="${esc(value)}" aria-pressed="${value === selectedSymbols[activeSymbolSlot]}">${esc(value)}</button>`).join('')}</div>`;
  } else if (kind === 'answer-choices') {
    title = '答えを選択';
    content = `<div class="answer-choice-grid" role="group" aria-label="N1の選択肢">${p.options.map(option => `<button type="button" data-action="choose-answer" data-id="${esc(option.id)}" aria-pressed="${option.id === selectedPuzzleAnswer}">${answerChoiceMarkup(option)}</button>`).join('')}</div>`;
  } else if (kind === 'puzzle-image') {
    title = `${problemLabel(p)}の問題`;
    const image = puzzleImages(p)[puzzleImageIndex] ?? puzzleImages(p)[0];
    content = `<img class="puzzle-full-image" src="${esc(image.src)}" alt="${esc(image.alt)}" draggable="false">`;
  } else if (kind === 'hints') {
    title = 'ヒント';
    const count = state.hints[p.id] ?? 0;
    content = `<p class="panel-intro">${esc(problemLabel(p))} · ${esc(problemTitle(p))}<br>必要なところまで、少しずつ。</p><div class="hint-list">${p.hints.slice(0, count).map((h, i) => `<section class="hint-card"><span class="eyebrow">HINT ${String(i + 1).padStart(2, '0')}</span><p>${esc(h)}</p></section>`).join('') || '<div class="empty-state">まだヒントを開いていません。</div>'}</div>${count < p.hints.length ? `<button id="reveal-hint" class="primary-button full" data-action="reveal-hint">${count ? '次のヒントを見る' : '最初のヒントを見る'}<span>${count + 1} / ${p.hints.length}</span></button>` : '<p class="muted">すべてのヒントを表示しました。</p>'}<details class="answer-reveal"><summary>答えと解説を見る</summary><p>${esc(p.explanation)}</p></details>`;
  } else if (kind === 'notebook') {
    title = '考察ノート';
    const cards = unlockedCards(scenario, state);
    content = `<p class="panel-intro">集めた手がかりを2枚選んで、組み合わせてみましょう。</p><form id="combine-form"><div class="card-grid">${cards.map(c => `<label class="evidence-card"><input type="checkbox" name="card" value="${esc(c.id)}"><span class="card-code">${esc(c.id)}</span><span class="card-mark">${esc(c.mark)}</span><strong>${esc(c.title)}</strong><span class="card-copy">${esc(c.text)}</span></label>`).join('') || '<div class="empty-state">問題に正解すると、ここに<br>手がかりが届きます。</div>'}</div>${cards.length >= 2 ? '<button class="primary-button full" type="submit">2枚の手がかりを組み合わせる</button>' : ''}</form><div id="combine-feedback" role="status"></div><div class="findings">${scenario.combinations.filter(c => state.combinations.includes(c.id)).map(c => `<section class="finding"><span class="eyebrow">DISCOVERY · ${esc(c.cards.join(' + '))}</span><h3>${esc(c.title)}</h3><p>${esc(c.text)}</p></section>`).join('')}</div>`;
  } else if (kind === 'save-info' || kind === 'save-conflict') {
    const record = playSaves.getRecord();
    const status = playSaves.getStatus();
    title = status.mode === 'debug' ? 'デバッグモード' : '進行を保存';
    content = status.mode === 'debug'
      ? '<p>進行は保存されません。再読み込みすると、デバッグ中の進行は失われます。</p><button class="secondary-button full" data-action="save-entry">番号入力画面へ</button>'
      : `<p class="panel-intro">別の端末で再開するときに、この番号を入力してください。番号をメモするか、画面を保存してください。</p>
        <div class="save-code-row"><p class="save-code" data-save-code>${esc(record?.code ?? '発行待ち')}</p><button class="save-copy-button" data-action="save-copy" aria-label="再開番号をコピー" ${normalizePlayCode(record?.code) ? '' : 'disabled'}>${icon('copy')}<span>コピー</span></button></div>
        <p class="save-copy-feedback" data-copy-feedback role="status"></p>
        ${showStartButton ? `<button class="primary-button full save-start-button" data-action="save-start" ${status.phase === 'conflict' ? 'disabled' : ''}>ゲーム開始${icon('arrow')}</button>` : ''}
        ${gateError ? `<p role="alert">${esc(gateError)}</p>` : ''}
        <p class="muted save-code-note">この番号を知っている人は、進行を開けます。他の人への共有はお控えください。</p>
        ${status.phase === 'conflict' ? '<div class="save-conflict"><p>別の端末やタブで進行が更新されています。どちらを使うか選んでください。選ばなかった進行も、このブラウザに退避します。</p><button class="primary-button full" data-action="save-use-remote">Cloudflareの記録から再開</button><button class="secondary-button full" data-action="save-use-local">この端末の進行を保存する</button></div>' : ''}
        <div class="save-footer-actions"><button data-action="save-title">タイトルに戻る</button><button data-action="save-delete-confirm">このプレイデータを削除する</button></div>`;
  } else if (kind === 'save-delete-confirm') {
    title = 'プレイデータを削除';
    content = '<p>この番号のCloudflare上の記録と、このブラウザの対応する記録を削除します。削除後はこの番号で再開できません。</p><div class="reset-actions"><button class="secondary-button" data-action="close">キャンセル</button><button class="primary-button" data-action="save-delete">削除する</button></div>';
  } else if (kind === 'help') {
    title = '使い方';
    content = '<div class="help-copy"><p>冊子の問題を解いて、対応する問題番号に答えを送ってください。正解すると、会話と次の指示が届きます。</p><h3>迷ったときは</h3><p>「ヒント」から段階的に手がかりを開けます。答えと解説は、その下から確認できます。</p><h3>手がかりをつなぐ</h3><p>正解で届くカードは「考察ノート」に集まります。2枚選んで、新しい情報を探してみてください。</p><h3>途中から再開する</h3><p>進行状況はこのブラウザとCloudflareに保存します。同じブラウザでは「つづきから」、別の端末では6桁の再開番号を入力してください。メニューの「進行を保存」から番号と保存状態を確認できます。</p><button class="reset-link" data-action="reset">はじめからやり直す</button><div class="demo-note">N1は冊子の問題1の答えを①〜⑩から選んで送ってください。</div></div>';
  } else if (kind === 'reset') {
    title = 'はじめからやり直す';
    content = '<p class="panel-intro">新しい番号で最初から始めます。元の番号の記録は残ります。元の番号は「進行を保存」から控えてください。</p><div class="reset-actions"><button class="secondary-button" data-action="close">キャンセル</button><button class="primary-button" data-action="confirm-reset">新しいプレイを始める</button></div>';
  }
  panel.innerHTML = ['answer-choices', 'symbol-choices'].includes(kind)
    ? `<div class="answer-choice-header"><h2 id="panel-title">${title}</h2><button class="icon-button" data-action="close" aria-label="閉じる">${icon('close')}</button></div>${content}`
    : kind === 'puzzle-image'
    ? `<h2 id="panel-title" class="sr-only">${title}</h2><button class="icon-button image-viewer-close" data-action="close" aria-label="問題画像を閉じる">${icon('close')}</button><div class="image-viewer-stage">${content}</div>${puzzlePagesMarkup(p)}`
    : `<div class="panel-header"><div><span class="eyebrow">NOVEMBER ARCHIVE</span><h2 id="panel-title"${saveInfo ? ' tabindex="-1"' : ''}>${title}</h2></div>${saveInfo ? '' : `<button class="icon-button" data-action="close" aria-label="閉じる">${icon('close')}</button>`}</div><div class="panel-body">${content}</div>`;
  if (!panel.open) panel.showModal();
  viewportLayout.schedule();
  if (kind !== 'resume' || !wasOpen) animateSurface(wasOpen ? panel.querySelector(revealSelector ?? '.panel-body') ?? panel.querySelector('.symbol-choice-grid, .answer-choice-grid, .image-viewer-stage') : panel, true, kind === 'resume' ? '100%' : wasOpen ? 8 : 24);
  if (kind === 'resume') {
    const closeButton = panel.querySelector('[data-action="close"]');
    if (closeButton) closeButton.disabled = gateBusy;
    if (!gateBusy) panel.querySelector(`#resume-digit-${Math.max(0, gateDigits.findIndex(digit => !digit))}`)?.focus({ preventScroll: true });
  } else (focusedId ? document.getElementById(focusedId) : panel.querySelector(saveInfo ? '#panel-title' : '[data-action="close"]'))?.focus({ preventScroll: keepFocus });
  if (wasOpen && keepFocus) panel.scrollTop = scrollTop;
}

function selectProblem(id, { start = false, preserveConversation = false, answering = false, investigationDetail = false } = {}) {
  const nextProblem = scenario.problems.find(p => p.id === id);
  if (!nextProblem) return;
  if (historyView) closeHistoryScreen();
  if (!canOpenProblem(nextProblem, state)) { showInvestigation(); return; }
  if (id === scenario.investigation.id && !investigationDetail) { showInvestigation(); return; }
  investigationView = false;
  if (nextProblem.type === 'pending') composerExpanded = false;
  if (nextProblem.answerPresentation === 'page' && !preserveConversation) composerExpanded = false;
  if (!preserveConversation || state.selected !== id) {
    selectedSymbols = Array(nextProblem.answerSlots ?? 0).fill('');
    activeSymbolSlot = 0;
  }
  if (!preserveConversation || current().images !== nextProblem.images) puzzleImageIndex = 0;
  puzzleSwipeStart = null;
  conversationPlayer.stop(); isPlaying = false;
  problemMenuExpanded = false;
  if (!preserveConversation || nextProblem.conversationBackground === 'empty') resetChatFollow();
  startView = start;
  yoiEndView = false;
  repeatAnswer = answering && state.solved.includes(id);
  selectedPuzzleAnswer = '';
  state = { ...state, selected: id };
  if (!preserveConversation || nextProblem.conversationBackground === 'empty') {
    sceneStart = latestSceneStart(state.messages, id);
    if (start || nextProblem.conversationBackground === 'empty' || isInvestigation(id) && answering) displayedMessages = [];
    else if (isInvestigation(id)) displayedMessages = nextProblem.dialogue.map(line => ({ ...line, kind: 'dialogue', problemId: id }));
    else if (answering) {
      // 番号から回答へ移るときは、直前の会話を背景にする。
      // 会話を挟まない小問では、さらに前の会話を引き継ぐ。
      const previous = scenario.problems.slice(0, scenario.problems.findIndex(p => p.id === id)).reverse().find(p => p.chapter === nextProblem.chapter && p.dialogue.length);
      displayedMessages = previous ? previous.dialogue.map(line => ({ ...line, kind: 'dialogue', problemId: previous.id })) : [];
    } else displayedMessages = conversationMessages(state.messages.slice(sceneStart).filter(m => m.problemId === id));
  }
  feedback = ''; save(); render();
  if (!preserveConversation || nextProblem.conversationBackground === 'empty') document.querySelector('.chat-area').scrollTop = 0;
  if (!preserveConversation && displayedMessages.length) animateSurface(document.querySelector('#messages'), true, 8);
  if (composerExpanded) animateSurface(document.querySelector('.composer-area'), true, 8);
  else if (!isPlaying) animateSurface(document.querySelector('.answer-fab'), true, 8);
  if (composerExpanded && nextProblem.answerPresentation === 'page') document.querySelector('.composer-area')?.focus({ preventScroll: true });
}

function setAnswerError(incorrect) {
  answerErrorAnimation?.cancel();
  answerErrorAnimation = null;
  const form = document.querySelector('#answer-form');
  if (!form) return;
  form.classList.toggle('is-incorrect', incorrect);
  form.querySelectorAll('input:not([type="hidden"]), select, .answer-choice-trigger, .symbol-slot-fields, .answer-options').forEach(field => {
    if (incorrect) field.setAttribute('aria-invalid', 'true');
    else field.removeAttribute('aria-invalid');
  });
  const status = document.querySelector('#answer-error');
  if (status) status.textContent = incorrect ? '答えが違います。もう一度回答してください。' : '';
  if (!incorrect || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const fields = form.querySelector('.answer-fields, .text-composer, .answer-choice-trigger, .symbol-slot-fields, .answer-options');
  if (fields?.animate) answerErrorAnimation = fields.animate(
    [0, -6, 6, -5, 5, -2, 0].map(x => ({ transform: `translateX(${x}px)` })),
    { duration: 380, easing: 'ease-in-out' },
  );
}

function answer(value) {
  if (gateVisible) return { status: 'unavailable' };
  if (historyView) return { status: 'unavailable', problemId: state.selected };
  if (isPlaying) return { status: 'busy', problemId: state.selected };
  if (investigationView) return { status: 'unavailable', problemId: state.selected };
  const problem = current();
  const start = state.messages.length;
  // スタートからは、進行を消さずにN1を再回答できる。
  const submissionState = startView || repeatAnswer ? { ...state, solved: state.solved.filter(id => id !== problem.id) } : state;
  const result = submitAnswer(scenario, submissionState, value);
  if (startView || repeatAnswer) result.state = { ...result.state, solved: [...new Set([...state.solved, ...result.state.solved])] };
  state = result.state;
  if (result.status === 'correct') repeatAnswer = false;
  feedback = result.status === 'empty' ? problem.answerSlots ? `${problem.answerSlots}つすべての空欄を選択してください。` : '答えを入力・選択してください。' : '';
  save();
  if (result.status === 'incorrect') {
    if (result.response) {
      setAnswerError(false);
      playConversation(start);
      return { status: result.status, problemId: problem.id };
    }
    const feedbackArea = document.querySelector('.composer-area .feedback');
    if (feedbackArea) feedbackArea.textContent = storageWarning;
    setAnswerError(true);
    return { status: result.status, problemId: problem.id };
  }
  setAnswerError(false);
  if (result.status === 'correct' && problem.advanceTo) {
    selectedSymbols = [];
    activeSymbolSlot = 0;
    repeatAnswer = state.solved.includes(state.selected);
    composerExpanded = true;
    const composer = document.querySelector('.composer-area');
    const nextProblem = current();
    const card = composer.querySelector?.('.start-puzzle-card');
    const copy = card?.querySelector('.puzzle-card-copy');
    const heading = composer.querySelector?.('.answer-composer-heading h2');
    if (problem.images && problem.images === nextProblem.images && copy && heading) {
      // 同じ資料を使う小問では、画像のDOMと選択位置を維持して左側だけを切り替える。
      copy.innerHTML = puzzleCopyMarkup(nextProblem);
      card.setAttribute('data-problem-id', nextProblem.id);
      card.setAttribute('aria-label', `${nextProblem.id}の問題カード`);
      heading.textContent = nextProblem.id;
      card.querySelector('.puzzle-preview')?.setAttribute('aria-label', `${nextProblem.id}の図を拡大表示`);
      const feedbackArea = composer.querySelector('.feedback');
      if (feedbackArea) feedbackArea.textContent = storageWarning;
      if (nextProblem.id === 'N4.2') {
        // display: contentsの親ではなく、表示される問題文とフォームを動かす。
        animateSurface(copy.querySelector?.('.puzzle-card-prompt'), true, 8);
        animateSurface(copy.querySelector?.('#answer-form'), true, 8);
      } else animateSurface(copy, true, 0);
    } else {
      composer.innerHTML = composerContentMarkup(nextProblem);
      animateSurface(composer, true, 8);
    }
    updateProblemNavigation();
    composer.hidden = false;
    composer.inert = false;
    composer.scrollTop = 0;
    bindPuzzleSubmitLayout();
    viewportLayout.schedule();
    const fab = document.querySelector('.answer-fab');
    if (fab) {
      fab.hidden = true;
      fab.setAttribute('aria-expanded', 'true');
      fab.setAttribute('aria-label', nextProblem.entryButtonLabel ?? '回答エリアを開く');
      const label = fab.querySelector?.('span');
      if (label) label.textContent = nextProblem.entryButtonLabel ?? '回答';
    }
    (document.querySelector('#answer') ?? composer.querySelector?.('#answer-form input'))?.focus({ preventScroll: true });
  }
  else if (result.status === 'correct') playConversation(start);
  else render();
  return { status: result.status, problemId: problem.id };
}

document.addEventListener('click', event => {
  const button = event.target.closest('[data-action]');
  const action = button?.dataset.action;
  if ((!event.target.closest('.navigation-menu') && !event.target.closest('#navigation-menu')) || event.target.closest('.menu-items [data-action]')) setMenuExpanded(false);
  if (!event.target.closest('.problem-navigation')) setProblemMenuExpanded(false);
  if (!button) return;
  if (action === 'save-continue') {
    if (gateBusy) return;
    if (localRecord?.state || playSaves.getRecord()?.state || legacyState) {
      gateInput = false;
      void beginPlay('continue');
    } else {
      gateInput = true;
      gateError = '';
      openPanel('resume');
    }
    return;
  }
  else if (action === 'save-new') { if (localRecord || legacyState || playSaves.getRecord()?.code && playSaves.getRecord().code !== '000000') { gateError = ''; renderEntry(); openPanel('reset'); } else void beginPlay('new'); return; }
  else if (action === 'save-entry-back') { closePanel(); return; }
  else if (action === 'save-start') {
    if (playSaves.getStatus().phase === 'conflict') return;
    closePanel();
    if (startView && !state.solved.length) setComposerExpanded(true);
    return;
  }
  else if (action === 'save-copy') {
    const code = normalizePlayCode(playSaves.getRecord()?.code);
    if (!code) return;
    const message = panel.querySelector('[data-copy-feedback]');
    void (async () => {
      try {
        await window.navigator.clipboard.writeText(code);
        if (message) message.textContent = 'コピーしました';
      } catch {
        if (message) message.textContent = 'コピーできませんでした。番号を選択してコピーしてください。';
      }
    })();
    return;
  }
  else if (action === 'save-title') {
    save(); conversationPlayer.stop(); isPlaying = false; closePanel();
    gateVisible = true; gateInput = false; gateError = ''; gateCode = ''; gateDigits = Array(6).fill('');
    localRecord = playSaves.getRecord() ?? playSaves.readLocal();
    renderEntry(); void playSaves.flush(); return;
  }
  else if (action === 'save-entry') {
    save(); conversationPlayer.stop(); isPlaying = false; closePanel(); gateVisible = true; gateInput = true; gateError = ''; gateCode = ''; gateDigits = Array(6).fill(''); playSaves.leaveSession(); localRecord = playSaves.readLocal(); renderEntry(); return;
  }
  else if (action === 'save-retry') { void playSaves.retry().then(() => openPanel('save-info')).catch(error => { gateError = error.message; openPanel('save-info'); }); return; }
  else if (action === 'save-use-remote' || action === 'save-use-local') {
    if (saveMutationBusy) return;
    saveMutationBusy = true;
    panel.querySelectorAll('[data-action="save-use-remote"], [data-action="save-use-local"]').forEach(node => { node.disabled = true; });
    conversationPlayer.stop(); isPlaying = false;
    void playSaves.resolveConflict(action === 'save-use-remote' ? 'remote' : 'local').then(record => { if (record) enterPlay(record); }).catch(error => { gateError = error.message; openPanel('save-info'); }).finally(() => { saveMutationBusy = false; }); return;
  }
  else if (action === 'save-delete') {
    if (saveMutationBusy) return;
    saveMutationBusy = true;
    button.disabled = true;
    conversationPlayer.stop(); isPlaying = false;
    void playSaves.deleteCurrent().then(deleted => { if (!deleted) { openPanel('save-info'); return; } conversationPlayer.stop(); isPlaying = false; legacyState = null; localRecord = null; gateVisible = true; gateInput = true; gateError = ''; closePanel(); renderEntry(); }).catch(error => { gateError = error.message; openPanel('save-info'); }).finally(() => { saveMutationBusy = false; }); return;
  }
  else if (action === 'toggle-menu') setMenuExpanded(!menuExpanded);
  else if (action === 'investigation-back') showInvestigation();
  else if (action === 'investigation-open') openInvestigationProblem(button.dataset.id);
  else if (action === 'investigation-next' && investigationView && investigationComplete(scenario, state)) {
    composerExpanded = true;
    selectProblem(scenario.investigation.next, { answering: true });
  }
  else if (action === 'close-menu') setMenuExpanded(false);
  else if (action === 'toggle-problems') setProblemMenuExpanded(!problemMenuExpanded);
  else if (action === 'history') openHistoryScreen();
  else if (action === 'history-back') closeHistoryScreen();
  else if (action === 'chat') { if (historyView) closeHistoryScreen(); closePanel(); document.querySelector('.menu-button')?.focus({ preventScroll: true }); }
  else if (action === 'yoi-end' && state.solved.includes(scenario.problems.find(p => p.completionScreen === 'yoi')?.id)) {
    composerExpanded = false; selectProblem(scenario.problems.find(p => p.completionScreen === 'yoi').id);
    yoiEndView = true; resetChatFollow(); render();
    document.querySelector('#yoi-completion-title')?.focus({ preventScroll: true });
  }
  else if (action === 'yoi-next' && current().completionScreen === 'yoi' && state.solved.includes(current().id) && !isPlaying && !startView && !repeatAnswer) {
    yoiEndView = true; resetChatFollow(); render();
    document.querySelector('#yoi-completion-title')?.focus({ preventScroll: true });
    animateSurface(document.querySelector('.yoi-completion'), true, 8);
  }
  else if (action === 'continue-at-venue' && yoiEndView && state.solved.includes(current().id)) {
    composerExpanded = false;
    selectProblem('Q1', { preserveConversation: true });
  }
  else if (action === 'open-composer' && !isPlaying) {
    const next = !startView && !repeatAnswer && state.solved.includes(state.selected)
      ? followingProblem(current()) : null;
    composerExpanded = true;
    selectProblem(next?.id ?? state.selected, { start: startView, preserveConversation: true, answering: true, investigationDetail: isInvestigation() });
  }
  else if (action === 'close-composer') { if (isInvestigation() && !startView) showInvestigation(); else setComposerExpanded(false); }
  else if (action === 'start') { composerExpanded = false; selectProblem('N1', { start: true }); }
  else if (action === 'select') { composerExpanded = true; selectProblem(button.dataset.id, { answering: true }); }
  else if (action === 'puzzle-page') setPuzzleImage(Number(button.dataset.index));
  else if (action === 'symbol-slot') {
    const index = Number(button.dataset.index);
    if (current().symbolChoices && Number.isInteger(index) && index >= 0 && index < current().answerSlots) {
      activeSymbolSlot = index;
      openPanel('symbol-choices');
    }
  }
  else if (action === 'choose-symbol' && current().symbolChoices?.includes(button.dataset.id)) {
    setAnswerError(false);
    const p = current();
    selectedSymbols[activeSymbolSlot] = button.dataset.id;
    save();
    document.querySelector('#answer').value = selectedSymbols.join('');
    const slot = document.querySelector(`#symbol-slot-${activeSymbolSlot}`);
    if (slot) {
      slot.textContent = button.dataset.id;
      slot.setAttribute('data-filled', 'true');
      slot.setAttribute('aria-label', `${activeSymbolSlot + 1}文字目を選択：${button.dataset.id}`);
      animateSurface(slot, true, 4);
    }
    const complete = selectedSymbols.length === p.answerSlots && selectedSymbols.every(Boolean);
    const submit = document.querySelector('.puzzle-symbol-answer > button[type="submit"]');
    if (submit) submit.disabled = !complete;
    if (complete) closePanel();
    else {
      activeSymbolSlot = selectedSymbols.findIndex(value => !value);
      openPanel('symbol-choices');
    }
  }
  else if (action === 'choose-answer') {
    const option = current().options?.find(item => item.id === button.dataset.id);
    if (option) {
      setAnswerError(false);
      selectedPuzzleAnswer = option.id;
      save();
      document.querySelector('#answer').value = option.id;
      document.querySelector('#answer-choice-label').innerHTML = answerChoiceMarkup(option);
      animateSurface(document.querySelector('#answer-choice-label'), true, 4);
      closePanel();
    }
  }
  else if (['hints', 'notebook', 'help', 'reset', 'save-info', 'save-conflict', 'save-delete-confirm', 'puzzle-image', 'answer-choices'].includes(action)) openPanel(action);
  else if (action === 'close') closePanel();
  else if (action === 'continue-conversation') {
    resetChatFollow(); updateConversationNotice(); scrollConversationToEnd(true);
  }
  else if (action === 'replay' && !isPlaying) playConversation(latestSceneStart(state.messages, state.selected));
  else if (action === 'next' && !isPlaying) { composerExpanded = false; selectProblem(followingProblem(current())?.id); }
  else if (action === 'branch' && !isPlaying) {
    const start = state.messages.length;
    const next = chooseBranch(scenario, state, state.selected, button.dataset.id);
    if (next !== state) { state = next; save(); playConversation(start); }
  }
  else if (action === 'reveal-hint') { state.hints[state.selected] = Math.min((state.hints[state.selected] ?? 0) + 1, current().hints.length); save(); openPanel('hints', { keepFocus: true, revealSelector: '.hint-card:last-child' }); }
  else if (action === 'confirm-reset') {
    closePanel();
    if (playSaves.getStatus().mode === 'debug') {
      enterPlay(playSaves.enterDebug(initialState(scenario), restorePlayView(scenario, initialState(scenario), null)));
    } else {
      save(); conversationPlayer.stop(); isPlaying = false;
      gateVisible = true; gateInput = true;
      void beginPlay('new');
    }
  }
});
for (const name of ['pointerup', 'pointercancel', 'touchend', 'touchcancel']) {
  document.addEventListener(name, () => {
    if (name.startsWith('pointer')) chatPointerDown = false;
    else chatTouchDown = false;
    resumeChatFollowIfAtBottom();
  }, { passive: true });
}
document.addEventListener('keydown', event => {
  const resumeIndex = event.target?.dataset?.resumeDigit;
  if (resumeIndex !== undefined && !gateBusy && !event.isComposing) {
    const index = Number(resumeIndex);
    if (event.key === 'Backspace' && !event.target.value && index > 0) {
      event.preventDefault();
      setResumeDigits(index - 1, '');
    } else if (['ArrowLeft', 'ArrowRight'].includes(event.key)) {
      event.preventDefault();
      panel.querySelector(`#resume-digit-${Math.max(0, Math.min(5, index + (event.key === 'ArrowLeft' ? -1 : 1)))}`)?.focus({ preventScroll: true });
    }
  }
  if (panel.open && panel.classList.contains('image-gallery') && ['ArrowLeft', 'ArrowRight'].includes(event.key)) {
    event.preventDefault();
    setPuzzleImage(puzzleImageIndex + (event.key === 'ArrowLeft' ? -1 : 1));
    return;
  }
  if (event.key !== 'Escape' || panel.open) return;
  if (historyView) { closeHistoryScreen(); return; }
  if (problemMenuExpanded) {
    setProblemMenuExpanded(false); document.querySelector('.problem-toggle')?.focus({ preventScroll: true });
  } else if (menuExpanded) {
    setMenuExpanded(false); document.querySelector('.menu-button')?.focus({ preventScroll: true });
  } else if (composerExpanded) { if (isInvestigation() && !startView) showInvestigation(); else setComposerExpanded(false); }
});
for (const name of ['input', 'change']) {
  document.addEventListener(name, event => {
    if (event.target.closest('#answer-form')) setAnswerError(false);
    if (name === 'input' && event.target.dataset?.resumeDigit !== undefined && !event.isComposing) setResumeDigits(Number(event.target.dataset.resumeDigit), event.target.value);
  });
}
document.addEventListener('compositionend', event => {
  if (event.target.dataset?.resumeDigit !== undefined) setResumeDigits(Number(event.target.dataset.resumeDigit), event.target.value);
});
document.addEventListener('focusin', event => {
  if (event.target.dataset?.resumeDigit !== undefined) event.target.select();
});
document.addEventListener('paste', event => {
  if (event.target.dataset?.resumeDigit === undefined || gateBusy) return;
  const text = event.clipboardData?.getData('text');
  if (!text) return;
  event.preventDefault();
  setResumeDigits(Number(event.target.dataset.resumeDigit), text);
});
document.addEventListener('submit', event => {
  if (event.target.id === 'resume-form') {
    event.preventDefault();
    if (gateBusy) return;
    gateCode = gateDigits.join('');
    void beginPlay('code', gateCode);
  } else if (event.target.id === 'answer-form') {
    event.preventDefault();
    const data = new FormData(event.target);
    answer(current().type === 'text' ? data.get('answer') : data.getAll('answer'));
  } else if (event.target.id === 'combine-form') {
    event.preventDefault();
    const ids = new FormData(event.target).getAll('card');
    const result = findCombination(scenario, ids);
    if (!result) { document.querySelector('#combine-feedback').textContent = ids.length !== 2 ? '手がかりを2枚選んでください。' : 'この組み合わせからは、まだ新しい情報を見つけられません。'; return; }
    if (!state.combinations.includes(result.id)) state.combinations.push(result.id);
    save(); openPanel('notebook');
  }
});
panel.addEventListener('click', event => { const rect = panel.getBoundingClientRect(); if (event.target === panel && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)) closePanel(); });
panel.addEventListener('cancel', event => { event.preventDefault(); closePanel(); });
panel.addEventListener('pointerdown', event => {
  if (!panel.classList.contains('image-gallery') || !event.target.closest('.image-viewer-stage') || event.isPrimary === false || (event.pointerType === 'mouse' && event.button !== 0)) {
    puzzleSwipeStart = null;
    return;
  }
  puzzleSwipeStart = { x: event.clientX, y: event.clientY, pointerId: event.pointerId };
  panel.setPointerCapture?.(event.pointerId);
});
panel.addEventListener('pointerup', event => {
  const start = puzzleSwipeStart;
  puzzleSwipeStart = null;
  if (!start || start.pointerId !== event.pointerId || !panel.open || !panel.classList.contains('image-gallery')) return;
  const dx = event.clientX - start.x;
  const dy = event.clientY - start.y;
  if (Math.abs(dx) >= 44 && Math.abs(dx) > Math.abs(dy) * 1.3) setPuzzleImage(puzzleImageIndex + (dx < 0 ? 1 : -1));
});
panel.addEventListener('pointercancel', () => { puzzleSwipeStart = null; });
let browserStorage;
try { browserStorage = window.localStorage; } catch { browserStorage = null; }
playSaves = createPlaySaveController({ scenarioId: scenario.id, storage: browserStorage,
  debounceMs: 2400, onStatus: updateSaveStatus,
  onConflict() { if (!gateVisible && playSaves.getStatus().mode !== 'debug') openPanel('save-conflict'); },
});
localRecord = playSaves.readLocal();
if (!localRecord) {
  try {
    const raw = browserStorage?.getItem(`${storageKey}:migrated`) ? null : browserStorage?.getItem(storageKey);
    const parsed = JSON.parse(raw);
    if ([1, 2].includes(parsed?.version) && Array.isArray(parsed?.messages) && Array.isArray(parsed?.solved)) legacyState = restoreState(scenario, raw);
  } catch { /* 保存できない環境でも番号入力とデバッグを利用できる。 */ }
}
window.addEventListener('online', () => { if (!gateVisible && playSaves.getStatus().mode !== 'debug') void playSaves.retry(); });
window.addEventListener('storage', event => playSaves.handleStorageEvent(event));
window.addEventListener('pagehide', () => { save(); if (!gateVisible) void playSaves.flush(); });
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') { save(); if (!gateVisible) void playSaves.flush(); } });
render();

// ブラウザが対応している場合だけ、画面と同じ操作をWebMCPへ登録します。
const modelContext = document.modelContext;
if (modelContext?.registerTool) {
  const lifecycle = new AbortController();
  const tool = { name: 'submit_puzzle_answer', title: '謎の答えを送る', description: '現在選択中の問題に回答し、正誤判定と会話の更新を行います。選択問題には選択肢IDの配列、複数入力欄の問題には画面の順に文字列の配列を渡します。', inputSchema: { type: 'object', properties: { answer: { anyOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }] } }, required: ['answer'], additionalProperties: false }, annotations: { readOnlyHint: false, untrustedContentHint: false }, execute(input) {
    if (!input || Object.keys(input).some(k => k !== 'answer') || !(typeof input.answer === 'string' || Array.isArray(input.answer) && input.answer.every(a => typeof a === 'string'))) throw new Error('答えの形式が正しくありません。');
    if (investigationView || current().type === 'pending') return { status: 'unavailable', problemId: state.selected };
    if (current().type === 'text' ? typeof input.answer !== 'string' : !Array.isArray(input.answer) || (current().type === 'fields' ? input.answer.length !== current().fields.length : input.answer.some(a => !current().options.some(o => o.id === a)))) throw new Error('問題の回答形式に合わせてください。');
    return answer(input.answer);
  } };
  try { Promise.resolve(modelContext.registerTool(tool, { signal: lifecycle.signal })).catch(() => {}); } catch { /* 対応状況により登録できない場合も、画面の操作は利用できます。 */ }
  window.addEventListener('pagehide', () => lifecycle.abort(), { once: true });
}
