(function () {
  'use strict';

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var finePointer = window.matchMedia('(pointer: fine)').matches;

  /* -------------------------------------------------------
     ローディング（トップの初回表示時のみ）
     ------------------------------------------------------- */
  (function loader() {
    var el = document.querySelector('.loader');
    if (!el) return;

    var seen = false;
    try { seen = sessionStorage.getItem('tk-loaded') === '1'; } catch (e) {}

    if (seen || reduceMotion) {
      el.setAttribute('data-done', 'true');
      return;
    }

    function finish() {
      el.setAttribute('data-done', 'true');
      try { sessionStorage.setItem('tk-loaded', '1'); } catch (e) {}
    }

    window.addEventListener('load', function () { setTimeout(finish, 900); });
    setTimeout(finish, 3200);
  })();

  /* -------------------------------------------------------
     モバイル用のナビゲーション開閉
     ------------------------------------------------------- */
  (function navToggle() {
    var toggle = document.querySelector('.nav-toggle');
    var nav = document.querySelector('.global-nav');
    if (!toggle || !nav) return;

    toggle.addEventListener('click', function () {
      var open = toggle.getAttribute('aria-expanded') === 'true';
      toggle.setAttribute('aria-expanded', String(!open));
      nav.setAttribute('data-open', String(!open));
    });

    // ページ内リンク（概要など）はその場で移動するので、開いたままにしない
    nav.addEventListener('click', function (e) {
      var link = e.target.closest ? e.target.closest('a') : null;
      if (!link) return;
      toggle.setAttribute('aria-expanded', 'false');
      nav.setAttribute('data-open', 'false');
    });

    window.addEventListener('resize', function () {
      if (window.innerWidth > 860) {
        toggle.setAttribute('aria-expanded', 'false');
        nav.setAttribute('data-open', 'false');
      }
    });
  })();

  /* -------------------------------------------------------
     いま見ている章をナビゲーションに反映する
     （1ページ完結なので、ページ単位ではなく章単位で示す）
     ------------------------------------------------------- */
  (function navCurrent() {
    var links = [].slice.call(document.querySelectorAll('.global-nav a[href*="#"]'));
    if (!links.length) return;

    var map = [];
    links.forEach(function (link) {
      var id = link.getAttribute('href').split('#')[1];
      var section = id && document.getElementById(id);
      if (section) map.push({ link: link, section: section });
    });
    if (!map.length) return;

    function mark(active) {
      map.forEach(function (item) {
        if (item.link === active) item.link.setAttribute('aria-current', 'true');
        else item.link.removeAttribute('aria-current');
      });
    }

    if (!('IntersectionObserver' in window)) return;

    var visible = [];
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        var i = visible.indexOf(entry.target);
        if (entry.isIntersecting && i < 0) visible.push(entry.target);
        if (!entry.isIntersecting && i >= 0) visible.splice(i, 1);
      });

      // 画面のより上にある章を「いまの章」とみなす
      var top = null;
      visible.forEach(function (el) {
        if (!top || el.offsetTop < top.offsetTop) top = el;
      });

      mark(top ? (map.filter(function (m) { return m.section === top; })[0] || {}).link : null);
    }, { rootMargin: '-45% 0px -45% 0px' });

    map.forEach(function (item) { observer.observe(item.section); });
  })();

  /* -------------------------------------------------------
     舞い落ちる葉（ヒーローを見ている間だけ）
     ------------------------------------------------------- */
  (function leaves() {
    var box = document.querySelector('.leaves');
    if (!box || reduceMotion) return;

    var COUNT = window.innerWidth < 720 ? 9 : 15;
    var LEAF = '<svg viewBox="0 0 24 40" fill="currentColor" aria-hidden="true">' +
               '<path d="M12 0C19.5 11 22 27 12 40 2 27 4.5 11 12 0Z"/>' +
               '<path d="M12 4v33" stroke="#1c1b19" stroke-width="1.1" opacity=".4"/>' +
               '</svg>';

    function rand(min, max) { return min + Math.random() * (max - min); }

    var frag = document.createDocumentFragment();

    for (var i = 0; i < COUNT; i++) {
      var leaf = document.createElement('span');
      leaf.className = 'leaf';

      // 一枚ごとに大きさ・速さ・揺れ幅を変えて、同じ動きが揃わないようにする
      leaf.style.setProperty('--x', rand(-4, 100).toFixed(1) + '%');
      leaf.style.setProperty('--size', rand(11, 26).toFixed(0) + 'px');
      leaf.style.setProperty('--fall', rand(13, 26).toFixed(1) + 's');
      leaf.style.setProperty('--sway', rand(3.4, 6.5).toFixed(1) + 's');
      leaf.style.setProperty('--delay', (-rand(0, 22)).toFixed(1) + 's');
      leaf.style.setProperty('--drift', rand(-140, 180).toFixed(0) + 'px');
      leaf.style.setProperty('--amp', rand(14, 42).toFixed(0) + 'px');
      leaf.style.setProperty('--tilt-a', rand(-70, -10).toFixed(0) + 'deg');
      leaf.style.setProperty('--tilt-b', rand(10, 80).toFixed(0) + 'deg');
      leaf.style.setProperty('--opa', rand(0.16, 0.46).toFixed(2));

      var inner = document.createElement('span');
      inner.className = 'leaf__inner';
      inner.innerHTML = LEAF;
      leaf.appendChild(inner);
      frag.appendChild(leaf);
    }

    box.appendChild(frag);
  })();

  /* -------------------------------------------------------
     見出しを1文字ずつに分割する
     テキストノードだけを対象にするので、<br> や装飾用の span は壊れない
     ------------------------------------------------------- */
  function splitChars(el, step) {
    var walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null, false);
    var textNodes = [];
    while (walker.nextNode()) textNodes.push(walker.currentNode);

    var index = 0;
    textNodes.forEach(function (node) {
      var frag = document.createDocumentFragment();
      node.nodeValue.split('').forEach(function (ch) {
        if (ch.trim() === '') {
          frag.appendChild(document.createTextNode(ch));
          return;
        }
        var span = document.createElement('span');
        span.className = 'char';
        span.textContent = ch;
        span.style.setProperty('--char-delay', (index * step) + 'ms');
        index += 1;
        frag.appendChild(span);
      });
      node.parentNode.replaceChild(frag, node);
    });
  }

  (function initSplit() {
    if (reduceMotion) return;
    document.querySelectorAll('[data-split]').forEach(function (el) {
      var step = parseInt(el.getAttribute('data-split'), 10) || 40;
      splitChars(el, step);
    });
  })();

  /* -------------------------------------------------------
     スクロールで要素を出現させる
     ------------------------------------------------------- */
  (function reveal() {
    var targets = document.querySelectorAll('[data-reveal]');
    if (!targets.length) return;

    document.querySelectorAll('[data-stagger]').forEach(function (group) {
      var step = parseInt(group.getAttribute('data-stagger'), 10) || 90;
      group.querySelectorAll('[data-reveal]').forEach(function (child, i) {
        child.style.setProperty('--reveal-delay', (i * step) + 'ms');
      });
    });

    if (reduceMotion || !('IntersectionObserver' in window)) {
      targets.forEach(function (el) { el.classList.add('is-visible'); });
      return;
    }

    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      });
    }, { rootMargin: '0px 0px -12% 0px', threshold: 0.06 });

    targets.forEach(function (el) { observer.observe(el); });
  })();

  /* -------------------------------------------------------
     マウスに追従する光と、面のホバー
     ------------------------------------------------------- */
  (function pointerLight() {
    if (reduceMotion || !finePointer) return;

    var glow = document.querySelector('.glow');
    var photo = document.querySelector('.hero__photo');
    var hero = document.querySelector('.hero');
    var lifts = document.querySelectorAll('.lift');

    var px = 0, py = 0, ticking = false;

    function paint() {
      if (glow) {
        glow.style.setProperty('--gx', px + 'px');
        glow.style.setProperty('--gy', py + 'px');
      }

      // ヒーローの写真は、画面中央からのずれに応じてゆっくり逆方向へ動かす
      if (photo && hero) {
        var r = hero.getBoundingClientRect();
        if (r.bottom > 0) {
          var dx = (px - window.innerWidth / 2) / window.innerWidth;
          var dy = (py - window.innerHeight / 2) / window.innerHeight;
          photo.style.setProperty('--mx', (dx * -26).toFixed(1) + 'px');
          photo.style.setProperty('--my', (dy * -20).toFixed(1) + 'px');
        }
      }

      ticking = false;
    }

    window.addEventListener('mousemove', function (e) {
      px = e.clientX;
      py = e.clientY;
      if (glow && !glow.classList.contains('is-on')) glow.classList.add('is-on');
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(paint);
    }, { passive: true });

    document.addEventListener('mouseleave', function () {
      if (glow) glow.classList.remove('is-on');
    });

    // 面の内側では、触れている位置を明るくする
    lifts.forEach(function (el) {
      el.addEventListener('mousemove', function (e) {
        var r = el.getBoundingClientRect();
        el.style.setProperty('--lx', (e.clientX - r.left) + 'px');
        el.style.setProperty('--ly', (e.clientY - r.top) + 'px');
      }, { passive: true });
    });
  })();

  /* -------------------------------------------------------
     スクロールに連動する値の更新
     ------------------------------------------------------- */
  (function scrollEffects() {
    var progress = document.querySelector('.scroll-progress');
    var header = document.querySelector('.site-header');
    var leafBox = document.querySelector('.leaves');
    var photo = document.querySelector('.hero__photo');
    var root = document.documentElement;
    var ticking = false;

    function update() {
      var y = window.pageYOffset || root.scrollTop;

      if (progress) {
        var max = root.scrollHeight - window.innerHeight;
        progress.style.transform = 'scaleX(' + (max > 0 ? Math.min(y / max, 1) : 0) + ')';
      }

      if (header) header.classList.toggle('is-scrolled', y > 40);

      // 葉は最初の画面を見ている間だけ
      if (leafBox) leafBox.setAttribute('data-hidden', String(y > 40));

      if (reduceMotion) { ticking = false; return; }

      // 写真は文字よりゆっくり沈める
      if (photo) photo.style.setProperty('--photo-shift', (y * 0.14) + 'px');

      ticking = false;
    }

    function onScroll() {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(update);
    }

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });

    // タブが裏に回っている間は requestAnimationFrame が止まるので、
    // 戻ってきたときに待ち状態を解除しておく
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState !== 'visible') return;
      ticking = false;
      onScroll();
    });

    update();
  })();

})();
