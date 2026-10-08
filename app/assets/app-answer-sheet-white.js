import { scenario } from './scenario.js';
import { initialState, restoreState, submitAnswer, chooseBranch, unlockedCards, findCombination } from './engine.js';

const app = document.querySelector('#app');
const panel = document.querySelector('#panel');
const storageKey = `webbot:${scenario.id}`;
let state;
let storageWarning = '';
try { state = restoreState(scenario, localStorage.getItem(storageKey)); }
catch { state = initialState(scenario); storageWarning = 'このブラウザでは進行状況を保存できません。'; }
let feedback = '';
let composerExpanded = false;
let menuExpanded = false;
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
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  reset: '<path d="M3 11a9 9 0 1 1 2 7M3 3v8h8"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v1"/>',
};
const icon = name => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] ?? ''}</svg>`;
const esc = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const current = () => scenario.problems.find(p => p.id === state.selected);
const surfaceAnimations = new WeakMap();

function animateSurface(element, opening, offset = 20) {
  if (!element) return Promise.resolve(false);
  const previous = surfaceAnimations.get(element);
  const currentStyle = previous ? getComputedStyle(element) : null;
  const interruptedFrame = currentStyle ? { opacity: currentStyle.opacity, transform: currentStyle.transform } : null;
  previous?.cancel();
  if (!element.animate || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return Promise.resolve(true);
  const hiddenFrame = { opacity: 0, transform: `translateY(${offset}px)` };
  const visibleFrame = { opacity: 1, transform: 'translateY(0)' };
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
  if (menuExpanded === expanded) return;
  menuExpanded = expanded;
  const menu = document.querySelector('#navigation-menu');
  document.querySelector('.menu-button')?.setAttribute('aria-expanded', String(expanded));
  if (!menu) return;
  menu.hidden = false;
  menu.inert = !expanded;
  animateSurface(menu, expanded, -10).then(finished => {
    if (finished && !menuExpanded && menu.isConnected) menu.hidden = true;
  });
}

function setComposerExpanded(expanded) {
  if (composerExpanded === expanded) return;
  composerExpanded = expanded;
  const composer = document.querySelector('.composer-area');
  const fab = document.querySelector('.answer-fab');
  if (!composer || !fab) return;
  const focusWasInside = composer.contains(document.activeElement);
  composer.hidden = false;
  composer.inert = !expanded;
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
  panel.classList.add('is-closing');
  panel.inert = true;
  animateSurface(panel, false, 24).then(finished => {
    if (!finished) return;
    panel.close();
    panel.classList.remove('is-closing');
    panel.inert = false;
  });
}

function save() {
  try { localStorage.setItem(storageKey, JSON.stringify(state)); storageWarning = ''; }
  catch { storageWarning = '進行状況を保存できません。ページを閉じると今回の変更は失われます。'; }
}

function messageMarkup(m) {
  if (m.kind === 'success') return `<div class="milestone">${icon('check')}<span>${esc(m.text)}</span></div>`;
  const own = m.kind === 'answer';
  return `<article class="message ${own ? 'own' : ''} ${m.kind === 'error' ? 'retry' : ''}">${own ? '' : '<span class="avatar" aria-hidden="true">案</span>'}<div class="message-body"><span class="speaker">${esc(m.speaker)}${m.problemId ? `<small>${esc(m.problemId)}</small>` : ''}</span><div class="bubble">${esc(m.text)}</div></div></article>`;
}

function answerFormMarkup(p) {
  const label = `${p.id}の回答`;
  if (p.type === 'text') {
    return `<form id="answer-form"><label class="sr-only" for="answer">${esc(label)}</label><div class="text-composer"><input id="answer" name="answer" type="text" placeholder="${esc(p.placeholder)}" autocomplete="off" required><button type="submit" class="send-button" aria-label="答えを送信">${icon('send')}</button></div></form>`;
  }
  return `<form id="answer-form"><fieldset class="answer-options"><legend class="sr-only">${esc(label)}</legend>${p.options.map(o => `<label class="option"><input id="${o.id}" type="${p.type === 'single' ? 'radio' : 'checkbox'}" name="answer" value="${esc(o.id)}" ${p.type === 'single' ? 'required' : ''}><span>${esc(o.label)}</span></label>`).join('')}<button type="submit" class="primary-button">答えを送信${icon('send')}</button></fieldset></form>`;
}

function render({ scroll = false } = {}) {
  const chatScrollTop = document.querySelector('.chat-area')?.scrollTop ?? 0;
  const p = current();
  const solved = state.solved.includes(p.id);
  const composerVisible = solved || composerExpanded;
  const index = scenario.problems.indexOf(p);
  const branchPending = solved && p.branches && !state.branches[p.id];
  app.innerHTML = `<div class="shell">
    <main id="main" class="workspace">
      <header class="topbar"><div class="brand"><div class="navigation-menu"><button class="menu-button" data-action="toggle-menu" aria-label="メニュー" aria-controls="navigation-menu" aria-expanded="${menuExpanded}">${icon('menu')}</button><nav id="navigation-menu" class="menu-items" aria-label="メインメニュー" ${menuExpanded ? '' : 'hidden'}><button class="active" data-action="chat" aria-current="page">${icon('chat')}<span>トーク</span></button><button data-action="hints">${icon('hint')}<span>ヒント</span></button><button data-action="notebook">${icon('book')}<span>ノート</span>${unlockedCards(scenario, state).length ? `<small class="nav-badge">${unlockedCards(scenario, state).length}</small>` : ''}</button><button data-action="history">${icon('history')}<span>履歴</span></button></nav></div><span class="brand-title">${esc(scenario.title)}</span></div><button class="hint-button" data-action="hints" aria-label="ヒント">${icon('hint')}<span>ヒント</span></button></header>
      <section class="chat-area" aria-label="謎解き会話">
        <div id="messages" class="messages" role="log" aria-label="会話" aria-live="polite" aria-relevant="additions text">${state.messages.map(messageMarkup).join('')}</div>
        ${branchPending ? `<div class="branch-options" aria-label="会話の選択肢">${p.branches.map(b => `<button data-action="branch" data-id="${esc(b.id)}">${esc(b.label)}${icon('arrow')}</button>`).join('')}</div>` : ''}
        <div class="chapter-end ${solved ? '' : 'hidden'}"><span>${esc(p.instruction)}</span></div>
      </section>
      <section id="composer-area" class="composer-area" aria-label="問題と回答" ${composerVisible ? '' : 'hidden'}>
        <div class="answer-composer-heading"><h2><span class="question-tag">${esc(p.id)}</span>${esc(p.title)}</h2>${solved ? '' : `<button class="composer-close" data-action="close-composer" aria-label="回答エリアを閉じる">${icon('close')}</button>`}</div>
        <div class="answer-problem"><p>${esc(p.prompt)}</p></div>
        ${solved ? '' : '<div class="answer-entry-label">回答欄</div>'}

        ${solved ? `<div class="solved-composer"><span class="solved-label">${icon('check')}${esc(p.id)}は正解しました</span>${branchPending ? '<span class="muted">会話の選択肢を選んでください</span>' : index < scenario.problems.length - 1 ? `<button class="primary-button" data-action="next">次の問題へ${icon('arrow')}</button>` : '<button class="primary-button" data-action="history">会話を読み返す</button>'}</div>` : answerFormMarkup(p)}
        ${solved ? '<div class="composer-meta"><span>会話はあとから読み返せます。</span></div>' : p.type === 'text' ? '' : `<div class="composer-meta"><span>${p.type === 'multiple' ? '当てはまるものをすべて選んでください。' : 'ひとつ選んでください。'}</span></div>`}
        <div class="feedback" role="status">${esc(feedback || storageWarning)}</div>
      </section>
      ${solved ? '' : `<button class="answer-fab" data-action="open-composer" aria-label="回答エリアを開く" aria-controls="composer-area" aria-expanded="${composerExpanded}" ${composerExpanded ? 'hidden' : ''}>${icon('edit')}<span>回答</span></button>`}
    </main>
  </div>`;
  document.querySelector('.chat-area').scrollTop = chatScrollTop;
  if (scroll) requestAnimationFrame(() => document.querySelector('.chat-area').scrollTo({ top: document.querySelector('.chat-area').scrollHeight, behavior: 'smooth' }));
}

function openPanel(kind, { keepFocus = false } = {}) {
  const wasOpen = panel.open;
  surfaceAnimations.get(panel)?.cancel();
  panel.classList.remove('is-closing');
  panel.inert = false;
  const focusedId = keepFocus ? document.activeElement?.id : null;
  let title = '';
  let content = '';
  const p = current();
  if (kind === 'hints') {
    title = 'ヒント';
    const count = state.hints[p.id] ?? 0;
    content = `<p class="panel-intro">${esc(p.id)} · ${esc(p.title)}<br>必要なところまで、少しずつ。</p><div class="hint-list">${p.hints.slice(0, count).map((h, i) => `<section class="hint-card"><span class="eyebrow">HINT ${String(i + 1).padStart(2, '0')}</span><p>${esc(h)}</p></section>`).join('') || '<div class="empty-state">まだヒントを開いていません。</div>'}</div>${count < p.hints.length ? `<button id="reveal-hint" class="primary-button full" data-action="reveal-hint">${count ? '次のヒントを見る' : '最初のヒントを見る'}<span>${count + 1} / ${p.hints.length}</span></button>` : '<p class="muted">すべてのヒントを表示しました。</p>'}<details class="answer-reveal"><summary>答えと解説を見る</summary><p>${esc(p.explanation)}</p></details>`;
  } else if (kind === 'history') {
    title = '会話履歴';
    content = `<p class="panel-intro">正解後の会話を、いつでも読み返せます。</p>${scenario.problems.filter(item => state.solved.includes(item.id)).map(item => `<details class="log-entry" open><summary><span class="question-tag">${esc(item.id)}</span>${esc(item.title)}</summary><div class="history-messages">${state.messages.filter(m => m.problemId === item.id && !['error', 'answer'].includes(m.kind)).map(messageMarkup).join('')}</div></details>`).join('') || '<div class="empty-state">まだ履歴はありません。<br>最初の問題に答えてみましょう。</div>'}`;
  } else if (kind === 'notebook') {
    title = '考察ノート';
    const cards = unlockedCards(scenario, state);
    content = `<p class="panel-intro">集めた手がかりを2枚選んで、組み合わせてみましょう。</p><form id="combine-form"><div class="card-grid">${cards.map(c => `<label class="evidence-card"><input type="checkbox" name="card" value="${esc(c.id)}"><span class="card-code">${esc(c.id)}</span><span class="card-mark">${esc(c.mark)}</span><strong>${esc(c.title)}</strong><span class="card-copy">${esc(c.text)}</span></label>`).join('') || '<div class="empty-state">問題に正解すると、ここに<br>手がかりが届きます。</div>'}</div>${cards.length >= 2 ? '<button class="primary-button full" type="submit">2枚の手がかりを組み合わせる</button>' : ''}</form><div id="combine-feedback" role="status"></div><div class="findings">${scenario.combinations.filter(c => state.combinations.includes(c.id)).map(c => `<section class="finding"><span class="eyebrow">DISCOVERY · ${esc(c.cards.join(' + '))}</span><h3>${esc(c.title)}</h3><p>${esc(c.text)}</p></section>`).join('')}</div>`;
  } else if (kind === 'help') {
    title = '使い方';
    content = '<div class="help-copy"><p>冊子の問題を解いて、対応する問題番号に答えを送ってください。正解すると、会話と次の指示が届きます。</p><h3>迷ったときは</h3><p>「ヒント」から段階的に手がかりを開けます。答えと解説は、その下から確認できます。</p><h3>手がかりをつなぐ</h3><p>正解で届くカードは「考察ノート」に集まります。2枚選んで、新しい情報を探してみてください。</p><h3>途中から再開する</h3><p>進行状況はこのブラウザに保存します。同じブラウザで開けば、続きから再開できます。</p><button class="reset-link" data-action="reset">はじめからやり直す</button><div class="demo-note">文章入力は「11月」、次は「12月」、最後は「A1・B1」で答え合わせができます。</div></div>';
  } else if (kind === 'reset') {
    title = 'はじめからやり直す';
    content = '<p class="panel-intro">このブラウザの会話、正解記録、ヒント、考察ノートを消して、最初から始めます。</p><div class="reset-actions"><button class="secondary-button" data-action="close">キャンセル</button><button class="primary-button" data-action="confirm-reset">進行をリセットする</button></div>';
  }
  panel.innerHTML = `<div class="panel-header"><div><span class="eyebrow">NOVEMBER ARCHIVE</span><h2 id="panel-title">${title}</h2></div><button class="icon-button" data-action="close" aria-label="閉じる">${icon('close')}</button></div><div class="panel-body">${content}</div>`;
  if (!panel.open) panel.showModal();
  animateSurface(wasOpen ? panel.querySelector('.panel-body') : panel, true, wasOpen ? 8 : 24);
  (focusedId ? document.getElementById(focusedId) : panel.querySelector('[data-action="close"]'))?.focus();
}

function selectProblem(id) {
  if (!scenario.problems.some(p => p.id === id)) return;
  state = { ...state, selected: id }; feedback = ''; save(); render();
  if (composerExpanded) animateSurface(document.querySelector('.composer-area'), true, 8);
}

function answer(value) {
  const result = submitAnswer(scenario, state, value);
  state = result.state;
  if (result.status === 'correct') composerExpanded = false;
  feedback = result.status === 'empty' ? '答えを入力・選択してください。' : result.status === 'incorrect' ? 'もう一度、答えを送ってみましょう。' : '';
  save(); render({ scroll: true });
  if (!state.solved.includes(state.selected)) document.querySelector('#answer')?.focus();
  return { status: result.status, problemId: state.selected };
}

document.addEventListener('click', event => {
  const button = event.target.closest('[data-action]');
  const action = button?.dataset.action;
  if (!event.target.closest('.navigation-menu') || event.target.closest('.menu-items [data-action]')) setMenuExpanded(false);
  if (!button) return;
  if (action === 'toggle-menu') setMenuExpanded(!menuExpanded);
  else if (action === 'chat') { closePanel(); document.querySelector('.menu-button')?.focus({ preventScroll: true }); }
  else if (action === 'open-composer') setComposerExpanded(true);
  else if (action === 'close-composer') setComposerExpanded(false);
  else if (action === 'select') selectProblem(button.dataset.id);
  else if (['hints', 'history', 'notebook', 'help', 'reset'].includes(action)) openPanel(action);
  else if (action === 'close') closePanel();
  else if (action === 'next') { composerExpanded = false; selectProblem(scenario.problems[scenario.problems.indexOf(current()) + 1]?.id); }
  else if (action === 'branch') { state = chooseBranch(scenario, state, state.selected, button.dataset.id); save(); render({ scroll: true }); }
  else if (action === 'reveal-hint') { state.hints[state.selected] = Math.min((state.hints[state.selected] ?? 0) + 1, current().hints.length); save(); openPanel('hints', { keepFocus: true }); }
  else if (action === 'confirm-reset') { state = initialState(scenario); composerExpanded = false; feedback = ''; save(); closePanel(); render(); }
});
document.addEventListener('keydown', event => {
  if (event.key !== 'Escape' || panel.open) return;
  if (menuExpanded) {
    setMenuExpanded(false); document.querySelector('.menu-button')?.focus({ preventScroll: true });
  } else if (composerExpanded) setComposerExpanded(false);
});
document.addEventListener('submit', event => {
  if (event.target.id === 'answer-form') {
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
render();

// ブラウザが対応している場合だけ、画面と同じ操作をWebMCPへ登録します。
const modelContext = document.modelContext;
if (modelContext?.registerTool) {
  const lifecycle = new AbortController();
  const tool = { name: 'submit_puzzle_answer', title: '謎の答えを送る', description: '現在選択中の問題に回答し、正誤判定と会話の更新を行います。選択問題には選択肢IDの配列を渡します。', inputSchema: { type: 'object', properties: { answer: { anyOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }] } }, required: ['answer'], additionalProperties: false }, annotations: { readOnlyHint: false, untrustedContentHint: false }, execute(input) {
    if (!input || Object.keys(input).some(k => k !== 'answer') || !(typeof input.answer === 'string' || Array.isArray(input.answer) && input.answer.every(a => typeof a === 'string'))) throw new Error('答えの形式が正しくありません。');
    if (current().type === 'text' ? typeof input.answer !== 'string' : !Array.isArray(input.answer) || input.answer.some(a => !current().options.some(o => o.id === a))) throw new Error('問題の回答形式に合わせてください。');
    return answer(input.answer);
  } };
  try { Promise.resolve(modelContext.registerTool(tool, { signal: lifecycle.signal })).catch(() => {}); } catch { /* 対応状況により登録できない場合も、画面の操作は利用できます。 */ }
  window.addEventListener('pagehide', () => lifecycle.abort(), { once: true });
}
