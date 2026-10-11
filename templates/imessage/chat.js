/* Browser-side renderer for the iMessage theme.
 *
 * Node drives this page through window.ChatShorts:
 *   configure(payload)  - apply theme/metrics/frame and receive precomputed layouts
 *   measure(texts, w)   - measure wrapped bubble text with the real font + width
 *   setState(state)     - draw exactly the messages revealed so far, at a scroll offset
 *   verify(state)       - re-check the currently drawn state (overflow, counts, sides)
 *
 * Only revealed messages are present in the DOM; future messages are never drawn.
 */
(function () {
  const $ = (id) => document.getElementById(id);
  const root = document.documentElement;
  const store = { metrics: null, frame: null, convs: new Map(), current: null, viewportH: 0 };
  const FONT_WEIGHTS = [400, 500, 600];

  function setVars(vars) {
    for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);
  }

  async function loadFonts() {
    await Promise.all(FONT_WEIGHTS.map((w) => document.fonts.load(`${w} 46px ChatShortsInter`, 'Hello')));
    await document.fonts.ready;
  }

  function configure(payload) {
    const { metrics: m, theme: t, frame: f, viewportH, conversations } = payload;
    store.metrics = m;
    store.frame = f;
    store.viewportH = viewportH;
    setVars({
      '--frame-x': f.x + 'px', '--frame-y': f.y + 'px', '--frame-w': f.w + 'px', '--frame-h': f.h + 'px',
      '--frame-radius': f.radius + 'px',
      '--status-h': m.statusBarPx + 'px', '--header-h': m.headerPx + 'px', '--input-h': m.inputBarPx + 'px',
      '--viewport-h': viewportH + 'px',
      '--font': m.fontFamily,
      '--bubble-font': m.bubbleFontPx + 'px', '--bubble-lh': m.bubbleLineHeightPx + 'px',
      '--bubble-px': m.bubblePadX + 'px', '--bubble-py': m.bubblePadY + 'px',
      '--side-pad': m.sidePadPx + 'px', '--avatar': m.avatarSizePx + 'px', '--avatar-slot': m.avatarSlotPx + 'px',
      '--header-avatar': m.headerAvatarPx + 'px',
      '--name-font': m.nameFontPx + 'px', '--name-h': m.nameHeightPx + 'px',
      '--ts-font': m.timestampFontPx + 'px', '--ts-h': m.timestampHeightPx + 'px',
      '--screen-bg': t.screenBg, '--recv-bubble': t.recvBubble, '--recv-text': t.recvText,
      '--send-bubble': t.sendBubble, '--send-text': t.sendText, '--header-text': t.headerText,
      '--sub-text': t.subText, '--divider': t.divider, '--input-bg': t.inputBg, '--input-field': t.inputField,
      '--input-border': t.inputBorder, '--placeholder': t.placeholder,
    });
    store.convs = new Map();
    for (const c of conversations) store.convs.set(c.id, c);
    store.current = null;
    $('content').innerHTML = '';
    return loadFonts().then(() => ({ ok: true, conversations: store.convs.size }));
  }

  // Measure wrapped text exactly as a bubble would render it.
  function measure(texts, innerMaxWidth) {
    const box = $('measure');
    box.style.setProperty('--m-max', innerMaxWidth + 'px');
    const lineHeight = store.metrics.bubbleLineHeightPx;
    return loadFonts().then(() => texts.map((text) => {
      const span = document.createElement('span');
      span.className = 'm-text';
      span.textContent = text;
      box.appendChild(span);
      const r = span.getBoundingClientRect();
      box.removeChild(span);
      return { width: Math.ceil(r.width), height: Math.round(r.height), lines: Math.max(1, Math.round(r.height / lineHeight)) };
    }));
  }

  function el(tag, cls, attrs) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (attrs) for (const [k, v] of Object.entries(attrs)) n.style[k] = v;
    return n;
  }

  function avatarNode(avatar, sizePx, x, y) {
    const d = el('div', 'avatar', { left: x + 'px', top: y + 'px', width: sizePx + 'px', height: sizePx + 'px' });
    if (avatar.kind === 'image') {
      const img = document.createElement('img');
      img.src = avatar.src;
      img.alt = '';
      d.appendChild(img);
    } else {
      d.style.background = avatar.color;
      const s = document.createElement('span');
      s.textContent = avatar.initials;
      d.appendChild(s);
    }
    return d;
  }

  function applyHeader(conv) {
    if (store.current === conv.id) return;
    const h = $('header-avatar');
    h.innerHTML = '';
    h.appendChild(avatarNode(conv.header.avatar, store.metrics.headerAvatarPx, 0, 0));
    $('header-title').textContent = conv.header.title;
    store.current = conv.id;
  }

  function setState(state) {
    const conv = store.convs.get(state.convId);
    if (!conv) throw new Error('unknown conversation ' + state.convId);
    applyHeader(conv);
    const content = $('content');
    content.innerHTML = '';
    content.style.height = conv.contentHeight + 'px';
    const count = Math.min(state.visibleCount, conv.items.length);
    for (let i = 0; i < count; i++) {
      const it = conv.items[i];
      const enter = state.enter && state.enter.index === i ? state.enter.progress : 1;
      const wrap = el('div', 'msg', {});
      wrap.dataset.index = String(i);
      wrap.dataset.mid = it.messageId;
      wrap.style.opacity = String(enter);
      if (enter < 1) wrap.style.transform = `translateY(${((1 - enter) * 18).toFixed(2)}px)`;
      if (it.name) {
        const n = el('div', 'name', { left: it.name.x + 'px', top: it.name.y + 'px' });
        n.textContent = it.name.text;
        wrap.appendChild(n);
      }
      if (it.timestamp) {
        const t = el('div', 'timestamp', { top: it.timestamp.y + 'px' });
        t.textContent = it.timestamp.text;
        wrap.appendChild(t);
      }
      const b = el('div', 'bubble ' + (it.side === 'right' ? 'send' : 'recv'), {
        left: it.x + 'px', top: it.y + 'px', width: it.width + 'px', height: it.height + 'px',
        borderRadius: it.radii.join('px ') + 'px',
      });
      b.dataset.index = String(i);
      const span = el('span', 'bubble-text');
      span.textContent = it.text;
      b.appendChild(span);
      wrap.appendChild(b);
      if (it.avatar) wrap.appendChild(avatarNode(it.avatar, store.metrics.avatarSizePx, it.avatar.x, it.avatar.y));
      content.appendChild(wrap);
    }
    content.style.transform = `translateY(${-Math.round(state.scrollY)}px)`;
    return { drawn: count };
  }

  // Checks the drawn DOM against the precomputed layout. Returns a list of issues.
  function verify(state) {
    const conv = store.convs.get(state.convId);
    const issues = [];
    const count = Math.min(state.visibleCount, conv.items.length);
    const bubbles = [...document.querySelectorAll('#content .bubble')];
    const wraps = [...document.querySelectorAll('#content .msg')];
    if (bubbles.length !== count) issues.push(`expected ${count} bubbles, found ${bubbles.length}`);
    for (const w of wraps) {
      if (Number(w.dataset.index) >= count) issues.push(`future message ${w.dataset.mid} is in the DOM`);
    }
    const fw = store.frame.w;
    bubbles.forEach((b, k) => {
      const i = Number(b.dataset.index);
      const it = conv.items[i];
      const span = b.querySelector('.bubble-text');
      const tol = 2;
      if (!it) return issues.push(`bubble ${k} has no layout item`);
      if (span.getBoundingClientRect().height - it.textHeight > tol || it.textHeight - span.getBoundingClientRect().height > tol) {
        issues.push(`${it.messageId}: rendered text height ${span.getBoundingClientRect().height.toFixed(1)} != measured ${it.textHeight}`);
      }
      if (b.scrollWidth > b.clientWidth + 1 || b.scrollHeight > b.clientHeight + 1) {
        issues.push(`${it.messageId}: text overflows bubble`);
      }
      if (span.scrollWidth > b.clientWidth + 1) issues.push(`${it.messageId}: text wider than bubble`);
      const isSend = b.classList.contains('send');
      if (isSend !== (it.side === 'right')) issues.push(`${it.messageId}: wrong side`);
      if (it.x < 0 || it.x + it.width > fw + 0.5) issues.push(`${it.messageId}: bubble outside screen width`);
      if (it.side === 'right' && Math.abs(it.x + it.width - (fw - store.metrics.sidePadPx)) > 1) issues.push(`${it.messageId}: right bubble not right-aligned`);
      if (it.side === 'left' && Math.abs(it.x - (store.metrics.sidePadPx + conv.leftInset)) > 1) {
        issues.push(`${it.messageId}: left bubble misaligned`);
      }
      if (it.name) {
        const nm = wraps[k] && wraps[k].querySelector('.name');
        if (!nm || nm.textContent !== it.name.text) issues.push(`${it.messageId}: sender name missing or wrong`);
      }
    });
    for (const w of wraps) {
      const ts = w.querySelector('.timestamp');
      if (ts && Math.abs(ts.getBoundingClientRect().width - fw) > 1) {
        issues.push(`timestamp for ${w.dataset.mid} does not span the screen width`);
      }
    }
    const title = $('header-title').textContent;
    if (title !== conv.header.title) issues.push(`header title "${title}" != "${conv.header.title}"`);
    return { ok: issues.length === 0, issues, drawn: bubbles.length };
  }

  window.ChatShorts = { configure, measure, setState, verify };
})();
