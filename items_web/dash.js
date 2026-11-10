/* ═══════════════════════════════════════════════════════════════
   상품목록 대시보드 — 웹 모듈 (2026-11-09 정현 «배포 앱에도 상품목록 대시보드 탭으로»)
   ─────────────────────────────────────────────────────────────
   PC 앱 web/app.js 의 «상품목록 대시보드»(window.ERPDash · 11-07) 를 그대로 옮긴 것. 다른 점만:
   · 데이터는 품목조회 모듈과 같은 src(src_supabase.js · src_app.js)로 — view · search · one. 서버·SQL 안 바꿈.
   · 다운로드는 엑셀 대신 CSV(웹에 엑셀 만드는 길이 없다) — 고른 품번 · 고른 칸 묶음 · BOM 붙여 엑셀에서 바로 열림.
   · 탭은 items.js 가 부른다 — ItemsDash.mount(src) 한 번 · 탭에 들어올 때 ItemsDash.enter().
   ═══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  const $d = s => document.querySelector(s);
  let SRC = null, ON = false;
  const WANT = ['품번', '품명', '규격', '브랜드_olive', '관리_상태', '관리_라인', '관리_라인명', '관리_대품번', '관리_대품번명',
    '관리_중품번', '관리_중품번명', '버전', '바코드', '품목상태', '품목자산분류', '등록일', '총용량', '채널', '영문명'];
  const TABLE_DEFAULT = ['품번', '품명', '브랜드_olive', '관리_라인명', '관리_중품번', '관리_상태', '품목상태', '바코드', '등록일'];
  const STATUSES = ['정상운영', '운영중단(단종)', '생산중지', '미판정'];
  const ST_VAR = { '정상운영': '--pd-ok', '운영중단(단종)': '--pd-end', '생산중지': '--pd-stop', '미판정': '--pd-none' };
  const FILL = ['바코드', '관리_중품번', '관리_라인', '규격', '총용량', '채널', '영문명'];
  const PALETTE = ['#4C7A3F', '#C0708A', '#CC9A1E', '#C1452B', '#8C8577', '#4A6FA5', '#7C6B9E', '#3E8E8A', '#B0793F'];
  const PAGE = 50, ROW_H = 35;

  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = n => Number(n || 0).toLocaleString('ko-KR');
  const pct = (a, b) => b ? (a / b * 100).toFixed(a / b < .1 ? 1 : 0) + '%' : '–';
  const has = v => v !== '' && v != null;
  const hashColor = s => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return PALETTE[h % PALETTE.length]; };
  const lineColor = l => l ? hashColor(l) : '#9C9A8E';
  function highlight(text, q) {
    const t = String(text || ''); const toks = q ? q.trim().toLowerCase().split(/\s+/).filter(Boolean) : [];
    if (!toks.length) return esc(t);
    const low = t.toLowerCase(), r = [];
    toks.forEach(tok => { let i = 0; for (; ;) { const p = low.indexOf(tok, i); if (p < 0) break; r.push([p, p + tok.length]); i = p + tok.length; } });
    if (!r.length) return esc(t);
    r.sort((a, b) => a[0] - b[0]); const m = [r[0]];
    for (let i = 1; i < r.length; i++) { const l = m[m.length - 1]; if (r[i][0] <= l[1]) l[1] = Math.max(l[1], r[i][1]); else m.push(r[i]); }
    let o = '', c = 0; m.forEach(x => { o += esc(t.slice(c, x[0])) + '<mark>' + esc(t.slice(x[0], x[1])) + '</mark>'; c = x[1]; });
    return o + esc(t.slice(c));
  }

  /* ── 상태 ── */
  const S = {
    loaded: false, loading: false, cols: [], C: {}, N: 0, TS: null, SRCH: null,
    colGroup: {}, groupOrder: [], allCols: [],
    F: { q: '', brand: '', status: '', line: '', month: '', blank: '', days: 0 },
    view: 'card', idx: new Int32Array(0), groupsAll: [], gById: [], groups: [], agg: null,
    shown: 0, openGid: -1, active: {}, oneCache: new Map(), secOpen: {},
    sel: new Set(), tShow: TABLE_DEFAULT.slice(), sort: { k: '등록일', dir: -1 }, sidx: null, lastSlice: '',
    months: [], lines: [], brands: [],
  };
  const FALLBACK_G = () => S.groupOrder.indexOf('ERP') >= 0 ? 'ERP' : (S.groupOrder[S.groupOrder.length - 1] || 'ERP');
  const val = (k, i) => { const a = S.C[k]; return a ? a[i] : ''; };
  const ym = ts => { if (!ts) return ''; const d = new Date(ts); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); };
  const lineOf = i => val('관리_라인명', i) || val('관리_라인', i) || '';
  const stOf = i => val('관리_상태', i) || '미판정';

  /* ── 받기 ── */
  async function load(force) {
    if (S.loading || (S.loaded && !force)) { if (S.loaded) draw(); return; }
    S.loading = true; setMsg('품목조회에서 받는 중…');
    const t0 = performance.now();
    try {
      const v = await SRC.view('');
      S.allCols = v.all_columns || []; S.colGroup = v.col_group || {}; S.groupOrder = v.group_order || [];
      const cols = WANT.filter(c => S.allCols.indexOf(c) >= 0);
      const rows = []; let off = 0, total = 0;
      for (let k = 0; k < 10; k++) {   // 셀 예산에 걸리면 이어 받는다(열이 적어 보통 한 번)
        const d = await SRC.search({ columns: cols, limit: 10000, offset: off, sort: { col: '품번', dir: 'asc' } });
        total = d.total || 0; (d.rows || []).forEach(r => rows.push(r)); off += (d.rows || []).length;
        if (!d.more || !(d.rows || []).length) break;
      }
      const t1 = performance.now();
      prepare(cols, rows);
      const t2 = performance.now();
      S.loaded = true;
      $d('#pdTLoad').textContent = (t1 - t0).toFixed(0) + ' ms';
      $d('#pdTLoad').parentNode.title = `서버에서 ${fmt(rows.length)}줄 × ${cols.length}열을 받은 시간(요청 ${Math.max(1, Math.ceil(off / 10000))}번 · 정리 ${(t2 - t1).toFixed(0)} ms 별도)`;
      $d('#pdTotal').textContent = fmt(S.N);
      $d('#pdAsof').textContent = '데이터 ' + new Date().toLocaleString('ko-KR', { hour12: false }) + ' 받음 · 품목조회 ' + fmt(total) + '줄' + (v.loaded && v.loaded.at ? ' · ' + v.loaded.at + ' 기준 사본' : '');
      setMsg('');
      renderCats(); renderHead(); update();
    } catch (e) {
      setMsg('받지 못했습니다 — ' + e.message);
    } finally { S.loading = false; }
  }
  function prepare(cols, rows) {
    S.cols = cols; S.N = rows.length; S.C = {};
    cols.forEach(c => { const a = new Array(S.N); for (let i = 0; i < S.N; i++) { const v = rows[i][c]; a[i] = v == null ? '' : v; } S.C[c] = a; });
    S.TS = new Float64Array(S.N); S.SRCH = new Array(S.N);
    for (let i = 0; i < S.N; i++) {
      const d = String(val('등록일', i)).slice(0, 10); const t = d ? Date.parse(d + 'T00:00:00') : NaN; S.TS[i] = isNaN(t) ? 0 : t;
      S.SRCH[i] = [val('품번', i), val('품명', i), val('바코드', i), val('관리_중품번', i), val('관리_중품번명', i), lineOf(i), val('영문명', i)]
        .join(' ').toLowerCase();
    }
    // 카드 묶음 = 관리_중품번 · 빈 품번은 혼자 한 카드
    const map = new Map();
    for (let i = 0; i < S.N; i++) {
      const m = val('관리_중품번', i); const k = m ? 'M|' + m : 'I|' + i; let g = map.get(k);
      if (!g) { g = { gid: map.size, mid: m || '', base: m ? (val('관리_중품번명', i) || val('품명', i)) : val('품명', i), line: lineOf(i), items: [] }; map.set(k, g); }
      g.items.push(i);
    }
    S.groupsAll = [...map.values()];
    S.groupsAll.forEach(g => { g.items.sort((a, b) => S.TS[b] - S.TS[a] || String(val('품번', b)).localeCompare(String(val('품번', a)))); g.ts = S.TS[g.items[0]]; });
    S.groupsAll.sort((a, b) => b.ts - a.ts);
    S.gById = []; S.groupsAll.forEach(g => { S.gById[g.gid] = g; });
    const bc = {}; for (let i = 0; i < S.N; i++) { const b = val('브랜드_olive', i) || '(없음)'; bc[b] = (bc[b] || 0) + 1; }
    S.brands = Object.keys(bc).sort((a, b) => bc[b] - bc[a]);
    const now = new Date(); S.months = [];
    for (let k = 23; k >= 0; k--) { const d = new Date(now.getFullYear(), now.getMonth() - k, 1); S.months.push(d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0')); }
    S.oneCache.clear();
  }

  /* ── 거르기 · 집계 ── */
  function pass(i, o) {
    const F = S.F;
    if (o.brand && (val('브랜드_olive', i) || '(없음)') !== F.brand) return false;
    if (o.status && stOf(i) !== F.status) return false;
    if (F.line && lineOf(i) !== F.line) return false;
    if (F.days && S.TS[i] < Date.now() - F.days * 864e5) return false;
    if (F.month && ym(S.TS[i]) !== F.month) return false;
    if (F.blank && has(val(F.blank, i))) return false;
    if (o.terms) { const s = S.SRCH[i]; for (const t of o.terms) if (s.indexOf(t) < 0) return false; }
    return true;
  }
  function applyFilters() {
    const F = S.F, q = F.q.trim().toLowerCase(), terms = q ? q.split(/\s+/) : null;
    const on = { brand: !!F.brand, status: !!F.status, terms }, noB = { brand: false, status: !!F.status, terms }, noS = { brand: !!F.brand, status: false, terms };
    const ok = new Uint8Array(S.N), out = new Int32Array(S.N); let n = 0;
    const nb = {}, ns = {}, byB = {}, byM = {}, byL = {}, byS = {}, fill = {}; let recent = 0;
    S.months.forEach(m => byM[m] = 0); STATUSES.forEach(s => byS[s] = 0); FILL.forEach(k => fill[k] = 0);
    const r30 = Date.now() - 30 * 864e5;
    for (let i = 0; i < S.N; i++) {
      const b = val('브랜드_olive', i) || '(없음)', st = stOf(i);
      if (pass(i, noB)) nb[b] = (nb[b] || 0) + 1;
      if (pass(i, noS)) ns[st] = (ns[st] || 0) + 1;
      if (!pass(i, on)) continue;
      ok[i] = 1; out[n++] = i;
      const bb = byB[b] || (byB[b] = { t: 0, '정상운영': 0, '운영중단(단종)': 0, '생산중지': 0, '미판정': 0 }); bb.t++; bb[st]++;
      byS[st]++; const m = ym(S.TS[i]); if (m in byM) byM[m]++;
      const l = lineOf(i) || '(라인 없음)'; byL[l] = (byL[l] || 0) + 1;
      if (S.TS[i] >= r30) recent++;
      for (const k of FILL) if (has(val(k, i))) fill[k]++;
    }
    S.idx = out.subarray(0, n);
    S.groups = S.groupsAll.filter(g => g.items.some(i => ok[i]));
    S.groups.forEach(g => { S.active[g.gid] = Math.max(0, g.items.findIndex(i => ok[i])); });
    S.agg = { n, nb, ns, byB, byM, byL, byS, fill, recent };
  }

  /* ── 왼쪽 · 라인 칩 ── */
  function renderNav() {
    const a = S.agg, F = S.F, tb = Object.values(a.nb).reduce((x, y) => x + y, 0), ts = Object.values(a.ns).reduce((x, y) => x + y, 0);
    $d('#pdBrand').innerHTML = `<button class="pd-nav${F.brand ? '' : ' on'}" data-brand=""><span>전체</span><span class="pd-cnt">${fmt(tb)}</span></button>` +
      S.brands.map(b => `<button class="pd-nav${F.brand === b ? ' on' : ''}" data-brand="${esc(b)}"><span>${esc(b)}</span><span class="pd-cnt">${fmt(a.nb[b] || 0)}</span></button>`).join('');
    $d('#pdStatus').innerHTML = `<button class="pd-nav${F.status ? '' : ' on'}" data-status=""><span>전체</span><span class="pd-cnt">${fmt(ts)}</span></button>` +
      STATUSES.map(s => `<button class="pd-nav${F.status === s ? ' on' : ''}" data-status="${s}"><span><i class="pd-dot" style="background:var(${ST_VAR[s]})"></i>${s}</span><span class="pd-cnt">${fmt(a.ns[s] || 0)}</span></button>`).join('');
    const cnt = {}; for (let i = 0; i < S.N; i++) { if (S.F.brand && (val('브랜드_olive', i) || '(없음)') !== S.F.brand) continue; const l = lineOf(i); if (l) cnt[l] = (cnt[l] || 0) + 1; }
    const lines = Object.keys(cnt).sort((x, y) => cnt[y] - cnt[x]);
    if (F.line && lines.indexOf(F.line) < 0) lines.unshift(F.line);
    $d('#pdChips').innerHTML = lines.map(l => `<button class="pd-chip${l === F.line ? ' on' : ''}" data-line="${esc(l)}" title="${fmt(cnt[l] || 0)}개">${esc(l)}</button>`).join('');
    $d('#pdChipMore').textContent = $d('#pdChips').classList.contains('more') ? '접기' : `더보기 (${lines.length})`;
  }

  /* ── 카드 ── */
  const COPY = '<svg class="pd-ci" viewBox="0 0 24 24" fill="none"><rect x="9" y="9" width="11" height="11" rx="2" stroke="currentColor" stroke-width="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10" stroke="currentColor" stroke-width="2"/></svg><svg class="pd-ck" viewBox="0 0 24 24" fill="none"><path d="M5 13l4 4L19 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const STB = s => `<span class="pd-st"><i class="pd-dot" style="background:var(${ST_VAR[s] || '--pd-none'})"></i>${esc(s)}</span>`;
  function groupsOfFields(fields) {
    const by = {}, order = [];
    fields.forEach(f => { const g = S.colGroup[f.col] || FALLBACK_G(); if (!by[g]) { by[g] = []; order.push(g); } by[g].push(f); });
    const go = S.groupOrder.filter(g => by[g]).concat(order.filter(g => S.groupOrder.indexOf(g) < 0));
    return go.map(g => [g, by[g]]);
  }
  function detailHtml(code) {
    const d = S.oneCache.get(code);
    if (!d) return '<div class="pd-wait">모든 칸 받는 중…</div>';
    if (d.err) return `<div class="pd-wait">${esc(d.err)}</div>`;
    const skip = { '품번': 1, '품명': 1 };
    return groupsOfFields(d.fields.filter(f => !skip[f.col])).map(([g, fs], gi) => {
      const all = S.secOpen[g]; let filled = 0;
      const tiles = fs.map(f => {
        const v = String(f.value || '').trim(); if (v) filled++; if (!v && !all) return '';
        const wide = v.length > 14;
        const vh = v ? (f.col === '관리_상태' ? STB(v) : esc(v)) : '<span class="pd-empty">—</span>';
        return `<div class="pd-tile${wide ? ' wide' : ''}${v ? '' : ' none'}"><span class="pd-tk">${esc(f.col)}</span><div class="pd-tv"><span>${vh}</span>${v ? `<button class="pd-copy" data-copy="${esc(v)}" title="복사">${COPY}</button>` : ''}</div></div>`;
      }).join('');
      return `<div class="pd-sec g${gi % 6}"><div class="pd-sech"><b><i class="pd-dot"></i>${esc(g)}</b><span><span class="pd-frac">${filled}/${fs.length}</span><button class="pd-tog" data-sec="${esc(g)}">${all ? '빈 칸 숨기기' : '빈 칸 보기'}</button></span></div>` +
        `<div class="pd-tiles">${tiles || '<span class="pd-empty">채워진 칸이 없습니다</span>'}</div></div>`;
    }).join('');
  }
  async function fetchOne(code, gid) {
    if (S.oneCache.has(code)) return;
    try { const d = await SRC.one(code); S.oneCache.set(code, { fields: d.fields || [] }); }
    catch (e) { S.oneCache.set(code, { err: '받지 못했습니다 — ' + e.message }); }
    if (S.openGid === gid) rerender(gid);
  }
  function cardHtml(g) {
    const ai = S.active[g.gid] || 0, i = g.items[ai], q = S.F.q, color = lineColor(g.line), code = val('품번', i);
    const tags = `<span class="pd-ln" style="color:${color}">${esc(g.line || '라인 없음')}</span>` +
      (g.mid ? `<span class="pd-mono" title="관리_중품번">${highlight(g.mid, q)}</span>` : '<span class="pd-faint">중품번 없음</span>') +
      `<span>${esc(val('브랜드_olive', i))}</span>` + (has(val('규격', i)) ? `<span>${esc(val('규격', i))}</span>` : '') + STB(stOf(i)) +
      (g.items.length > 1 ? `<span class="pd-faint">품번 ${g.items.length}개</span>` : '');
    let tabs = '';
    if (g.items.length > 1) {
      tabs = '<div class="pd-vtabs">' + g.items.map((it, ii) => {
        const nm = String(val('품명', it)); const suf = nm.startsWith(g.base) ? nm.slice(g.base.length).trim() : nm;
        return `<button class="pd-vtab${ii === ai ? ' on' : ''}" data-gid="${g.gid}" data-ii="${ii}" title="${esc(nm)}"><span class="pd-vtop"><input type="checkbox" class="pd-sel" data-i="${it}"${S.sel.has(it) ? ' checked' : ''}><b>${esc(val('품번', it))}</b></span>${suf ? `<span class="pd-vsuf">${esc(suf)}</span>` : ''}</button>`;
      }).join('') + '</div>';
    }
    const open = S.openGid === g.gid;
    return `<div class="pd-card${open ? ' open' : ''}" style="border-left-color:${color}" data-gid="${g.gid}">` +
      `<div class="pd-head" data-toggle="${g.gid}"><div class="pd-hl"><label class="pd-ckwrap"><input type="checkbox" class="pd-sel" data-i="${i}"${S.sel.has(i) ? ' checked' : ''}></label>` +
      `<div class="pd-ht"><div class="pd-name">${highlight(g.base, q)}</div><div class="pd-tags">${tags}</div></div></div>` +
      `<div class="pd-hr"><div><div class="pd-eye">품번</div><div class="pd-sku">${highlight(code, q)}</div><div class="pd-bc">${esc(val('바코드', i))}</div></div><svg class="pd-chev" width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></div></div>` +
      tabs + `<div class="pd-detail">${open ? detailHtml(code) : ''}</div></div>`;
  }
  function rerender(gid) { const el = document.querySelector(`#pdCards .pd-card[data-gid="${gid}"]`); if (el) el.outerHTML = cardHtml(S.gById[gid]); }
  function renderCards(reset) {
    const box = $d('#pdCards');
    if (reset) { S.shown = 0; box.innerHTML = ''; }
    if (!S.groups.length) { box.innerHTML = '<div class="pd-none"><b>조건에 맞는 품목이 없어요</b><br>품명 · 품번 · 바코드 · 라인 · 중품번으로 다시 찾아보세요</div>'; $d('#pdMore').textContent = ''; return; }
    const end = Math.min(S.groups.length, S.shown + PAGE);
    box.insertAdjacentHTML('beforeend', S.groups.slice(S.shown, end).map(cardHtml).join(''));
    S.shown = end;
    $d('#pdMore').textContent = S.shown < S.groups.length ? `${fmt(S.shown)} / ${fmt(S.groups.length)}개 묶음 — 아래로 내리면 이어서` : `${fmt(S.groups.length)}개 묶음 모두`;
  }

  /* ── 표(보이는 줄만) ── */
  function colW(k) { return k === '품명' ? 300 : k === '품번' ? 96 : k === '바코드' ? 140 : k === '관리_중품번명' ? 260 : k === '등록일' ? 100 : Math.max(90, Math.min(180, k.length * 13 + 30)); }
  function sortIdx() {
    const k = S.sort.k, dir = S.sort.dir, a = Array.from(S.idx), arr = S.C[k] || [];
    if (k === '등록일') a.sort((x, y) => (S.TS[x] - S.TS[y]) * dir || 0);
    else { const co = new Intl.Collator('ko', { numeric: true }); a.sort((x, y) => { const p = arr[x], q = arr[y]; if (!has(p) && has(q)) return 1; if (!has(q) && has(p)) return -1; return co.compare(String(p), String(q)) * dir; }); }
    S.sidx = Int32Array.from(a);
  }
  function renderHead() {
    const show = S.tShow.filter(k => S.C[k]);
    $d('#pdCg').innerHTML = '<col style="width:36px">' + show.map(k => `<col style="width:${colW(k)}px">`).join('');
    $d('#pdVt').style.width = (36 + show.reduce((s, k) => s + colW(k), 0)) + 'px';
    $d('#pdTh').innerHTML = '<tr><th class="ck"></th>' + show.map((k, i) => `<th data-sort="${esc(k)}" class="${i === 0 ? 'stick' : ''}" title="누르면 정렬">${esc(k)}${S.sort.k === k ? `<i>${S.sort.dir > 0 ? '▲' : '▼'}</i>` : ''}</th>`).join('') + '</tr>';
    $d('#pdCols').innerHTML = S.cols.map(k => `<button class="pd-gchip${S.tShow.indexOf(k) >= 0 ? ' on' : ''}" data-col="${esc(k)}">${esc(k)}</button>`).join('');
  }
  function renderRows(force) {
    const sc = $d('#pdTscroll'), tb = $d('#pdTb'), n = S.sidx ? S.sidx.length : 0, show = S.tShow.filter(k => S.C[k]);
    $d('#pdTCount').textContent = `${fmt(n)}개 · ${show.length}열`;
    if (!n) { tb.innerHTML = `<tr><td colspan="${show.length + 1}"><div class="pd-none"><b>조건에 맞는 품목이 없어요</b></div></td></tr>`; S.lastSlice = ''; return; }
    const top = Math.max(0, sc.scrollTop - 36), vis = Math.ceil(sc.clientHeight / ROW_H) + 8, s = Math.max(0, Math.floor(top / ROW_H) - 4), e = Math.min(n, s + vis);
    const key = s + ':' + e + ':' + n + ':' + show.length; if (!force && key === S.lastSlice) return; S.lastSlice = key;
    let h = `<tr><td colspan="${show.length + 1}" style="padding:0;border:0;height:${s * ROW_H}px"></td></tr>`;
    for (let j = s; j < e; j++) {
      const i = S.sidx[j];
      h += `<tr data-i="${i}"><td class="ck"><input type="checkbox" class="pd-sel" data-i="${i}"${S.sel.has(i) ? ' checked' : ''}></td>` + show.map((k, ci) => {
        let v = val(k, i);
        if (k === '관리_상태') v = STB(v || '미판정'); else if (k === '관리_라인명' && v) v = `<b style="color:${lineColor(v)}">${esc(v)}</b>`; else v = esc(v);
        return `<td class="${ci === 0 ? 'stick code' : ''}">${v}</td>`;
      }).join('') + '</tr>';
    }
    h += `<tr><td colspan="${show.length + 1}" style="padding:0;border:0;height:${(n - e) * ROW_H}px"></td></tr>`;
    tb.innerHTML = h;
  }

  /* ── 대시보드 ── */
  function hbar(x, y, w, h, r = 4) { if (w <= 0) return ''; r = Math.min(r, w, h / 2); return `M${x},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h - r}Q${x + w},${y + h} ${x + w - r},${y + h}H${x}Z`; }
  function vbar(x, y, w, h, r = 4) { if (h <= 0) return ''; r = Math.min(r, h, w / 2); return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`; }
  function niceMax(v) { if (v <= 5) return 5; const p = Math.pow(10, Math.floor(Math.log10(v))), m = v / p; return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p; }
  const W = el => Math.max(260, el.parentNode.clientWidth - 32);
  function tipOn(svg) {
    const tip = $d('#pdTip');
    svg.onmousemove = e => { const g = e.target.closest('[data-tip]'); if (!g) { tip.style.opacity = 0; return; } tip.innerHTML = g.dataset.tip; tip.style.opacity = 1; tip.style.left = Math.min(e.clientX + 14, innerWidth - tip.offsetWidth - 8) + 'px'; tip.style.top = Math.max(8, e.clientY - tip.offsetHeight - 10) + 'px'; };
    svg.onmouseleave = () => { tip.style.opacity = 0; };
  }
  function renderDash() {
    const a = S.agg, F = S.F, T = a.n;
    const k = [['전체', '', '', T, '걸러진 품목'], ['정상운영', 'status', '정상운영', a.byS['정상운영'], pct(a.byS['정상운영'], T)], ['운영중단(단종)', 'status', '운영중단(단종)', a.byS['운영중단(단종)'], pct(a.byS['운영중단(단종)'], T)],
      ['생산중지', 'status', '생산중지', a.byS['생산중지'], pct(a.byS['생산중지'], T)], ['최근 30일 신규', 'days', '30', a.recent, '등록일 기준']];
    $d('#pdKpis').innerHTML = k.map(([l, key, v, n, d]) => { const on = key === 'status' ? F.status === v : key === 'days' ? F.days === 30 : false;
      return `<button class="pd-kpi${on ? ' on' : ''}" data-k="${key}" data-v="${esc(v)}"><div class="k">${key === 'status' ? `<i class="pd-dot" style="background:var(${ST_VAR[v]})"></i>` : ''}${l}</div><div class="v">${fmt(n)}</div><div class="d">${d}</div></button>`; }).join('');
    $d('#pdLg').innerHTML = STATUSES.map(s => `<span><i class="pd-dot" style="background:var(${ST_VAR[s]})"></i>${s}</span>`).join('');
    // 브랜드 × 관리_상태
    { const svg = $d('#pdCBrand'), w = W(svg), rowH = 24, padL = 86, padR = 56, rows = Object.entries(a.byB).map(([b, o]) => ({ b, ...o })).sort((x, y) => y.t - x.t);
      const max = niceMax(Math.max(1, ...rows.map(r => r.t))), h = rows.length * rowH + 18, sx = v => (w - padL - padR) * v / max; let s = '';
      for (let t = 0; t <= 4; t++) { const x = padL + sx(max * t / 4); s += `<line class="gl" x1="${x}" x2="${x}" y1="0" y2="${h - 18}"/><text x="${x}" y="${h - 4}" text-anchor="middle">${fmt(max * t / 4)}</text>`; }
      rows.forEach((r, i) => { const y = i * rowH + 4, bh = rowH - 9; let x = padL; const dim = F.brand && F.brand !== r.b;
        const tt = `<b>${esc(r.b)}</b> · ${fmt(r.t)}개<br>` + STATUSES.map(st => `${st} ${fmt(r[st])}`).join('<br>');
        s += `<g class="row${dim ? ' dim' : ''}" data-brand="${esc(r.b)}" data-tip="${esc(tt)}"><rect class="hit" x="0" y="${y - 4}" width="${w}" height="${rowH}"/><text class="lbl" x="${padL - 8}" y="${y + bh / 2 + 4}" text-anchor="end">${esc(r.b)}</text>`;
        const segs = STATUSES.filter(st => r[st] > 0); segs.forEach((st, j) => { const sw = sx(r[st]), last = j === segs.length - 1, ww = Math.max(0, sw - (last ? 0 : 2));
          s += last ? `<path class="mk" d="${hbar(x, y, ww, bh)}" fill="var(${ST_VAR[st]})"/>` : `<rect class="mk" x="${x}" y="${y}" width="${ww}" height="${bh}" fill="var(${ST_VAR[st]})"/>`; x += sw; });
        s += `<text class="v" x="${padL + sx(r.t) + 6}" y="${y + bh / 2 + 4}">${fmt(r.t)}</text></g>`; });
      svg.setAttribute('viewBox', `0 0 ${w} ${h}`); svg.setAttribute('height', h); svg.innerHTML = s; tipOn(svg); }
    // 월별 신규
    { const svg = $d('#pdCMonth'), w = W(svg), h = 230, padL = 34, padB = 22, padT = 8, vals = S.months.map(m => a.byM[m] || 0), max = niceMax(Math.max(1, ...vals)), bw = (w - padL) / S.months.length, sy = v => (h - padB - padT) * v / max; let s = '';
      for (let t = 0; t <= 4; t++) { const y = h - padB - sy(max * t / 4); s += `<line class="gl" x1="${padL}" x2="${w}" y1="${y}" y2="${y}"/><text x="${padL - 6}" y="${y + 4}" text-anchor="end">${fmt(max * t / 4)}</text>`; }
      S.months.forEach((m, i) => { const v = vals[i], x = padL + i * bw + 1, ww = Math.max(2, bw - 2), bh = sy(v), dim = F.month && F.month !== m;
        s += `<g class="row${dim ? ' dim' : ''}" data-month="${m}" data-tip="${esc(`<b>${m}</b> · 신규 ${fmt(v)}개`)}"><rect class="hit" x="${padL + i * bw}" y="${padT}" width="${bw}" height="${h - padT - padB}"/><path class="mk" d="${vbar(x, h - padB - bh, ww, bh)}" fill="var(--pd-bar)"/>`;
        if (i % 3 === 0) s += `<text x="${x + ww / 2}" y="${h - 6}" text-anchor="middle">${m.slice(2).replace('-', '.')}</text>`; s += '</g>'; });
      s += `<line class="ax" x1="${padL}" x2="${w}" y1="${h - padB}" y2="${h - padB}"/>`;
      svg.setAttribute('viewBox', `0 0 ${w} ${h}`); svg.setAttribute('height', h); svg.innerHTML = s; tipOn(svg); }
    const list = (id, items, attr, act, fv, maxV) => { const svg = $d(id), w = W(svg), rowH = 24, padL = 120, padR = 56, max = maxV || niceMax(Math.max(1, ...items.map(r => r.v))), h = items.length * rowH + 4, sx = v => (w - padL - padR) * v / max; let s = '';
      items.forEach((r, i) => { const y = i * rowH + 3, bh = rowH - 9, dim = act && act !== r.key;
        s += `<g class="row${dim ? ' dim' : ''}" data-${attr}="${esc(r.key)}" data-tip="${esc(r.tip)}"><rect class="hit" x="0" y="${y - 3}" width="${w}" height="${rowH}"/><text class="lbl" x="${padL - 8}" y="${y + bh / 2 + 4}" text-anchor="end">${esc(r.label.length > 14 ? r.label.slice(0, 13) + '…' : r.label)}</text>` +
          `<rect x="${padL}" y="${y}" width="${w - padL - padR}" height="${bh}" rx="4" fill="var(--pd-track)"/><path class="mk" d="${hbar(padL, y, sx(r.v), bh)}" fill="var(--pd-bar)"/><text class="v" x="${w - padR + 8}" y="${y + bh / 2 + 4}">${fv(r)}</text></g>`; });
      svg.setAttribute('viewBox', `0 0 ${w} ${h}`); svg.setAttribute('height', h); svg.innerHTML = s; tipOn(svg); };
    list('#pdCLine', Object.entries(a.byL).filter(([k]) => k !== '(라인 없음)').sort((x, y) => y[1] - x[1]).slice(0, 12).map(([k, v]) => ({ key: k, label: k, v, tip: `<b>${esc(k)}</b> · ${fmt(v)}개 (${pct(v, T)})` })), 'line', F.line, r => fmt(r.v));
    list('#pdCFill', FILL.filter(c => S.C[c]).map(c => ({ key: c, label: c, v: T ? a.fill[c] / T * 100 : 0, tip: `<b>${esc(c)}</b> · 값 있음 ${fmt(a.fill[c])} / 빈칸 ${fmt(T - a.fill[c])}` })), 'blank', F.blank, r => r.v.toFixed(0) + '%', 100);
  }

  /* ── 오른쪽 다운로드 목록 ── */
  function renderCats() {
    const gs = S.groupOrder.length ? S.groupOrder : [...new Set(Object.values(S.colGroup))];
    const n = g => S.allCols.filter(c => (S.colGroup[c] || FALLBACK_G()) === g).length;
    $d('#pdCats').innerHTML = gs.map((g, i) => `<label class="pd-cat"><input type="checkbox" data-cat="${esc(g)}"${i < 2 ? ' checked' : ''}> ${esc(g)}<span>${n(g)}</span></label>`).join('');
  }
  function renderSel() {
    const ks = [...S.sel]; $d('#pdSelCount').textContent = `${ks.length}개 선택됨`; $d('#pdDl').disabled = !ks.length;
    $d('#pdSelList').innerHTML = ks.length ? ks.map(i => `<div class="pd-si"><div><div class="nm">${esc(val('품명', i))}</div><div class="cd">${esc(val('품번', i))}</div></div><button data-i="${i}" title="빼기">×</button></div>`).join('')
      : '<div class="pd-sempty">카드나 표에서<br>체크박스로 품목을 고르면<br>여기에 모여요</div>';
  }
  function setSel(i, on) { on ? S.sel.add(i) : S.sel.delete(i); document.querySelectorAll(`#paneDash .pd-sel[data-i="${i}"]`).forEach(c => { c.checked = on; }); renderSel(); }
  async function download() {
    const cats = [...document.querySelectorAll('#pdCats input:checked')].map(x => x.dataset.cat), msg = $d('#pdDlMsg');
    if (!cats.length) { msg.textContent = '포함할 정보를 하나 이상 고르세요'; return; }
    const codes = [...S.sel].map(i => val('품번', i)).filter(Boolean);
    if (codes.length > 500) { msg.textContent = '한 번에 500개까지 받을 수 있습니다'; return; }
    const cols = S.allCols.filter(c => c === '품번' || cats.indexOf(S.colGroup[c] || FALLBACK_G()) >= 0);
    msg.textContent = '뽑는 중…';
    try {
      const rows = []; let off = 0;
      for (let k = 0; k < 20; k++) {     // 셀 예산에 걸리면 이어 받는다
        const d = await SRC.search({ filters: [{ col: '품번', op: '여럿중', value: codes.join('\n') }], columns: cols, sort: { col: '품번', dir: 'asc' }, limit: 10000, offset: off });
        (d.rows || []).forEach(r => rows.push(r)); off += (d.rows || []).length;
        if (!d.more || !(d.rows || []).length) break;
      }
      const cell = v => { const t = v == null ? '' : String(v); return /[",\n\r]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t; };
      const text = '\ufeff' + [cols.map(cell).join(',')].concat(rows.map(r => cols.map(c => cell(r[c])).join(','))).join('\r\n');
      const d0 = new Date(), stamp = d0.getFullYear() + String(d0.getMonth() + 1).padStart(2, '0') + String(d0.getDate()).padStart(2, '0');
      const name = `상품목록_${stamp}_${rows.length}개.csv`;
      const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' })), el = document.createElement('a');
      el.href = url; el.download = name; document.body.appendChild(el); el.click(); el.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000);
      msg.textContent = `${name} · ${fmt(rows.length)}개 · ${cols.length}열`;
    } catch (e) { msg.textContent = '받지 못했습니다 — ' + e.message; }
  }

  /* ── 한 바퀴 ── */
  function setMsg(t) { const m = $d('#pdMsg'); m.textContent = t; m.classList.toggle('hidden', !t); }
  function draw() {
    renderNav();
    $d('#pdCount').textContent = `검색 결과 중품번 ${fmt(S.groups.length)}개 묶음 · ${fmt(S.agg.n)}개 품목`;
    if (S.view === 'card') renderCards(true);
    else if (S.view === 'table') { sortIdx(); $d('#pdTscroll').scrollTop = 0; renderRows(true); }
    else renderDash();
  }
  function update() {
    if (!S.loaded) return Promise.resolve({ filter: 0, render: 0 });
    const t0 = performance.now(); applyFilters(); const t1 = performance.now();
    draw(); $d('#pdScroll').scrollTop = 0;
    $d('#pdTFilter').textContent = (t1 - t0).toFixed(1) + ' ms';
    return new Promise(res => requestAnimationFrame(() => requestAnimationFrame(() => { const t = performance.now() - t1; $d('#pdTRender').textContent = t.toFixed(0) + ' ms'; res({ filter: t1 - t0, render: t }); })));
  }
  function setView(v) {
    S.view = v; document.querySelectorAll('#pdSeg button').forEach(b => b.classList.toggle('on', b.dataset.v === v));
    ['card', 'table', 'dash'].forEach(x => $d('#pdV_' + x).classList.toggle('hidden', x !== v));
    $d('#pdScroll').classList.toggle('tbl', v === 'table'); $d('#pdScroll').scrollTop = 0;
    if (!S.loaded) return;
    const t1 = performance.now(); draw();
    requestAnimationFrame(() => requestAnimationFrame(() => { $d('#pdTRender').textContent = (performance.now() - t1).toFixed(0) + ' ms'; }));
  }
  function fit() {   // 창 높이에 맞춘다 — 판 안에서만 굴린다
    const sh = $d('#paneDash .pd-shell'); if (!sh || !ON) return;
    sh.style.height = Math.max(480, innerHeight - sh.getBoundingClientRect().top - 10) + 'px';
  }
  async function bench() {
    if (!S.loaded) return;
    const box = $d('#pdBench'); box.classList.remove('hidden'); box.textContent = '속도 시험 중… (40번)';
    const save = { ...S.F }, rnd = (s => () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; })(7), p = a => a[(rnd() * a.length) | 0];
    const qs = ['크림', 'sb0', '880', '콜라겐', '토너', 'mt1', '세트', '50ml'], ls = Object.keys(S.agg.byL).slice(0, 30), res = { f: [], r: [] };
    for (let k = 0; k < 40; k++) {
      Object.assign(S.F, { q: rnd() < .4 ? p(qs) : '', brand: rnd() < .5 ? p(S.brands) : '', status: rnd() < .35 ? p(STATUSES) : '', line: rnd() < .25 ? p(ls) : '', month: '', blank: rnd() < .12 ? p(FILL) : '', days: 0 });
      const t = await update(); res.f.push(t.filter); res.r.push(t.render);
    }
    Object.assign(S.F, save); $d('#pdQ').value = S.F.q; await update();
    const avg = x => x.reduce((s, y) => s + y, 0) / x.length, mx = x => Math.max(...x), nm = { card: '카드', table: '표', dash: '대시보드' }[S.view];
    box.innerHTML = `<b>속도 시험 — ${nm} 보기</b> <span class="pd-faint">(조건 40번 · ${fmt(S.N)}줄 × ${S.cols.length}열)</span>` +
      `<table><tr><td></td><td class="n">평균</td><td class="n">최대</td></tr><tr><td>거르기·묶기·집계</td><td class="n">${avg(res.f).toFixed(1)} ms</td><td class="n">${mx(res.f).toFixed(1)} ms</td></tr>` +
      `<tr><td>그리기(화면에 보이기까지)</td><td class="n">${avg(res.r).toFixed(0)} ms</td><td class="n">${mx(res.r).toFixed(0)} ms</td></tr></table>` +
      `<div style="text-align:right;margin-top:8px"><button class="pd-pill pd-btn" data-close="1">닫기</button></div>`;
  }

  /* ── 이벤트 ── */
  function wire() {
    const pane = $d('#paneDash'); if (!pane) return;
    let qt = 0;
    $d('#pdQ').addEventListener('input', e => { clearTimeout(qt); qt = setTimeout(() => { S.F.q = e.target.value; update(); }, 120); });
    $d('#pdSeg').onclick = e => { const b = e.target.closest('button[data-v]'); if (b) setView(b.dataset.v); };
    $d('#pdBrand').onclick = e => { const b = e.target.closest('[data-brand]'); if (!b) return; S.F.brand = b.dataset.brand === S.F.brand ? '' : b.dataset.brand; S.F.line = ''; update(); };
    $d('#pdStatus').onclick = e => { const b = e.target.closest('[data-status]'); if (!b) return; S.F.status = b.dataset.status === S.F.status ? '' : b.dataset.status; update(); };
    $d('#pdChips').onclick = e => { const b = e.target.closest('[data-line]'); if (!b) return; S.F.line = S.F.line === b.dataset.line ? '' : b.dataset.line; update(); };
    $d('#pdChipMore').onclick = () => { $d('#pdChips').classList.toggle('more'); renderNav(); };
    $d('#pdReload').onclick = () => { S.loaded = false; load(true); };
    $d('#pdReset').onclick = () => { Object.assign(S.F, { q: '', brand: '', status: '', line: '', month: '', blank: '', days: 0 }); $d('#pdQ').value = ''; update(); };
    $d('#pdBenchBtn').onclick = bench;
    $d('#pdBench').onclick = e => { if (e.target.closest('[data-close]')) $d('#pdBench').classList.add('hidden'); };
    $d('#pdScroll').addEventListener('scroll', () => { const s = $d('#pdScroll'); if (S.view === 'card' && S.shown < S.groups.length && s.scrollTop + s.clientHeight > s.scrollHeight - 600) renderCards(false); }, { passive: true });
    $d('#pdCards').addEventListener('click', e => {
      const cp = e.target.closest('.pd-copy');
      if (cp) { e.stopPropagation(); const ok = () => { cp.classList.add('done'); setTimeout(() => cp.classList.remove('done'), 1200); }; try { navigator.clipboard.writeText(cp.dataset.copy).then(ok, ok); } catch (_) { ok(); } return; }
      if (e.target.closest('.pd-sel, .pd-ckwrap')) return;
      const tg = e.target.closest('.pd-tog'); if (tg) { S.secOpen[tg.dataset.sec] = !S.secOpen[tg.dataset.sec]; rerender(+tg.closest('.pd-card').dataset.gid); return; }
      const vt = e.target.closest('.pd-vtab');
      if (vt) { const gid = +vt.dataset.gid, prev = S.openGid; S.active[gid] = +vt.dataset.ii; S.openGid = gid; if (prev >= 0 && prev !== gid) rerender(prev); rerender(gid); fetchOne(val('품번', S.gById[gid].items[S.active[gid]]), gid); return; }
      const hd = e.target.closest('[data-toggle]');
      if (hd) { const gid = +hd.dataset.toggle, prev = S.openGid; S.openGid = prev === gid ? -1 : gid; if (prev >= 0 && prev !== gid) rerender(prev); rerender(gid);
        if (S.openGid === gid) fetchOne(val('품번', S.gById[gid].items[S.active[gid] || 0]), gid); }
    });
    pane.addEventListener('change', e => { const c = e.target.closest('.pd-sel'); if (c) setSel(+c.dataset.i, c.checked); });
    $d('#pdTscroll').addEventListener('scroll', () => renderRows(), { passive: true });
    $d('#pdTh').onclick = e => { const t = e.target.closest('[data-sort]'); if (!t) return; const k = t.dataset.sort; S.sort = S.sort.k === k ? { k, dir: -S.sort.dir } : { k, dir: k === '등록일' ? -1 : 1 };
      const t0 = performance.now(); sortIdx(); renderHead(); renderRows(true); $d('#pdTFilter').textContent = (performance.now() - t0).toFixed(1) + ' ms 정렬'; };
    $d('#pdCols').onclick = e => { const b = e.target.closest('[data-col]'); if (!b) return; const k = b.dataset.col, i = S.tShow.indexOf(k);
      if (i >= 0) { if (k !== '품번') S.tShow.splice(i, 1); } else S.tShow = S.cols.filter(c => c === k || S.tShow.indexOf(c) >= 0);
      renderHead(); renderRows(true); };
    $d('#pdTb').onclick = e => { if (e.target.closest('.pd-sel')) return; const tr = e.target.closest('tr[data-i]'); if (!tr) return; const i = +tr.dataset.i;
      const g = S.groupsAll.find(x => x.items.indexOf(i) >= 0); S.F.q = String(val('품번', i)); $d('#pdQ').value = S.F.q; applyFilters();
      S.openGid = g.gid; S.active[g.gid] = g.items.indexOf(i); setView('card'); fetchOne(S.F.q, g.gid); };
    $d('#pdKpis').onclick = e => { const b = e.target.closest('.pd-kpi'); if (!b) return; const k = b.dataset.k, v = b.dataset.v;
      if (k === 'status') S.F.status = S.F.status === v ? '' : v; else if (k === 'days') S.F.days = S.F.days === 30 ? 0 : 30; else Object.assign(S.F, { status: '', days: 0, month: '', blank: '' }); update(); };
    $d('#pdCBrand').onclick = e => { const g = e.target.closest('[data-brand]'); if (g) { S.F.brand = S.F.brand === g.dataset.brand ? '' : g.dataset.brand; S.F.line = ''; update(); } };
    $d('#pdCMonth').onclick = e => { const g = e.target.closest('[data-month]'); if (g) { S.F.month = S.F.month === g.dataset.month ? '' : g.dataset.month; update(); } };
    $d('#pdCLine').onclick = e => { const g = e.target.closest('[data-line]'); if (g) { S.F.line = S.F.line === g.dataset.line ? '' : g.dataset.line; update(); } };
    $d('#pdCFill').onclick = e => { const g = e.target.closest('[data-blank]'); if (g) { S.F.blank = S.F.blank === g.dataset.blank ? '' : g.dataset.blank; update(); } };
    $d('#pdSelList').onclick = e => { const b = e.target.closest('button[data-i]'); if (b) setSel(+b.dataset.i, false); };
    $d('#pdClear').onclick = () => { [...S.sel].forEach(i => setSel(i, false)); $d('#pdDlMsg').textContent = ''; };
    $d('#pdDl').onclick = download;
    addEventListener('resize', () => { fit(); if (S.loaded && S.view === 'dash' && ON) renderDash(); });
    renderSel();
  }
  /* items.js 가 탭을 붙일 때 한 번 · 들어올 때마다 enter · 나갈 때 leave */
  const HTML = `<div id="paneDash">
  <div class="pd-shell">
    <aside class="pd-left">
      <div class="pd-title">품목 마스터</div>
      <div class="pd-sub">품목조회</div>
      <div class="pd-lab">브랜드</div>
      <nav id="pdBrand"></nav>
      <div class="pd-lab">관리_상태</div>
      <nav id="pdStatus"></nav>
    </aside>
    <div class="pd-center">
      <div class="pd-top">
        <div><div class="pd-eyebrow">AX 품목 마스터</div><h2>상품목록 대시보드</h2></div>
        <div class="pd-seg" id="pdSeg"><button data-v="card" class="on">카드</button><button data-v="table">표</button><button data-v="dash">대시보드</button></div>
      </div>
      <div class="pd-search">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="2"/><path d="M21 21l-4.3-4.3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
        <input id="pdQ" type="search" placeholder="품명, 품번, 바코드, 라인, 중품번으로 검색" autocomplete="off">
      </div>
      <div class="pd-meta">
        <span>전체 <b id="pdTotal">–</b>개 품목 · <span id="pdCount"></span></span>
        <span class="pd-speed">
          <span class="pd-pill">받기 <b id="pdTLoad">–</b></span>
          <span class="pd-pill" title="마지막 검색·조건 — 거르기·묶기·집계">거르기 <b id="pdTFilter">–</b></span>
          <span class="pd-pill" title="마지막 검색·조건 — 화면에 보이기까지">그리기 <b id="pdTRender">–</b></span>
          <button class="pd-pill pd-btn" id="pdBenchBtn" title="조건 40가지를 연달아 바꿔 평균·최대를 잽니다">속도 시험</button>
        </span>
      </div>
      <div class="pd-asof"><span id="pdAsof"></span><span><button class="pd-pill pd-btn" id="pdReset">조건 지우기</button> <button class="pd-pill pd-btn" id="pdReload" title="품목조회 사본에서 다시 받습니다">새로고침</button></span></div>
      <div class="pd-filter"><span class="pd-flab">라인</span><div class="pd-chips" id="pdChips"></div><button class="pd-more" id="pdChipMore">더보기</button></div>
      <div class="pd-msg hidden" id="pdMsg"></div>
      <div class="pd-scroll" id="pdScroll">
        <div id="pdV_card"><div id="pdCards"></div><div class="pd-morerow" id="pdMore"></div></div>
        <div id="pdV_table" class="hidden">
          <div class="pd-tcard">
            <div class="pd-tbar"><span id="pdTCount"></span><span class="pd-cols" id="pdCols"></span></div>
            <div class="pd-tscroll" id="pdTscroll"><table class="pd-vt" id="pdVt"><colgroup id="pdCg"></colgroup><thead id="pdTh"></thead><tbody id="pdTb"></tbody></table></div>
          </div>
        </div>
        <div id="pdV_dash" class="hidden">
          <div class="pd-kpis" id="pdKpis"></div>
          <div class="pd-dgrid">
            <div class="pd-dc"><h3><i class="pd-dot"></i>브랜드별 품목 수</h3><div class="pd-hint">막대를 누르면 그 브랜드로 · 색은 관리_상태</div><div class="pd-lg" id="pdLg"></div><svg class="pd-chart" id="pdCBrand"></svg></div>
            <div class="pd-dc"><h3><i class="pd-dot"></i>월별 신규 등록</h3><div class="pd-hint">최근 24개월 · 등록일 기준 · 막대를 누르면 그 달만</div><svg class="pd-chart" id="pdCMonth"></svg></div>
            <div class="pd-dc"><h3><i class="pd-dot"></i>라인별 품목 수</h3><div class="pd-hint">많은 순 12개 · 누르면 그 라인으로</div><svg class="pd-chart" id="pdCLine"></svg></div>
            <div class="pd-dc"><h3><i class="pd-dot"></i>주요 칸 채움률</h3><div class="pd-hint">걸러진 품목 중 값이 있는 비율 · 누르면 «빈칸만»</div><svg class="pd-chart" id="pdCFill"></svg></div>
          </div>
        </div>
      </div>
    </div>
    <aside class="pd-right">
      <div class="pd-rh"><div class="pd-title">다운로드 목록</div><div class="pd-sub" id="pdSelCount">0개 선택됨</div></div>
      <div class="pd-slist" id="pdSelList"></div>
      <div class="pd-rf">
        <div class="pd-lab" style="padding:0 0 6px">포함할 정보</div>
        <div id="pdCats"></div>
        <button class="pd-dl" id="pdDl" disabled title="고른 품번 · 고른 칸 묶음을 CSV 로(엑셀에서 바로 열림)">CSV 다운로드</button>
        <div class="pd-dlmsg" id="pdDlMsg"></div>
        <button class="pd-clear" id="pdClear">선택 해제</button>
      </div>
    </aside>
  </div>
  <div class="pd-tip" id="pdTip"></div>
  <div class="pd-bench hidden" id="pdBench"></div>
</div>`;
  function mount(src, host) { SRC = src; if (host) host.innerHTML = HTML; wire(); }
  function enter() { ON = true; setTimeout(() => { fit(); load(false); }, 0); }
  function leave() { ON = false; }
  window.ItemsDash = { mount, enter, leave, load, state: S, bench };
})();
