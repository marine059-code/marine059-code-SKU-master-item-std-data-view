/* ═══════════════════════════════════════════════════════════════
   품목조회 모듈 — 화면 (2026-11-02 정현 «품목조회 기능(인덱스, 설정기능 포함)을 먼저 분리»)
   ─────────────────────────────────────────────────────────────
   앱(web/app.js)의 품목조회 탭(ERP5) · 인덱스 탭 · 열 설정을 **조회 전용**으로 떼어 낸 것.
   데이터는 src 하나로만 받는다 — src_supabase.js(웹) 또는 src_app.js(PC 앱 API). 둘은 같은 모양의 답을 준다.
     src.view · saveView · dropView · search · distinct · one · tree · treeSearch · treeOf
   여기에 없는 것(앱에만): 셀 직접 수정 · 진행/구분/상태 칩 · ERP 차이 · 등록수정으로 넘기기 · 엑셀.

   ItemsWeb.start()            index.html 이 부른다 — config.js(window.ITEMS_CONFIG)를 보고 길을 고른다.
   ItemsWeb.mount(root, src)   다른 화면 안에 붙일 때.
   ═══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => [...(r || document).querySelectorAll(s)];
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  const N = x => Number(x || 0).toLocaleString('ko-KR');
  const LS = {
    get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (_) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) { } },
  };
  const KEY = '품번';
  const NOVAL = ['빈칸', '빈칸아님'];
  const MULTI = ['여럿중', '여럿빼고'];
  /* 한 번에 받는 줄 수 — 0 = 전체(기본 · 11-05 정현 «행조회 기본값 = 전체 · 200줄은 아래로 내려야 해서 불편»).
     전체여도 그리는 줄은 보이는 만큼만(가상 스크롤). 서버는 한 번에 ALL_ROWS·셀 예산(40만 칸)까지 — «전체» 면 나머지를 곧바로 이어 받고,
     줄 수를 정했으면 아래로 밀 때 이어 붙는다. */
  const PS_OPTS = [0, 100, 200, 500, 1000, 2000, 5000];
  const ALL_ROWS = 10000;
  const PS_KEY = 'olive_items_ps2';                 // 옛 키(olive_items_ps · 기본 200)는 버림 — 모두 «전체» 에서 시작
  const psLabel = n => n ? N(n) + '줄' : '전체';

  /* 값 속 링크 — http(s) 주소만 누를 수 있게(새 탭 · 원래 창은 못 건드림) */
  function linkify(v) {
    const s = String(v == null ? '' : v);
    if (!/https?:\/\//i.test(s)) return esc(s);
    return s.split(/(https?:\/\/[^\s<>"']+)/gi).map((p, i) => i % 2
      ? `<a href="${esc(p)}" target="_blank" rel="noopener noreferrer">${esc(p)}</a>` : esc(p)).join('');
  }
  /* 대충의 글자 폭(px) — 한글은 넓게 */
  const textW = s => { let w = 0; for (const ch of String(s || '')) w += /[ᄀ-ᇿ㄰-㆏가-힣一-鿿]/.test(ch) ? 13 : 7.4; return w; };

  /* ── 떠 있는 값 고르기 창(엑셀 필터처럼) — 품목조회 머리글 ▾ · 인덱스 열 ▾ · 브랜드 가 같이 쓴다 ── */
  let POP = null;
  function closePop() { if (POP) { POP.remove(); POP = null; } }
  function valuePop(o) {
    closePop();
    const cur = new Set(o.selected || []);
    let vals = o.values || [];
    const pop = document.createElement('div'); POP = pop; pop.className = 'iwPop';
    pop.innerHTML = `<div class="iwPopHead"><b>${esc(o.title)}</b>${o.hint ? `<span class="hint small">${esc(o.hint)}</span>` : ''}</div>` +
      '<div class="iwPopBody"><input class="iwPopQ" type="search" placeholder="값 검색">' +
      `<div class="iwPopAll"><label><input type="checkbox" data-all> 모두 선택</label>${o.extraHtml || ''}</div>` +
      '<div class="iwPopList"></div>' +
      '<div class="iwPopFoot"><span class="iwPopCnt hint small"></span><span class="grow"></span>' +
      `<button type="button" class="b1" data-ok>적용</button>${o.onClear ? '<button type="button" data-none>조건 지우기</button>' : ''}</div></div>`;
    document.body.appendChild(pop);
    const r = o.anchor.getBoundingClientRect();
    const W = Math.min(320, window.innerWidth - 16);
    pop.style.width = W + 'px';
    pop.style.left = Math.max(8, Math.min(r.left, window.innerWidth - W - 8)) + 'px';
    pop.style.top = Math.max(8, Math.min(r.bottom + 6, window.innerHeight - 420)) + 'px';
    const list = $('.iwPopList', pop), cnt = $('.iwPopCnt', pop), all = $('[data-all]', pop), qi = $('.iwPopQ', pop);
    let listed = vals;
    const note = () => { cnt.textContent = cur.size ? `${N(cur.size)}개 고름` : (o.emptyNote || '고른 값 없음(= 전부)'); };
    const syncAll = () => { all.checked = listed.length > 0 && listed.every(v => cur.has(v.v)); };
    const draw = () => {
      const kw = qi.value.trim().toLowerCase();
      listed = vals.filter(v => !kw || String(v.label || v.v).toLowerCase().includes(kw) || String(v.v).toLowerCase().includes(kw));
      list.innerHTML = listed.length ? listed.map(v =>
        `<label class="iwPopRow"><input type="checkbox" value="${esc(v.v)}"${cur.has(v.v) ? ' checked' : ''}>` +
        `<span class="iwPopV">${v.html || esc(v.v === '' ? '(빈칸)' : (v.label || v.v))}</span><span class="iwPopN">${v.n == null ? '' : N(v.n)}</span></label>`).join('')
        : '<div class="empty">찾는 값이 없습니다.</div>';
      $$('.iwPopRow input', list).forEach(x => x.onchange = () => { x.checked ? cur.add(x.value) : cur.delete(x.value); note(); syncAll(); });
      syncAll();
    };
    all.onchange = () => { listed.forEach(v => all.checked ? cur.add(v.v) : cur.delete(v.v)); draw(); note(); };
    let t = 0;
    qi.oninput = () => {
      draw();
      if (o.remote) {                                  // 목록이 잘렸으면 서버에서 다시 찾는다
        clearTimeout(t);
        t = setTimeout(async () => { try { const more = await o.remote(qi.value.trim()); if (POP !== pop) return; const seen = new Set(vals.map(v => v.v)); more.forEach(v => { if (!seen.has(v.v)) vals.push(v); }); draw(); } catch (_) { } }, 250);
      }
    };
    qi.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); $('[data-ok]', pop).click(); } };
    $('[data-ok]', pop).onclick = () => { const all_ = vals.length; closePop(); o.onApply(cur, all_); };
    if (o.onClear) $('[data-none]', pop).onclick = () => { closePop(); o.onClear(); };
    if (o.wire) o.wire(pop, cur, () => { draw(); note(); });
    draw(); note(); qi.focus();
    setTimeout(() => document.addEventListener('mousedown', function out(e) {
      if (pop.contains(e.target)) return; document.removeEventListener('mousedown', out); if (POP === pop) closePop();
    }), 0);
    return pop;
  }

  function toast(msg, bad) {
    let t = $('#iwToast');
    if (!t) { t = document.createElement('div'); t.id = 'iwToast'; t.className = 'iwToast'; document.body.appendChild(t); }
    t.textContent = msg; t.classList.toggle('bad', !!bad); t.hidden = false;
    clearTimeout(toast._t); toast._t = setTimeout(() => { t.hidden = true; }, bad ? 6000 : 3200);
  }

  /* ════════════════════════════════════════════════════════════
     붙이기
     ════════════════════════════════════════════════════════════ */
  function mount(root, src, opts) {
    opts = opts || {};
    root.innerHTML = `
<header class="iwTop">
  <div class="iwBrand"><span class="iwMark" aria-hidden="true"></span><b>품목조회</b><span class="iwSub">${esc(opts.subtitle || '')}</span></div>
  <nav class="iwTabs" role="tablist">
    ${window.ItemsDash ? '<button type="button" role="tab" data-tab="dash">상품목록 대시보드</button>' : ''}
    <button type="button" role="tab" data-tab="view">품목조회</button>
    <button type="button" role="tab" data-tab="index">인덱스</button>
  </nav>
  <span class="grow"></span>
  <span class="iwStamp hint small" id="iwStamp"></span>
  <span class="iwUser" id="iwUser"></span>
  ${src.needsLogin ? '<button type="button" class="iwGhost" id="iwLogout">로그아웃</button>' : ''}
</header>
<section class="iwPane" id="iwView" data-pane="view">
  <div class="iwBar">
    <input id="vwQ" type="search" placeholder="품번 · 품명 · 규격 검색" autocomplete="off">
    <button type="button" class="tgl" id="vwColsBtn" title="무엇을 · 얼마나 넓게 볼지 정합니다">열 고르기</button>
    <button type="button" class="tgl" id="vwFilBtn" title="열마다 조건을 걸어 거릅니다">조건</button>
    <label class="iwPs" title="한 번에 받는 줄 수 — 기본 «전체». 줄을 정하면 아래로 밀 때 다음이 이어 붙습니다(이 기기에 저장)">보기
      <select id="vwPs">${PS_OPTS.map(n => `<option value="${n}">${psLabel(n)}</option>`).join('')}</select></label>
    <span class="grow"></span>
    <button type="button" id="vwCsv" title="지금 건 조건 그대로 CSV 로 받습니다(엑셀에서 바로 열림)">CSV</button>
    <span class="hint small iwCount" id="vwCount"></span>
  </div>
  <div class="iwViewBody">
    <div class="iwTblWrap" id="vwTable"><div class="empty">불러오는 중…</div></div>
    <aside class="iwSide" id="vwSide" hidden></aside>
  </div>
  <div class="iwTally" id="vwTally" aria-live="polite"></div>
</section>
${window.ItemsDash ? '<section class="iwPane" id="iwDash" data-pane="dash"></section>' : ''}
<section class="iwPane" id="iwIndex" data-pane="index">
  <div class="iwBar">
    <input id="ixQ" type="search" placeholder="라인 · 대품번 · 중품번 검색 (브랜드는 SB,MT 나 성분에디터)" autocomplete="off">
    <button type="button" class="tgl" id="ixBrandBtn">브랜드 ▾</button>
    <span class="hint small iwHideNarrow">관리_라인 → 대품번 → 중품번 → 품번. 줄을 누르면 아래 단계가 펼쳐집니다.</span>
    <span class="grow"></span>
    <button type="button" id="ixClearFil" title="열 머리 ▾ 로 건 조건을 모두 지웁니다">열 조건 지우기</button>
    <button type="button" id="ixCollapse" title="펼친 것을 모두 접습니다">모두 접기</button>
    <span class="hint small iwCount" id="ixCount"></span>
  </div>
  <div class="iwTblWrap" id="ixTable"><div class="empty">불러오는 중…</div></div>
</section>
<div class="iwModal" id="iwModal" hidden>
  <div class="iwModalCard" role="dialog" aria-modal="true">
    <div class="iwModalHead">
      <b>품번 <span class="mono" id="imNo"></span></b><span class="hint iwModalName" id="imName"></span>
      <span class="grow"></span>
      <button type="button" id="imCsv" title="이 품번의 모든 칸을 CSV 로">CSV</button>
      <button type="button" id="imClose" title="닫기 (Esc)">✕</button>
    </div>
    <div class="iwModalTabs" role="tablist">
      <button type="button" data-mtab="all">모든 칸</button>
      <button type="button" data-mtab="tree" title="관리_라인 → 대품번 → 중품번 — 이 품번의 자리와 같은 중품번의 품번">트리</button>
      <input type="search" id="imQ" placeholder="칸 이름 · 값 찾기" autocomplete="off">
    </div>
    <div class="iwModalBody" id="imBody"></div>
  </div>
</div>`;

    const R = s => $(s, root);
    let TAB = '';
    function showTab(t) {
      TAB = t;
      $$('.iwTabs button', root).forEach(b => b.classList.toggle('on', b.dataset.tab === t));
      $$('.iwPane', root).forEach(p => p.classList.toggle('on', p.dataset.pane === t));
      LS.set('olive_items_tab', t);
      if (window.ItemsDash) { if (t === 'dash') window.ItemsDash.enter(); else window.ItemsDash.leave(); }
      if (t === 'index') IX.load(); else if (t === 'view') VW.ensure();
    }
    $$('.iwTabs button', root).forEach(b => b.onclick = () => showTab(b.dataset.tab));
    const u = src.user && src.user();
    R('#iwUser').textContent = u ? (u.email || u.id || '') : '';
    if (R('#iwLogout')) R('#iwLogout').onclick = async () => { await src.logout(); if (opts.onLogout) opts.onLogout(); };

    const fail = (box, e) => { box.innerHTML = `<div class="empty">${esc(e && e.message || e)}</div>`; };

    /* ════════════════════════════════════════════════════════════
       품목조회
       ════════════════════════════════════════════════════════════ */
    const VW = (function () {
      const V = { ready: false, all: [], cols: [], filters: [], savedFilters: [], sort: { col: KEY, dir: 'asc' }, savedSort: null,
                  q: '', limit: 0, offset: 0, rows: [], shown: [], total: 0, grand: 0, more: false, busy: false, seq: 0,
                  colQ: '', groups: [], colGroup: {}, colGroups: null, ops: [], mine: false, colOrder: 'master', side: '',
                  pending: null, wAuto: {} };
      const box = R('#vwTable');
      const RH0 = 30; let RH = RH0;
      const VS = { s: -1, e: -1 };
      const onCols = () => V.cols.filter(c => c.on).map(c => c.key);
      /* 값을 아직 안 적은 조건 줄(＋ 조건 추가 직후)은 빼고 보낸다 — 그 한 줄 때문에 검색까지 막히면 안 된다 */
      const doneF = f => MULTI.indexOf(f.op) >= 0 || NOVAL.indexOf(f.op) >= 0 || String(f.value == null ? '' : f.value).trim() !== '';
      const liveFilters = () => V.filters.filter(doneF);
      const colOf = k => V.cols.find(c => c.key === k);

      async function ensure() { if (!V.ready) await load(); }
      async function load() {
        box.innerHTML = '<div class="empty">불러오는 중…</div>';
        try {
          const d = await src.view('');
          V.all = d.all_columns || []; V.cols = d.pref.columns; V.filters = d.pref.filters || [];
          V.savedFilters = JSON.parse(JSON.stringify(V.filters)); V.sort = d.pref.sort || { col: KEY, dir: 'asc' };
          V.savedSort = V.sort; V.colOrder = d.pref.col_order || 'master'; V.mine = !!d.pref.mine;
          V.groups = d.group_order || []; V.colGroup = d.col_group || {}; V.colGroups = d.col_groups || null;
          V.ops = d.ops && d.ops.length ? d.ops : ['포함', '일치', '시작', '끝', '아님', '이상', '이하', '빈칸', '빈칸아님', '여럿중', '여럿빼고'];
          V.ready = true; V.wAuto = {};
          const st = d.loaded || {};
          if (st.at) R('#iwStamp').textContent = `데이터 ${st.at} 기준`;
          R('#iwStamp').title = st.at ? `PC 앱(ERP 입력 앱)의 품목조회를 ${st.at} 에 올린 사본입니다` +
            (st.item_load_at ? ` — 그 앱이 ERP 품목조회를 읽은 때: ${st.item_load_at}` : '') : '';
        } catch (e) { fail(box, e); return; }
        V.limit = LS.get(PS_KEY, 0);
        if (PS_OPTS.indexOf(V.limit) < 0) V.limit = 0;
        R('#vwPs').value = String(V.limit);
        takePending();
        V.offset = 0;
        paintSideBtns();
        await run(false);
      }

      async function run(append) {
        if (append && V.busy) return;
        const seq = ++V.seq; V.busy = true;
        let chain = false;
        const keepTop = append ? box.scrollTop : 0;
        /* 머리글(정렬 · ▾ 값 고르기)·조건으로 다시 부를 때는 보던 자리(가로·세로) 그대로 — 11-09 정현 «컬럼 헤드를 건드리면
           표 맨 왼쪽 위로 가 버림 → 동작한 자리 그대로». 표를 지우지 않고 그 자리에서 새 줄로 바꾼다. */
        const keep = !append && V.keepPos && $('table', box) ? { l: box.scrollLeft, t: box.scrollTop } : null;
        V.keepPos = false;
        if (!append && !keep) { box.innerHTML = '<div class="empty">불러오는 중…</div>'; }
        if (keep) R('#vwCount').textContent = '불러오는 중…';
        try {
          const d = await src.search({ q: V.q, filters: liveFilters(), columns: onCols(), sort: V.sort, limit: V.limit || ALL_ROWS, offset: append ? V.rows.length : 0 });
          if (seq !== V.seq) return;                       // 그새 다른 조건으로 다시 불렀다
          if (d.hint) { box.innerHTML = `<div class="empty">${esc(d.hint)}</div>`; R('#vwTally').textContent = ''; return; }
          V.rows = append ? V.rows.concat(d.rows) : d.rows;
          V.total = d.total; V.grand = d.grand_total; V.more = !!d.more; V.sort = d.sort || V.sort;
          if (!append) {
            V.shown = d.columns; paintTable();
            if (keep) { box.scrollLeft = keep.l; box.scrollTop = keep.t; paintBody(true); } else box.scrollTop = 0;
          }
          else { box.scrollTop = keepTop; paintBody(true); }
          /* «전체» 인데 열이 많아 서버가 한 번에 셀 예산(40만 칸 · 169열이면 2,366줄)만큼만 줬으면 — 나머지를 곧바로 이어 받는다
             (11-05 16:56 정현 «로컬 앱에서는 전 행을 조회해도 문제없었다»). 아래로 밀지 않아도 조건에 맞는 줄이 다 들어온다. */
          chain = !V.limit && V.more && (d.rows || []).length > 0 && V.rows.length < V.total;
          count(d);
        } catch (e) {
          if (seq !== V.seq) return;
          if (!append) fail(box, e); else toast(e.message, true);
        } finally { if (seq === V.seq) { V.busy = false; if (chain) run(true); } }
      }

      function count(d) {
        const n = liveFilters().length;
        const rest = V.rows.length < V.total;
        /* 열이 많아 나눠 받는 것은 잘못이 아니다 — 서버의 «⚠ … [CSV] 를 쓰세요» 대신 무엇을 하고 있는지만(11-05).
           11-05 17:42 정현 «저런 설명들은 툴팁화» — 화면에는 숫자(받는 중이면 «받는 중…» 한 마디)만, 설명은 마우스를 올리면. */
        const why = rest
          ? (V.limit ? `화면에 ${N(V.rows.length)}행 — 아래로 밀면 다음 ${N(V.limit)}줄이 이어 붙습니다.`
                     : `열이 많아 한 번에 ${N((d && d.rows || []).length)}줄씩 나눠 받습니다 — 나머지를 이어 받는 중입니다(내리지 않아도 전부 들어옵니다).`)
          : '';
        const cnt = R('#vwCount');
        cnt.textContent = `${N(V.rows.length)}건 표시 · 조건에 맞는 ${N(V.total)}건 · 열 ${onCols().length}/${V.all.length}` +
          (n ? ` · 조건 ${n}개` : '') + (rest && !V.limit ? ' · 받는 중…' : '');
        cnt.title = why;
        const t = R('#vwTally');
        t.innerHTML = V.grand ? `총 <b>${N(V.grand)}</b>행 중 <b>${N(V.total)}</b>행 조회` : `<b>${N(V.total)}</b>행 조회`;
        t.title = why;
        paintSideBtns();
      }

      /* ── 표 ── 가상 스크롤: 보이는 줄(+여유)만 그린다. 줄 높이는 그려 보고 잰다. */
      const SEQW = n => 26 + 8 * String(Math.max(1, n | 0)).length;
      function autoW(k) {
        if (V.wAuto[k]) return V.wAuto[k];
        let w = textW(k) + 40;
        for (let i = 0; i < Math.min(80, V.rows.length); i++) w = Math.max(w, textW(V.rows[i][k]) + 20);
        return (V.wAuto[k] = Math.round(Math.max(64, Math.min(320, w))));
      }
      const widthOf = k => { const c = colOf(k); return (c && c.w) || autoW(k); };
      function filOf(col) { return V.filters.find(f => f.col === col && MULTI.indexOf(f.op) >= 0) || null; }
      function hasFil(col) { return V.filters.some(f => f.col === col); }

      function paintTable() {
        const cols = V.shown || [];
        const sw = SEQW(V.total);
        const pinKey = cols[0] === KEY;
        const tw = sw + cols.reduce((a, k) => a + widthOf(k), 0);
        const arrow = k => V.sort.col === k ? (V.sort.dir === 'desc' ? ' ▾' : ' ▴') : '';
        box.innerHTML = `<table class="iwGrid" style="width:${tw}px"><colgroup><col style="width:${sw}px">` +
          cols.map(k => `<col data-k="${esc(k)}" style="width:${widthOf(k)}px">`).join('') + '</colgroup>' +
          `<thead><tr><th class="seq pin" style="left:0">#</th>` +
          cols.map((k, i) => `<th data-col="${esc(k)}" class="${pinKey && i === 0 ? 'pin' : ''}"${pinKey && i === 0 ? ` style="left:${sw}px"` : ''}>` +
            `<span class="thIn"><span class="thLbl" data-sort title="누르면 이 열로 세웁니다(오름 → 내림)">${esc(k)}${arrow(k)}</span>` +
            `<button type="button" class="thFil${hasFil(k) ? ' on' : ''}" data-fil title="이 열의 값을 골라 거릅니다">▾</button></span>` +
            `<span class="grip" data-grip title="끌어서 폭을 바꿉니다"></span></th>`).join('') +
          '</tr></thead><tbody></tbody></table>';
        VS.s = VS.e = -1; RH = RH0;
        if (!V.rows.length) {             // 머리글은 남긴다 — 걸어 둔 ▾ 를 거기서 풀 수 있게
          $('tbody', box).innerHTML = `<tr class="vsPad"><td colspan="${cols.length + 1}"><div class="empty">${liveFilters().length || V.q ? '조건에 맞는 품번이 없습니다.' : '품번이 없습니다.'}</div></td></tr>`;
          return;
        }
        paintBody(true);
        measure();
      }
      function rowHtml(i) {
        const r = V.rows[i]; const cols = V.shown; const sw = SEQW(V.total); const pinKey = cols[0] === KEY;
        return `<tr data-i="${i}"><td class="seq pin" style="left:0">${i + 1}</td>` +
          cols.map((k, j) => {
            const v = r[k] == null ? '' : String(r[k]);
            // 값 속 http(s) 주소는 칸에서 바로 누를 수 있게(새 탭 · 11-09 정현) — 줄 클릭(레코드 창)은 링크를 누를 땐 안 열린다
            return `<td${pinKey && j === 0 ? ` class="pin key" style="left:${sw}px"` : ''}${v.length > 12 ? ` title="${esc(v)}"` : ''}>${linkify(v)}</td>`;
          }).join('') + '</tr>';
      }
      function visible() {                       // 지금 눈에 보이는 줄 [a, b)
        const th = $('thead', box); const hh = th ? th.offsetHeight : 32;
        const top = Math.max(0, box.scrollTop - hh);
        return [Math.floor(top / RH), Math.min(V.rows.length, Math.ceil((top + box.clientHeight) / RH) + 1)];
      }
      function paintBody(force) {
        const tb = $('tbody', box); if (!tb) return;
        const [a, b] = visible();
        if (!force && a >= VS.s && b <= VS.e) return;      // 그려 둔 구간 안이면 그대로
        const s = Math.max(0, a - 40), e = Math.min(V.rows.length, b + 40);
        VS.s = s; VS.e = e;
        const span = (V.shown || []).length + 1;
        const pad = h => h > 0 ? `<tr class="vsPad" aria-hidden="true"><td colspan="${span}" style="height:${h}px"></td></tr>` : '';
        let h = pad(s * RH);
        for (let i = s; i < e; i++) h += rowHtml(i);
        tb.innerHTML = h + pad((V.rows.length - e) * RH);
      }
      function measure() {
        const tr = $('tbody tr[data-i]', box); if (!tr) return;
        const h = tr.getBoundingClientRect().height;
        if (h && Math.abs(h - RH) > 0.5) { RH = h; paintBody(true); }
      }
      let raf = 0;
      box.addEventListener('scroll', () => {
        if (raf) return;
        raf = requestAnimationFrame(() => {
          raf = 0; paintBody(false);
          if (V.more && !V.busy && box.scrollTop + box.clientHeight > box.scrollHeight - RH * 15) run(true);
        });
      }, { passive: true });

      box.addEventListener('click', e => {
        const fb = e.target.closest('[data-fil]');
        if (fb) { e.stopPropagation(); openValFilter(fb.closest('th').dataset.col, fb); return; }
        const sb = e.target.closest('[data-sort]');
        if (sb) { const k = sb.closest('th').dataset.col; V.sort = { col: k, dir: V.sort.col === k && V.sort.dir === 'asc' ? 'desc' : 'asc' }; V.keepPos = true; run(false); return; }
        if (e.target.closest('a')) return;
        const tr = e.target.closest('tbody tr[data-i]');
        if (tr && !String(window.getSelection && window.getSelection()).trim()) {
          const r = V.rows[+tr.dataset.i]; if (r && r[KEY]) MD.open(r[KEY]);
        }
      });
      /* 머리글 오른쪽 끝을 끌어 폭을 바꾼다 — 놓으면 내 설정에 조용히 남긴다 */
      box.addEventListener('pointerdown', e => {
        const g = e.target.closest('[data-grip]'); if (!g) return;
        e.preventDefault(); e.stopPropagation();
        const th = g.closest('th'); const k = th.dataset.col;
        const col = $(`col[data-k="${CSS.escape(k)}"]`, box); const tbl = $('table', box);
        const x0 = e.clientX, w0 = widthOf(k), t0 = parseFloat(tbl.style.width);
        let w = w0;
        const mv = ev => { w = Math.max(48, Math.min(600, Math.round(w0 + ev.clientX - x0))); col.style.width = w + 'px'; tbl.style.width = (t0 + w - w0) + 'px'; };
        const up = () => {
          removeEventListener('pointermove', mv); removeEventListener('pointerup', up);
          const c = colOf(k); if (c && w !== w0) { c.w = w; saveQuiet(); }
        };
        addEventListener('pointermove', mv); addEventListener('pointerup', up);
      });

      /* ── 머리글 ▾ — 그 열에 실제로 있는 값에서 골라 거른다(«여럿중») ── */
      async function openValFilter(col, anchor) {
        let d;
        try { d = await src.distinct(col, '', 300); } catch (e) { toast(e.message, true); return; }
        const vals = (d.values || []).map(v => ({ v: String(v.v), n: v.n }));
        if (d.blank) vals.push({ v: '', n: d.blank });
        const f = filOf(col);
        const sel = f ? (Array.isArray(f.value) ? f.value : String(f.value || '').split('\n')) : [];
        const trunc = (d.values || []).length >= 300;
        valuePop({
          anchor, title: col, selected: sel,
          hint: (f && f.op === '여럿빼고' ? '지금은 «고른 값 빼고» 조건입니다 · ' : '') + (trunc ? '많이 쓰인 300개 — 검색하면 나머지도 찾습니다' : '고른 값만 남깁니다'),
          values: vals,
          remote: trunc ? async q => (q ? ((await src.distinct(col, q, 300)).values || []).map(v => ({ v: String(v.v), n: v.n })) : []) : null,
          onApply: (cur, nAll) => {
            V.filters = V.filters.filter(x => !(x.col === col && MULTI.indexOf(x.op) >= 0));
            if (cur.size && !(cur.size >= nAll && !trunc)) V.filters.push({ col, op: '여럿중', value: [...cur].join('\n') });
            apply();
          },
          onClear: () => { V.filters = V.filters.filter(x => x.col !== col); apply(); },
        });
      }
      function apply() { V.offset = 0; if (V.side === 'fil') paintFilters(); if (V.side === 'cols') paintCols(); V.keepPos = true; run(false); }

      /* ── 곁판: 열 고르기 · 조건 ── */
      const side = R('#vwSide');
      function paintSideBtns() {
        R('#vwColsBtn').classList.toggle('on', V.side === 'cols');
        R('#vwFilBtn').classList.toggle('on', V.side === 'fil');
        const nf = liveFilters().length;
        R('#vwFilBtn').textContent = nf ? `조건 ${nf}` : '조건';
        R('#vwColsBtn').textContent = `열 고르기 ${onCols().length}/${V.all.length}`;
      }
      function openSide(which) {
        V.side = V.side === which ? '' : which;
        side.hidden = !V.side;
        if (V.side === 'cols') paintCols(); else if (V.side === 'fil') paintFilters();
        paintSideBtns();
        requestAnimationFrame(() => paintBody(true));
      }
      R('#vwColsBtn').onclick = () => openSide('cols');
      R('#vwFilBtn').onclick = () => openSide('fil');

      const groupsOf = k => V.colGroups ? (V.colGroups[k] || []) : (V.colGroup[k] ? [V.colGroup[k]] : []);
      function groupStat(g) {
        const cs = V.cols.filter(c => groupsOf(c.key).indexOf(g) >= 0);
        const on = cs.filter(c => c.on).length;
        return { n: cs.length, on };
      }
      let colTimer = 0;
      const rerunSoon = () => { clearTimeout(colTimer); colTimer = setTimeout(() => run(false), 350); };
      function paintCols() {
        const keepTop = ($('.iwColList', side) || {}).scrollTop || 0;
        const q = V.colQ.trim().toLowerCase();
        const hit = k => !q || k.toLowerCase().includes(q);
        side.innerHTML =
          '<div class="iwSideHead"><b>열 고르기</b><span class="grow"></span><button type="button" data-x title="닫기">✕</button></div>' +
          '<div class="iwBtn3"><button type="button" data-c="all">모두 켜기</button><button type="button" data-c="none" title="품번 한 칸은 남습니다">모두 끄기</button><button type="button" data-c="head" title="앞에서 9개만 켭니다(처음 상태)">기본</button></div>' +
          (V.groups.length ? '<div class="iwChips">' + V.groups.map(g => {
            const s = groupStat(g); if (!s.n) return '';
            const cls = s.on === s.n ? 'on' : s.on ? 'some' : '';
            return `<button type="button" class="chip ${cls}" data-g="${esc(g)}" title="${esc(g)} 열 ${s.n}개를 한꺼번에 켜고 끕니다">${esc(g)} <i>${s.on}/${s.n}</i></button>`;
          }).join('') + '</div>' : '') +
          `<input type="search" class="iwColQ" data-colq placeholder="열 이름 검색" value="${esc(V.colQ)}">` +
          '<div class="iwColList">' + V.cols.map((c, i) =>
            `<div class="iwColRow${c.on ? ' on' : ''}"${hit(c.key) ? '' : ' hidden'}><label><input type="checkbox" data-on="${i}"${c.on ? ' checked' : ''}${c.key === KEY ? ' disabled title="품번은 늘 보입니다"' : ''}><span>${esc(c.key)}</span></label>` +
            `<button type="button" class="thFil${hasFil(c.key) ? ' on' : ''}" data-cfil="${esc(c.key)}" title="이 열에 있는 값에서 골라 거릅니다">▾</button></div>`).join('') + '</div>' +
          '<div class="iwSideFoot"><button type="button" class="b1" data-save title="지금 켠 열 · 폭 · 조건 · 정렬을 내 것으로 저장합니다. 다음에 열 때 이대로 보입니다.">내 설정 저장</button>' +
          `<button type="button" data-reset title="내가 저장한 설정을 지우고 모두의 기본으로 되돌립니다"${V.mine ? '' : ' disabled'}>초기화</button></div>` +
          `<div class="hint small iwSideNote">${V.mine ? '지금 보는 것은 <b>내 설정</b>입니다.' : '지금 보는 것은 <b>모두의 기본</b>입니다.'} 모두의 기본은 PC 앱 › 설정 › 품목조회 열에서 정합니다.</div>`;
        const list = $('.iwColList', side); list.scrollTop = keepTop;
        $('[data-x]', side).onclick = () => openSide('cols');
        $$('[data-c]', side).forEach(b => b.onclick = () => {
          const m = b.dataset.c;
          V.cols.forEach((c, i) => { c.on = m === 'all' ? true : m === 'head' ? i < 9 : c.key === KEY; });
          if (!V.cols.some(c => c.on) && V.cols[0]) V.cols[0].on = true;
          paintCols(); rerunSoon();
        });
        $$('[data-g]', side).forEach(b => b.onclick = () => {
          const g = b.dataset.g; const s = groupStat(g); const to = s.on !== s.n;
          V.cols.forEach(c => { if (groupsOf(c.key).indexOf(g) >= 0 && c.key !== KEY) c.on = to; });
          if (!V.cols.some(c => c.on)) colOf(KEY) ? colOf(KEY).on = true : (V.cols[0].on = true);
          paintCols(); rerunSoon();
        });
        $$('[data-on]', side).forEach(x => x.onchange = () => {
          V.cols[+x.dataset.on].on = x.checked; x.closest('.iwColRow').classList.toggle('on', x.checked);
          if (!V.cols.some(c => c.on)) { x.checked = true; V.cols[+x.dataset.on].on = true; toast('적어도 한 열은 켜 두어야 합니다.', true); return; }
          paintSideBtns(); rerunSoon();
        });
        $$('[data-cfil]', side).forEach(b => b.onclick = e => { e.stopPropagation(); openValFilter(b.dataset.cfil, b); });
        const cq = $('[data-colq]', side);
        cq.oninput = () => { V.colQ = cq.value; const q2 = cq.value.trim().toLowerCase(); $$('.iwColRow', side).forEach((row, i) => { row.hidden = !!q2 && !V.cols[i].key.toLowerCase().includes(q2); }); };
        cq.onkeydown = e => { if (e.key === 'Escape') { cq.value = ''; cq.oninput(); } };
        $('[data-save]', side).onclick = savePref;
        $('[data-reset]', side).onclick = resetPref;
      }
      function prefNow(quiet) {
        return { columns: V.cols, filters: quiet ? V.savedFilters : liveFilters(), sort: quiet ? (V.savedSort || V.sort) : V.sort,
                 limit: V.limit, col_order: V.colOrder };
      }
      async function savePref() {
        try {
          await src.saveView(prefNow(false), '');
          V.mine = true; V.savedFilters = JSON.parse(JSON.stringify(liveFilters())); V.savedSort = V.sort;
          toast('내 설정을 저장했습니다 — 다음에 열 때 이대로 보입니다.');
          if (V.side === 'cols') paintCols();
        } catch (e) { toast(e.message, true); }
      }
      async function saveQuiet() { try { await src.saveView(prefNow(true), ''); V.mine = true; } catch (_) { } }
      async function resetPref() {
        try { await src.dropView(''); } catch (e) { toast(e.message, true); return; }
        V.ready = false; await load(); if (V.side) { side.hidden = false; V.side === 'cols' ? paintCols() : paintFilters(); }
        toast('내 설정을 지우고 모두의 기본으로 되돌렸습니다.');
      }

      function paintFilters() {
        const opt = (c, cur) => `<option value="${esc(c)}"${c === cur ? ' selected' : ''}>${esc(c)}</option>`;
        side.innerHTML =
          '<div class="iwSideHead"><b>조건</b><span class="grow"></span><button type="button" data-x title="닫기">✕</button></div>' +
          '<div class="hint small iwSideNote">모두 만족하는 줄만 남습니다. 값 칸을 누르면 그 열에 실제로 있는 값을 보여 줍니다.</div>' +
          '<div class="iwFils">' + (V.filters.length ? V.filters.map((f, i) =>
            `<div class="iwFil" data-i="${i}"><select data-col="${i}" aria-label="열">${V.all.map(c => opt(c, f.col)).join('')}</select>` +
            `<select data-op="${i}" aria-label="조건">${V.ops.map(o => opt(o, f.op)).join('')}</select>` +
            (MULTI.indexOf(f.op) >= 0
              ? `<input data-val="${i}" value="${esc(String(Array.isArray(f.value) ? f.value.length : String(f.value || '').split('\n').length) + '개 고름')}" disabled title="열 머리 ▾ 에서 다시 고릅니다">`
              : `<input data-val="${i}" list="iwVals" value="${esc(f.value || '')}"${NOVAL.indexOf(f.op) >= 0 ? ' disabled placeholder="값 없음"' : ' placeholder="값"'}>`) +
            `<button type="button" data-del="${i}" title="이 조건 지우기">✕</button></div>`).join('')
            : '<div class="hint small">건 조건이 없습니다.</div>') + '</div><datalist id="iwVals"></datalist>' +
          '<div class="iwSideFoot"><button type="button" data-add>＋ 조건 추가</button><button type="button" class="b1" data-apply>적용</button><button type="button" data-clear>모두 지우기</button></div>';
        $('[data-x]', side).onclick = () => openSide('fil');
        $$('[data-col]', side).forEach(x => x.onchange = () => { V.filters[+x.dataset.col].col = x.value; paintFilters(); });
        $$('[data-op]', side).forEach(x => x.onchange = () => {
          const f = V.filters[+x.dataset.op]; const wasMulti = MULTI.indexOf(f.op) >= 0; f.op = x.value;
          if (wasMulti !== (MULTI.indexOf(f.op) >= 0)) f.value = ''; paintFilters();
        });
        $$('[data-val]', side).forEach(x => {
          x.oninput = x.onchange = () => { V.filters[+x.dataset.val].value = x.value; };
          x.onfocus = () => fillVals(V.filters[+x.dataset.val].col);
          x.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); x.onchange(); applyChecked(); } };
        });
        $$('[data-del]', side).forEach(b => b.onclick = () => { V.filters.splice(+b.dataset.del, 1); apply(); });
        $('[data-add]', side).onclick = () => { V.filters.push({ col: V.all.indexOf('품명') >= 0 ? '품명' : V.all[0], op: '포함', value: '' }); paintFilters(); const ins = $$('[data-val]', side); if (ins.length) ins[ins.length - 1].focus(); };
        $('[data-apply]', side).onclick = applyChecked;
        $('[data-clear]', side).onclick = () => { V.filters = []; apply(); };
      }
      function applyChecked() {
        const bad = V.filters.find(f => NOVAL.indexOf(f.op) < 0 && MULTI.indexOf(f.op) < 0 && !String(f.value || '').trim());
        if (bad) { toast(`«${bad.col} ${bad.op}» 에 값을 적어 주세요.`, true); return; }
        apply();
      }
      async function fillVals(col) {
        try {
          const d = await src.distinct(col, '', 200);
          const dl = $('#iwVals', side); if (dl) dl.innerHTML = (d.values || []).map(v => `<option value="${esc(v.v)}">${esc(v.v)} (${N(v.n)})</option>`).join('');
        } catch (_) { }
      }

      /* ── 검색 · 한 쪽 줄 수 · CSV ── */
      let qt = 0;
      R('#vwQ').oninput = () => { clearTimeout(qt); qt = setTimeout(() => { V.q = R('#vwQ').value.trim(); V.offset = 0; run(false); }, 280); };
      R('#vwQ').onkeydown = e => { if (e.key === 'Enter') { clearTimeout(qt); V.q = R('#vwQ').value.trim(); run(false); } };
      R('#vwPs').onchange = () => { V.limit = Math.max(0, +R('#vwPs').value || 0); LS.set(PS_KEY, V.limit); run(false); };
      R('#vwCsv').onclick = async () => {
        const b = R('#vwCsv'); b.disabled = true; const t0 = b.textContent; b.textContent = '받는 중…';
        try {
          const d = await src.search({ q: V.q, filters: liveFilters(), columns: onCols(), sort: V.sort, limit: 50000, offset: 0, max_rows: 50000 });
          const cols = d.columns || onCols();
          saveCsv(`품목조회_${stamp()}.csv`, [cols].concat((d.rows || []).map(r => cols.map(k => r[k]))));
          if ((d.rows || []).length < d.total) toast(`조건에 맞는 ${N(d.total)}건 가운데 ${N(d.rows.length)}건만 받았습니다(한 번에 받는 천장).`, true);
          else toast(`${N(d.rows.length)}건을 CSV 로 받았습니다.`);
        } catch (e) { toast(e.message, true); } finally { b.disabled = false; b.textContent = t0; }
      };

      /* 인덱스·트리에서 «이 묶음만 품목조회에서 보기» — 조건을 그 열 «일치» 하나로 갈아 끼운다 */
      function showGroup(col, value) {
        V.pending = { col, value: String(value || '') };
        if (TAB !== 'view') showTab('view');
        if (V.ready) { takePending(); run(false); }
      }
      function takePending() {
        if (!V.pending) return;
        const g = V.pending; V.pending = null;
        V.q = ''; R('#vwQ').value = '';
        V.filters = [g.value ? { col: g.col, op: '일치', value: g.value } : { col: g.col, op: '빈칸', value: '' }];
        if (V.side === 'fil') paintFilters();
      }
      return { ensure, load, run, showGroup, state: V, repaint: () => paintBody(true) };
    })();

    /* ════════════════════════════════════════════════════════════
       레코드 창 — 그 품번의 모든 칸 · 트리
       ════════════════════════════════════════════════════════════ */
    const MD = (function () {
      const M = R('#iwModal'); const body = R('#imBody');
      let D = null, mtab = 'all', openSeq = 0;
      async function open(no) {
        M.hidden = false; document.body.classList.add('iwNoScroll');
        R('#imNo').textContent = no; R('#imName').textContent = ''; R('#imQ').value = '';
        body.innerHTML = '<div class="empty">불러오는 중…</div>';
        const want = ++openSeq;
        let d; try { d = await src.one(no); } catch (e) { if (want === openSeq) fail(body, e); return; }
        if (want !== openSeq || M.hidden) return;         // 그새 다른 품번을 열었거나 닫았다
        D = d;
        const nm = (D.fields || []).find(f => f.col === '품명');
        R('#imName').textContent = nm ? nm.value : '';
        paint();
      }
      function close() { M.hidden = true; document.body.classList.remove('iwNoScroll'); D = null; }
      function paint() {
        $$('[data-mtab]', M).forEach(b => b.classList.toggle('on', b.dataset.mtab === mtab));
        R('#imQ').hidden = mtab !== 'all';
        if (!D) return;
        if (!D.known) { body.innerHTML = `<div class="empty">«${esc(D.item_no)}» 이 품목 데이터에 없습니다.</div>`; return; }
        if (mtab === 'tree') { paintTree(); return; }
        const q = R('#imQ').value.trim().toLowerCase();
        const hit = f => !q || f.col.toLowerCase().includes(q) || f.value.toLowerCase().includes(q);
        const has = D.fields.filter(f => f.value !== '' && hit(f));
        const empty = D.fields.filter(f => f.value === '' && hit(f));
        const rows = list => list.map(f => `<tr><th>${esc(f.col)}</th><td>${linkify(f.value) || '<i class="hint">—</i>'}</td></tr>`).join('');
        body.innerHTML = `<div class="iwItemCnt hint small">값이 있는 칸 <b>${has.length}</b> · 빈 칸 ${empty.length} · 전체 ${D.fields.length}${q ? ' · 찾는 중' : ''}</div>` +
          `<table class="iwItemTbl">${rows(has)}</table>` + (empty.length ? `<table class="iwItemTbl dim">${rows(empty)}</table>` : '');
      }
      async function paintTree() {
        body.innerHTML = '<div class="empty">불러오는 중…</div>';
        const d0 = D;
        let t; try { t = await src.treeOf(D.item_no); } catch (e) { if (D === d0) fail(body, e); return; }
        if (D !== d0 || mtab !== 'tree') return;          // 그새 창을 닫았거나 다른 품번·탭으로 갔다
        if (!t.known) { body.innerHTML = `<div class="empty">${esc(t.hint || '관리 코드가 없습니다.')}</div>`; return; }
        const LVN = { line: '라인', big: '대품번', mid: '중품번' };
        const COLS = { line: '관리_라인', big: '관리_대품번', mid: '관리_중품번' };
        body.innerHTML = '<div class="iwPath">' + t.path.map(p =>
          `<div class="iwPathStep"><span class="ixLv ${p.level}">${LVN[p.level]}</span><span class="mono">${esc(p.code || '(미지정)')}</span> ${esc(p.name)}` +
          ` <button type="button" class="ixGo" data-go="${COLS[p.level]}" data-v="${esc(p.code)}" title="이 ${LVN[p.level]}에 속한 품번만 품목조회에서 봅니다">품목조회 →</button></div>`).join('<div class="iwPathSep">›</div>') + '</div>' +
          `<div class="hint small">이 라인의 대품번 ${t.big_count} · 이 대품번의 중품번 ${t.mid_count} · 같은 중품번의 품번 ${t.siblings.length}</div>` +
          '<table class="iwGrid iwSib"><thead><tr><th>품번</th><th>품명</th><th>규격</th><th>품목상태</th></tr></thead><tbody>' +
          t.siblings.map(s => `<tr data-no="${esc(s.item_no)}" class="${s.item_no === D.item_no ? 'me' : ''}"><td class="mono">${esc(s.item_no)}</td><td>${esc(s.name)}</td><td>${esc(s.spec)}</td><td>${esc(s.status)}</td></tr>`).join('') +
          '</tbody></table>';
      }
      body.addEventListener('click', e => {
        const go = e.target.closest('[data-go]');
        if (go) { close(); VW.showGroup(go.dataset.go, go.dataset.v); return; }
        const tr = e.target.closest('tr[data-no]');
        if (tr && tr.dataset.no !== (D && D.item_no)) { open(tr.dataset.no); }
      });
      $$('[data-mtab]', M).forEach(b => b.onclick = () => { mtab = b.dataset.mtab; paint(); });
      R('#imQ').oninput = paint;
      R('#imClose').onclick = close;
      M.addEventListener('mousedown', e => { if (e.target === M) close(); });
      R('#imCsv').onclick = () => { if (D && D.known) saveCsv(`품목_${D.item_no}.csv`, [D.fields.map(f => f.col), D.fields.map(f => f.value)]); };
      document.addEventListener('keydown', e => { if (e.key === 'Escape') { if (POP) closePop(); else if (!M.hidden) close(); } });
      return { open, close };
    })();

    /* ════════════════════════════════════════════════════════════
       인덱스 — 관리_라인 → 대품번 → 중품번 → 품번 (앱 인덱스 탭을 옮긴 것 · 2026-10-14~20 규칙 그대로)
       ════════════════════════════════════════════════════════════ */
    const IX = (function () {
      const LV = { line: '라인', big: '대품번', mid: '중품번', item: '품번' };
      const COL = { line: '관리_라인', big: '관리_대품번', mid: '관리_중품번' };
      const NEXT = { line: 'big', big: 'mid', mid: 'item' };
      const DEPTH = { line: 0, big: 1, mid: 2, item: 3 };
      const X = { lines: [], loaded: false, q: '', fil: {}, sort: { k: 'name', dir: 'asc' }, hits: null, hitsMore: false, brands: null, brandNames: {}, brandMaster: new Set() };
      const BRAND_DEFAULT = ['SB', 'MT', 'MC', 'CM'];
      const COMMON = { ZE: '공통 부자재 (Z_E··)', ZH: '공통 홈쇼핑·재고조정 (Z_H··)' };
      const box = R('#ixTable');
      const commonOf = r => { const m = /^Z_([EH])\d{2}$/.exec(r.code || ''); return m ? 'Z' + m[1] : ''; };
      const loadBrands = () => { const v = LS.get('olive_items_ix_brands', null); return Array.isArray(v) ? new Set(v) : new Set(BRAND_DEFAULT); };
      const saveBrands = () => LS.set('olive_items_ix_brands', [...X.brands]);
      { const sv = LS.get('olive_items_ix_sort', null); if (sv && ['code', 'name', 'items'].indexOf(sv.k) >= 0) X.sort = sv; }
      function brandCounts() {
        const cnt = {};
        X.lines.forEach(r => {
          const cm = commonOf(r);
          if (cm) { cnt[cm] = (cnt[cm] || 0) + (r.items || 0); return; }
          Object.entries(r.brands || {}).forEach(([b, n]) => { cnt[b] = (cnt[b] || 0) + n; });
        });
        return cnt;
      }
      function brandNames(cnt) {
        return Object.keys(cnt).sort((a, b) => {
          const ia = BRAND_DEFAULT.indexOf(a), ib = BRAND_DEFAULT.indexOf(b);
          if ((ia >= 0) !== (ib >= 0)) return ia >= 0 ? -1 : 1;
          if (ia >= 0 && ib >= 0) return ia - ib;
          if (a === '(기타)') return 1; if (b === '(기타)') return -1;
          return cnt[b] - cnt[a];
        });
      }
      const lineBrandItems = r => {
        const cm = commonOf(r);
        if (cm) return X.brands.has(cm) ? (r.items || 0) : 0;
        return Object.entries(r.brands || {}).filter(([b]) => X.brands.has(b)).reduce((a, [, n]) => a + n, 0);
      };
      const brandName = b => COMMON[b] || X.brandNames[b] || '';
      const brandLabel = b => brandName(b) ? `${b} ${brandName(b)}` : b;
      function paintBrands() {
        const btn = R('#ixBrandBtn');
        const cnt = brandCounts(); const names = brandNames(cnt);
        const all = names.length > 0 && names.every(b => X.brands.has(b));
        const on = names.filter(b => X.brands.has(b));
        btn.textContent = (all ? '브랜드 전체' : `브랜드 ${on.join('·') || '없음'}`) + ' ▾';
        btn.title = (all ? '모든 브랜드' : on.map(brandLabel).join(' · ')) + '\n품번 앞 두 글자(브랜드)로 거릅니다 — 공통 라인(Z_E·Z_H)은 ZE·ZH 로 따로. 검색칸에 «SB,MT» 또는 «성분에디터» 처럼 쳐도 됩니다';
        btn.classList.toggle('on', !all);
      }
      function openBrandPop(anchor) {
        const cnt = brandCounts(); const names = brandNames(cnt);
        valuePop({
          anchor, title: '브랜드', hint: '품번 앞 두 글자 — 고른 브랜드의 품번이 있는 라인만 보입니다 · 공통 라인은 ZE·ZH',
          selected: [...X.brands], emptyNote: '고른 브랜드 없음',
          values: names.map(b => ({ v: b, n: cnt[b], label: brandLabel(b),
            html: `<b class="ixCode">${esc(b)}</b> ${esc(brandName(b))}` + (!COMMON[b] && X.brandMaster.size && !X.brandMaster.has(b) ? ' <span class="hint small" title="기준정보 마스터 «브랜드» 의 «약자» 에 없는 품번 앞자리 — 이름은 품번들의 브랜드_olive 에서 읽음">(마스터에 없음)</span>' : '') })),
          extraHtml: `<button type="button" class="iwMini" data-default title="${BRAND_DEFAULT.join('·')} 만">기본(${BRAND_DEFAULT.join('·')})</button>`,
          wire: (pop, cur, redraw) => { $('[data-default]', pop).onclick = () => { cur.clear(); BRAND_DEFAULT.forEach(b => cur.add(b)); redraw(); }; },
          onApply: cur => { X.brands = new Set(cur); saveBrands(); paint(); },
        });
      }
      function brandsFromQuery(q) {
        const cnt = brandCounts();
        const byName = {}; Object.keys(cnt).forEach(b => { const n = brandName(b); if (n) byName[n] = b; });
        const toks = q.trim().split(/[\s,·/]+/).filter(Boolean);
        if (!toks.length) return null;
        const out = new Set();
        for (const t of toks) {
          const u = t.toUpperCase();
          if (/^[A-Z]{2}$/.test(u) && cnt[u] !== undefined) out.add(u);
          else if (byName[t]) out.add(byName[t]);
          else return null;
        }
        return out;
      }
      function cmpRows(a, b) {
        const { k, dir } = X.sort;
        const av = k === 'items' ? (a.items || 0) : String(a.code === undefined ? a.item_no : a[k] || '');
        const bv = k === 'items' ? (b.items || 0) : String(b.code === undefined ? b.item_no : b[k] || '');
        if (k !== 'items' && (av === '') !== (bv === '')) return av === '' ? 1 : -1;
        const c = k === 'items' ? av - bv : av.localeCompare(bv, 'ko', { numeric: true });
        return dir === 'desc' ? -c : c;
      }
      const sortRows = rows => [...rows].sort(cmpRows);
      const sortArrow = k => X.sort.k === k ? (X.sort.dir === 'desc' ? ' ▾' : ' ▴') : '';
      function setSort(k) { X.sort = { k, dir: X.sort.k === k && X.sort.dir === 'asc' ? 'desc' : 'asc' }; LS.set('olive_items_ix_sort', X.sort); paint(); }
      const FCOLS = [
        { k: 'lv', t: '단계', of: tr => LV[tr.dataset.lv] },
        { k: 'code', t: '코드', of: tr => tr.dataset.code || '(미지정)' },
        { k: 'name', t: '이름', of: tr => tr.dataset.name || '' },
        { k: 'items', t: '품번 수', of: tr => tr.dataset.items || '', num: true },
        { k: 'status', t: '상태', of: tr => tr.dataset.status || '' },
      ];
      const fcol = k => FCOLS.find(c => c.k === k);
      function rowHidden(tr) {
        for (const k in X.fil) { const set = X.fil[k]; if (!set || !set.size) continue; if (!set.has(fcol(k).of(tr))) return true; }
        return false;
      }
      function applyFil() {
        let shown = 0;
        $$('tr.ixRow', box).forEach(tr => { const h = rowHidden(tr); tr.hidden = h; if (!h) shown++; });
        $$('th [data-ixfil]', box).forEach(b => b.classList.toggle('on', !!(X.fil[b.dataset.ixfil] && X.fil[b.dataset.ixfil].size)));
        const n = Object.values(X.fil).filter(s => s && s.size).length;
        const cnt = R('#ixCount');
        cnt.textContent = cnt.textContent.replace(/ · 열 조건.*$/, '') + (n ? ` · 열 조건 ${n}개 · 보이는 줄 ${shown}` : '');
      }
      function openFil(k, anchor) {
        const c = fcol(k);
        const counts = new Map();
        $$('tr.ixRow', box).forEach(tr => {
          const keep = Object.keys(X.fil).every(kk => kk === k || !X.fil[kk] || !X.fil[kk].size || X.fil[kk].has(fcol(kk).of(tr)));
          if (!keep) return;
          const v = c.of(tr); counts.set(v, (counts.get(v) || 0) + 1);
        });
        const LVO = { '라인': 0, '대품번': 1, '중품번': 2, '품번': 3 };
        const vals = [...counts.entries()].map(([v, n]) => ({ v, n }));
        vals.sort(c.num ? (a, b) => (+a.v || 0) - (+b.v || 0) : k === 'lv' ? (a, b) => LVO[a.v] - LVO[b.v] : (a, b) => String(a.v).localeCompare(String(b.v), 'ko'));
        valuePop({
          anchor, title: c.t, hint: '값을 골라 거릅니다 — 화면에 받아 둔 줄 기준', values: vals, selected: [...(X.fil[k] || [])],
          onApply: (cur, nAll) => { if (cur.size && cur.size < nAll) X.fil[k] = new Set(cur); else delete X.fil[k]; applyFil(); },
          onClear: () => { delete X.fil[k]; applyFil(); },
        });
      }
      const key = (lv, line, big, mid) => [lv, line, big, mid].map(x => x || '').join('\u0001');
      function rowHtml(lv, r, ctx) {
        const code = r.code === undefined ? r.item_no : r.code;
        const k = key(lv, ctx.line, ctx.big, ctx.mid) + '\u0001' + code;
        const leaf = lv === 'item';
        const bi = lv === 'line' ? lineBrandItems(r) : 0;
        const under = lv === 'line' ? `대품번 ${r.bigs} · 중품번 ${r.mids} · 품번 ${r.items}${bi && bi !== r.items ? ` <span class="hint small">(고른 브랜드 ${bi})</span>` : ''}`
          : lv === 'big' ? `중품번 ${r.mids} · 품번 ${r.items}` : lv === 'mid' ? `품번 ${r.items}` : '';
        const name = leaf ? `${esc(r.name)}${r.spec ? ` <span class="hint small">${esc(r.spec)}</span>` : ''}` : esc(r.name);
        const alias = r.aliases && r.aliases.length ? `<span class="ixAlias" title="같은 코드에 다른 이름도 적혀 있습니다">(${esc(r.aliases.join(' · '))})</span>` : '';
        const goCol = leaf ? COL.mid : COL[lv];
        const goVal = leaf ? ctx.mid : code;
        const goTip = leaf ? '같은 중품번의 품번만 품목조회에서 봅니다' : `이 ${LV[lv]}에 속한 품번만 품목조회에서 봅니다`;
        return `<tr class="ixRow${leaf ? ' ixLeaf' : ''}" data-k="${esc(k)}" data-lv="${lv}" data-code="${esc(code)}" ` +
          `data-name="${esc(r.name || '')}" data-items="${leaf ? '' : (r.items || 0)}" data-status="${esc(leaf ? (r.status || '') : '')}" ` +
          `data-line="${esc(ctx.line || '')}" data-big="${esc(ctx.big || '')}" data-mid="${esc(ctx.mid || '')}" style="--ix-depth:${DEPTH[lv]}">` +
          `<td class="ixFirst">${leaf ? '<span class="ixTg"></span>' : '<span class="ixTg">▸</span>'}<span class="ixLv ${lv}">${LV[lv]}</span>` +
          `<span class="ixCode">${esc(code || '(미지정)')}</span></td>` +
          `<td class="ixName">${name}${alias}</td>` +
          `<td class="num">${under}${leaf && r.status ? esc(r.status) : ''}</td>` +
          `<td><button type="button" class="ixGo" data-go="${esc(goCol)}" data-v="${esc(goVal || '')}" title="${goTip}">품목조회 →</button></td></tr>`;
      }
      function paint() {
        const q = X.q.trim().toLowerCase();
        const hitLines = new Set((X.hits || []).map(h => h.line));
        if (!X.brands) X.brands = loadBrands();
        paintBrands();
        const rows = X.lines.filter(r => lineBrandItems(r) > 0)
          .filter(r => !q || (r.code || '').toLowerCase().includes(q) || (r.name || '').toLowerCase().includes(q) || hitLines.has(r.code || ''));
        R('#ixCount').textContent = `라인 ${rows.length} / ${X.lines.length} · 품번 ${N(rows.reduce((a, r) => a + lineBrandItems(r), 0))}`;
        const fb = (...ks) => '<span class="ixFils">' + ks.map(([k, t]) =>
          `<button type="button" class="thFil" data-ixfil="${k}" title="${t} — 값을 골라 거릅니다">${ks.length > 1 ? t + ' ' : ''}▾</button>`).join('') + '</span>';
        const sb = (k, t) => `<span class="ixSort" data-ixsort="${k}" title="누르면 이 열로 줄을 세웁니다(오름 → 내림)">${t}${sortArrow(k)}</span>`;
        box.innerHTML = '<table class="iwGrid ixTbl"><thead><tr>' +
          `<th><span class="thIn">단계 · ${sb('code', '코드')}${fb(['lv', '단계'], ['code', '코드'])}</span></th>` +
          `<th><span class="thIn">${sb('name', '이름')}${fb(['name', '이름'])}</span></th>` +
          `<th class="num"><span class="thIn">아래 — ${sb('items', '품번 수')} · 상태${fb(['items', '품번 수'], ['status', '상태'])}</span></th><th></th></tr></thead><tbody>` +
          (rows.length ? sortRows(rows).map(r => rowHtml('line', r, {})).join('') : '<tr><td class="empty" colspan="4">맞는 것이 없습니다.</td></tr>') +
          '</tbody></table>';
        applyFil();
        if (X.hits && X.hits.length) expandHits();
      }
      async function expandHits() {
        const q = X.q.trim().toLowerCase();
        const byLine = new Map();
        for (const h of X.hits) { const L = byLine.get(h.line) || new Set(); byLine.set(h.line, L); if (h.level === 'mid') L.add(h.big); }
        for (const [line, bigs] of byLine) {
          const tr = $(`tr.ixRow[data-lv="line"][data-code="${CSS.escape(line)}"]`, box);
          if (!tr) continue;
          if (!tr.classList.contains('ixOpen')) await toggle(tr);
          for (const big of bigs) {
            const tb = $(`tr.ixRow[data-lv="big"][data-line="${CSS.escape(line)}"][data-code="${CSS.escape(big)}"]`, box);
            if (tb && !tb.classList.contains('ixOpen')) await toggle(tb);
          }
          if (X.q.trim().toLowerCase() !== q) return;
        }
        $$('tr.ixRow', box).forEach(tr => {
          const lv = tr.dataset.lv;
          tr.classList.toggle('ixHit', lv !== 'item' && lv !== 'line' && !!q && ((tr.dataset.code || '').toLowerCase().includes(q) || (tr.dataset.name || '').toLowerCase().includes(q)));
        });
        R('#ixCount').textContent += ` · 맞는 대품번·중품번 ${X.hits.length}${X.hitsMore ? '+' : ''}`;
      }
      let searchSeq = 0;
      async function search(q) {
        const bq = brandsFromQuery(q);
        if (bq) { X.brands = bq; saveBrands(); X.q = ''; X.hits = null; R('#ixQ').value = ''; paint(); return; }
        X.q = q; const seq = ++searchSeq;
        if (!q.trim()) { X.hits = null; X.hitsMore = false; paint(); return; }
        let d = { hits: [] };
        try { d = await src.treeSearch(q); } catch (e) { toast(e.message, true); }
        if (seq !== searchSeq) return;
        X.hits = d.hits || []; X.hitsMore = !!d.more;
        paint();
      }
      async function toggle(tr) {
        const lv = tr.dataset.lv; if (lv === 'item') return;
        const next = NEXT[lv];
        if (tr.classList.contains('ixOpen')) {
          let n = tr.nextElementSibling;
          while (n && DEPTH[n.dataset.lv] > DEPTH[lv]) { const x = n; n = n.nextElementSibling; x.remove(); }
          tr.classList.remove('ixOpen'); $('.ixTg', tr).textContent = '▸';
          return;
        }
        const ctx = { line: tr.dataset.line, big: tr.dataset.big, mid: tr.dataset.mid };
        ctx[lv] = tr.dataset.code;
        tr.classList.add('ixOpen'); $('.ixTg', tr).textContent = '▾';
        const ld = document.createElement('tr'); ld.className = 'ixLoading'; ld.dataset.lv = next;
        ld.innerHTML = '<td colspan="4">불러오는 중…</td>';
        tr.after(ld);
        try {
          const d = await src.tree({ line: ctx.line || '', big: lv === 'line' ? '' : (ctx.big || ''), mid: lv === 'mid' ? ctx.mid : '' });
          ld.outerHTML = sortRows(d.rows || []).map(r => rowHtml(next, r, ctx)).join('') ||
            `<tr data-lv="${next}" class="ixLoading"><td colspan="4">아래가 없습니다.</td></tr>`;
          applyFil();
        } catch (e) { ld.innerHTML = `<td colspan="4">${esc(e.message)}</td>`; }
      }
      async function load() {
        if (X.loaded) return;
        box.innerHTML = '<div class="empty">불러오는 중…</div>';
        try {
          const d = await src.tree({});
          if (d.hint && !(d.rows || []).length) { box.innerHTML = `<div class="empty">${esc(d.hint)}</div>`; return; }
          X.lines = d.rows || []; X.brandNames = d.brand_names || {}; X.brandMaster = new Set(d.brand_master || []); X.loaded = true;
        } catch (e) { fail(box, e); return; }
        paint();
      }
      box.addEventListener('click', e => {
        const fb = e.target.closest('[data-ixfil]');
        if (fb) { e.stopPropagation(); openFil(fb.dataset.ixfil, fb); return; }
        const sb = e.target.closest('[data-ixsort]');
        if (sb) { e.stopPropagation(); setSort(sb.dataset.ixsort); return; }
        const go = e.target.closest('[data-go]');
        if (go) { e.stopPropagation(); VW.showGroup(go.dataset.go, go.dataset.v); return; }
        const tr = e.target.closest('tr.ixRow'); if (!tr) return;
        if (tr.dataset.lv === 'item') { MD.open(tr.dataset.code); return; }
        toggle(tr);
      });
      let t = 0;
      R('#ixQ').oninput = () => { clearTimeout(t); t = setTimeout(() => search(R('#ixQ').value), 220); };
      R('#ixCollapse').onclick = () => { X.hits = null; paint(); };
      R('#ixClearFil').onclick = () => { X.fil = {}; applyFil(); };
      R('#ixBrandBtn').onclick = e => { e.stopPropagation(); if (X.loaded) openBrandPop(R('#ixBrandBtn')); };
      return { load, state: X };
    })();

    addEventListener('resize', () => { if (TAB === 'view') VW.repaint(); }, { passive: true });
    if (window.ItemsDash && R('#iwDash')) window.ItemsDash.mount(src, R('#iwDash'));
    let first = location.hash === '#index' ? 'index' : (location.hash === '#view' ? 'view' : (location.hash === '#dash' ? 'dash' : LS.get('olive_items_tab', 'view')));
    if (first === 'dash' && !R('#iwDash')) first = 'view';
    showTab(first);
    return { showTab, view: VW, index: IX, modal: MD };
  }

  /* ── CSV — 엑셀이 한글을 바로 읽게 BOM 을 붙인다 ── */
  function saveCsv(name, rows) {
    const cell = v => { const s = v == null ? '' : String(v); return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    const text = '﻿' + rows.map(r => r.map(cell).join(',')).join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
    a.download = name; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }
  function stamp() { const d = new Date(), p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`; }

  /* ════════════════════════════════════════════════════════════
     시작 — 로그인이 필요한 길이면 로그인부터
     ════════════════════════════════════════════════════════════ */
  function loginScreen(root, src, done) {
    root.innerHTML = `<div class="iwLogin"><form class="iwLoginCard" autocomplete="on">
      <div class="iwBrand"><span class="iwMark" aria-hidden="true"></span><b>품목조회</b></div>
      <p class="hint">회사에서 받은 계정으로 로그인하세요.</p>
      <label>이메일<input name="email" type="email" autocomplete="username" required></label>
      <label>비밀번호<input name="pw" type="password" autocomplete="current-password" required></label>
      <button type="submit" class="b1">로그인</button>
      <div class="iwErr" role="alert"></div>
      <p class="hint small">계정이 없으면 관리자(전략기획실)에게 요청하세요. 이 창은 조회만 합니다 — 값은 바뀌지 않습니다.</p>
    </form></div>`;
    const f = $('form', root), err = $('.iwErr', root), btn = $('button', f);
    f.onsubmit = async e => {
      e.preventDefault(); err.textContent = ''; btn.disabled = true; btn.textContent = '로그인 중…';
      try { await src.login(f.email.value, f.pw.value); done(); }
      catch (x) { err.textContent = x.message; btn.disabled = false; btn.textContent = '로그인'; }
    };
    f.email.focus();
  }
  function start(rootSel) {
    const root = typeof rootSel === 'string' ? $(rootSel) : (rootSel || $('#app'));
    const cfg = window.ITEMS_CONFIG || { source: 'app' };
    const src = cfg.source === 'supabase' ? window.ItemsSrcSupabase(cfg) : window.ItemsSrcApp(cfg);
    const go = () => {
      if (src.needsLogin && !src.user()) { loginScreen(root, src, go); return; }
      mount(root, src, { subtitle: src.kind === 'supabase' ? '웹' : 'PC', onLogout: go });
    };
    src.onLogout(go);
    go();
  }
  window.ItemsWeb = { start, mount };
})();
