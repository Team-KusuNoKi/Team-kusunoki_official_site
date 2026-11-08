import { initialPuzzle, applyPuzzleMove, squareFor, MAX_MOVES, REQUIRED_MOVES } from './hex-cube-model.js';
import { showHexSuccess } from './hex-success.js';

export function mountHexCube(host, { onComplete, canInteract }) {
  host.innerHTML = `<section class="hex-game" aria-label="控室の問題"><div class="hex-layout"><section class="hex-rules"><h2>ルール</h2><p>①すべての“面”に色をつけてください<br>②押した“面”に隣接する面の色が反転します。</p></section><section class="hex-board" aria-label="パズルの表示エリア"><div class="hex-mode-row"><div class="hex-modes" aria-label="現在のモード"><span data-mode="2">2D</span><span data-mode="3">3D</span></div><div class="hex-pick-steps" aria-label="三角形を2回選択" hidden><span data-pick-step="1">①</span><span aria-hidden="true">→</span><span data-pick-step="2">②</span></div></div><svg class="hex-shape" viewBox="100 0 400 380" aria-label="向きが固定された図形"><g class="hex-faces"></g><g class="hex-edges" aria-hidden="true"></g><text class="hex-pick-number" text-anchor="middle" dominant-baseline="central" aria-hidden="true"></text></svg><button type="button" class="hex-reset">やり直す</button></section></div><p class="hex-status" role="status" aria-live="polite"></p></section>`;
  const root = host.querySelector('.hex-game'), svg = host.querySelector('svg'), faces = [], status = host.querySelector('.hex-status');
  root.insertAdjacentHTML('beforeend', `<dialog class="hex-failure" aria-labelledby="hex-failure-title" aria-describedby="hex-failure-detail">
    <h2 id="hex-failure-title">失敗</h2>
    <p id="hex-failure-detail">最短な手ではありません</p>
    <button type="button">やり直す</button>
  </dialog>`);
  const failure = root.querySelector('.hex-failure');
  let puzzle = initialPuzzle(), moves = [], pending = -1, hovered = -1, invalid = [], errorTimer = null, suppressHover = false, disposed = false, submitting = false;
  let secondPick = -1;
  let success;
  let endPickFeedback;
  function flashSecondPick(index) {
    secondPick = index;
    return new Promise(resolve => {
      const timer = setTimeout(() => {
        endPickFeedback();
        render();
      }, 450);
      endPickFeedback = () => {
        clearTimeout(timer);
        secondPick = -1;
        endPickFeedback = undefined;
        resolve();
      };
    });
  }
  const ns = 'http://www.w3.org/2000/svg';
  function node(tag, attrs) {
    const el = document.createElementNS(ns,tag);
    for (const [key,value] of Object.entries(attrs)) el.setAttribute(key,value);
    return el;
  }
  function enabled() { return !disposed && !submitting && canInteract(); }
  function render() {
    const selecting = puzzle.mode === 3 && !puzzle.colors.every(Boolean);
    root.querySelector('.hex-pick-steps').hidden = !selecting;
    root.querySelectorAll('[data-pick-step]').forEach(el => {
      const active = Number(el.dataset.pickStep) === (pending < 0 ? 1 : 2);
      el.classList.toggle('active', active);
      el.setAttribute('aria-current', String(selecting && active));
    });
    const number = root.querySelector('.hex-pick-number');
    const marked = secondPick >= 0 ? secondPick : pending;
    number.textContent = secondPick >= 0 ? '②' : pending >= 0 ? '①' : '';
    if (marked >= 0) {
      number.setAttribute('x', (300 + vertices[marked][0] + vertices[(marked+1)%6][0]) / 3);
      number.setAttribute('y', (190 + vertices[marked][1] + vertices[(marked+1)%6][1]) / 3);
    }
    faces.forEach((face,index) => {
      face.setAttribute('fill', puzzle.colors[index] ? '#e9b97f' : '#fffef7');
      face.classList.toggle('hovered', index === hovered || index === pending);
      face.classList.toggle('invalid', invalid.includes(index));
      face.setAttribute('aria-pressed', String(index === pending));
      face.setAttribute('aria-disabled', String(!enabled() || puzzle.colors.every(Boolean)));
      face.setAttribute('aria-label',`エリア${index+1}、${puzzle.colors[index]?'色つき':'白'}。${puzzle.mode===2?'三角形を1つ選択':'三角形を2つ選んで面を確定'}`);
    });
    root.querySelectorAll('[data-mode]').forEach(el => {
      const active = Number(el.dataset.mode) === puzzle.mode;
      el.classList.toggle('active',active); el.setAttribute('aria-current',String(active));
    });
    svg.setAttribute('aria-label',`向きが固定された図形。現在は${puzzle.mode}D。`);
    root.querySelector('.hex-reset').disabled = !enabled();
  }
  function clearError() {
    if (errorTimer !== null) clearTimeout(errorTimer);
    errorTimer = null; invalid = []; root.classList.remove('hex-shake');
  }
  function rejectPair(first,second) {
    invalid = [...new Set([first,second])];
    status.textContent = '正方形の面になりません。三角形を2つ選び直してください。';
    render(); void root.getBoundingClientRect(); root.classList.add('hex-shake');
    errorTimer = setTimeout(() => { errorTimer=null; invalid=[]; root.classList.remove('hex-shake'); if(!disposed)render(); },650);
  }
  function choose(index) {
    if (!enabled() || puzzle.colors.every(Boolean)) return;
    hovered=-1; suppressHover=true; clearError();
    endPickFeedback?.();
    let move, feedbackFinished;
    if (puzzle.mode === 3) {
      if (pending < 0) { pending=index; status.textContent='①を選択しました。②としてもう1つの三角形を選んでください。'; render(); return; }
      const first=pending; pending=-1;
      feedbackFinished = flashSecondPick(index);
      if (!squareFor(first,index)) { rejectPair(first,index); return; }
      move=[first,index];
    } else move=[index];
    if (moves.length >= MAX_MOVES) { status.textContent='「やり直す」から再開してください。'; render(); return; }
    puzzle=applyPuzzleMove(puzzle,move); moves.push(move); render();
    if (puzzle.colors.every(Boolean)) {
      if (moves.length !== REQUIRED_MOVES) {
        failure.showModal();
        return;
      }
      submitting=true; status.textContent='クリアしました。記録を保存しています。'; render();
      success = showHexSuccess(root);
      const continueToReward = Promise.all([feedbackFinished, success.finished]);
      Promise.resolve().then(() => onComplete(moves.map(move=>[...move]), continueToReward)).catch(() => {}).finally(() => {
        submitting=false;
        if (!disposed) { status.textContent='クリア済みです。通信を確認して保存結果を確認してください。'; render(); }
      });
    } else status.textContent=`次は${puzzle.mode}Dです。`;
  }
  const vertices=Array.from({length:6},(_,i)=>{const angle=(-90+i*60)*Math.PI/180;return[300+158*Math.cos(angle),190+158*Math.sin(angle)];});
  for(let i=0;i<6;i++) {
    const polygon=node('polygon',{points:[[300,190],vertices[i],vertices[(i+1)%6]].map(p=>p.join(',')).join(' '),class:'hex-face',role:'button',tabindex:'0','data-area':i});
    polygon.addEventListener('click',()=>choose(i));
    polygon.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();choose(i);}});
    polygon.addEventListener('pointerenter',event=>{if(event.pointerType!=='touch'&&!suppressHover){hovered=i;render();}});
    polygon.addEventListener('pointermove',event=>{if(event.pointerType!=='touch'&&suppressHover){suppressHover=false;hovered=i;render();}});
    polygon.addEventListener('pointerleave',()=>{if(hovered===i){hovered=-1;render();}});
    polygon.addEventListener('pointercancel',()=>{hovered=-1;render();});
    faces.push(polygon); host.querySelector('.hex-faces').append(polygon);
  }
  for(const i of [0,2,4,1,3,5]) host.querySelector('.hex-edges').append(node('line',{x1:300,y1:190,x2:vertices[i][0],y2:vertices[i][1],class:'hex-edge'+(i%2===0?' hex-hidden':'')}));
  host.querySelector('.hex-edges').append(node('polygon',{points:vertices.map(p=>p.join(',')).join(' '),class:'hex-edge'}));
  function reset() {
    if (failure.open) failure.close();
    if(!enabled())return; endPickFeedback?.(); clearError(); puzzle=initialPuzzle(); moves=[]; pending=-1; hovered=-1; suppressHover=false; status.textContent='初期状態に戻しました。'; render();
  }
  root.querySelector('.hex-reset').addEventListener('click',reset);
  failure.querySelector('button').addEventListener('click',reset);
  failure.addEventListener('cancel',event=>{event.preventDefault();reset();});
  root.addEventListener('keydown',event=>{if(event.key==='Escape'&&pending>=0){event.preventDefault();pending=-1;hovered=-1;clearError();render();}});
  render();
  return { refresh:render, destroy(){disposed=true;success?.close();if(failure.open)failure.close();endPickFeedback?.();clearError();} };
}
