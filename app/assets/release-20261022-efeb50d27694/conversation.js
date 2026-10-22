// 短いセリフにも間を取り、長文は読み終わる時間を長めにする。
export function readingDelay(message) {
  if (message.kind === 'answer' || message.kind === 'success') return 650;
  return Math.min(6500, Math.max(1800, Array.from(message.text).length * 65));
}

export function latestSceneStart(messages, problemId) {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].kind === 'answer' && messages[i].problemId === problemId) return i;
  }
  return messages.some(message => message.problemId) ? messages.length : 0;
}

export function createConversationPlayer({ onMessage, onComplete, schedule = setTimeout, cancel = clearTimeout }) {
  let timer;
  let generation = 0;
  function stop() {
    generation++;
    cancel(timer);
    timer = undefined;
  }
  function play(messages) {
    stop();
    const run = generation;
    let index = 0;
    function next() {
      if (run !== generation) return;
      if (index === messages.length) { timer = undefined; onComplete(); return; }
      const message = messages[index++];
      onMessage(message);
      if (run === generation) timer = schedule(next, readingDelay(message));
    }
    timer = schedule(next, 300);
  }
  return { play, stop };
}
