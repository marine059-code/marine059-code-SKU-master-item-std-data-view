/* ═══════════════════════════════════════════════════════════════
   품목조회 모듈 — 데이터 길 ① Supabase (2026-11-02)
   ─────────────────────────────────────────────────────────────
   화면(items.js)은 이 길이 무엇인지 모른다. 아래 함수들만 부르고, 앱 API(src_app.js)와 같은 모양의 답을 받는다.
     view · saveView · dropView · search · distinct · one · tree · treeSearch · treeOf · meta
   로그인: Supabase Auth(이메일·비밀번호). 표·함수는 로그인한 사람만 읽는다(RLS · migrations/supa_001_items_web.sql).
   라이브러리 없이 fetch 만 쓴다 — 부르는 곳은 /auth/v1/token · /auth/v1/logout · /rest/v1/rpc/<함수> 셋뿐이다.
   ═══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  const STORE = 'olive_items_sb_session';

  function ItemsSrcSupabase(cfg) {
    const url = String(cfg.url || '').replace(/\/+$/, '');
    const key = String(cfg.key || '');
    let S = null;            // { access_token, refresh_token, expires_at(초), user:{id,email} }
    let META = null;
    let onLogout = null;

    try { S = JSON.parse(localStorage.getItem(STORE) || 'null'); } catch (_) { S = null; }
    const keep = () => { try { S ? localStorage.setItem(STORE, JSON.stringify(S)) : localStorage.removeItem(STORE); } catch (_) { } };

    class LoginNeeded extends Error { }

    function takeSession(d) {
      const now = Math.floor(Date.now() / 1000);
      S = { access_token: d.access_token, refresh_token: d.refresh_token,
            expires_at: d.expires_at || (now + (d.expires_in || 3600)),
            user: { id: (d.user || {}).id || '', email: (d.user || {}).email || '' } };
      keep();
    }

    function authErr(d, status) {
      const code = d.error_code || d.error || '';
      const msg = d.msg || d.error_description || d.message || '';
      if (code === 'invalid_credentials' || code === 'invalid_grant' || /invalid login/i.test(msg)) return '이메일 또는 비밀번호가 맞지 않습니다.';
      if (code === 'email_not_confirmed') return '이메일 확인이 아직 안 된 계정입니다 — 관리자에게 «Auto Confirm» 으로 다시 만들어 달라고 하세요.';
      if (code === 'over_request_rate_limit' || status === 429) return '너무 자주 시도했습니다 — 잠시 뒤에 다시 하세요.';
      return msg || `로그인 실패 (${status})`;
    }

    async function login(email, password) {
      let r;
      try {
        r = await fetch(url + '/auth/v1/token?grant_type=password', {
          method: 'POST', headers: { apikey: key, 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: String(email || '').trim(), password: String(password || '') }) });
      } catch (e) { throw new Error('Supabase 에 닿지 않습니다 — 인터넷 연결을 확인하세요.'); }
      let d = {}; try { d = await r.json(); } catch (_) { }
      if (!r.ok || !d.access_token) throw new Error(authErr(d, r.status));
      takeSession(d); META = null;
      return S.user;
    }

    async function refresh() {
      if (!S || !S.refresh_token) throw new LoginNeeded('로그인이 필요합니다.');
      const r = await fetch(url + '/auth/v1/token?grant_type=refresh_token', {
        method: 'POST', headers: { apikey: key, 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: S.refresh_token }) });
      let d = {}; try { d = await r.json(); } catch (_) { }
      if (!r.ok || !d.access_token) { S = null; keep(); throw new LoginNeeded('로그인이 끝났습니다 — 다시 로그인하세요.'); }
      takeSession(d);
    }

    async function logout() {
      const t = S && S.access_token;
      S = null; META = null; keep();
      if (t) { try { await fetch(url + '/auth/v1/logout', { method: 'POST', headers: { apikey: key, Authorization: 'Bearer ' + t } }); } catch (_) { } }
    }

    /* 로그인이 끝났으면(되살리기도 실패) 화면을 로그인으로 돌린다 */
    async function rpc(fn, p) {
      try { return await call(fn, p, false); }
      catch (e) { if (e instanceof LoginNeeded && onLogout) setTimeout(onLogout, 0); throw e; }
    }
    async function call(fn, p, retried) {
      if (!S) throw new LoginNeeded('로그인이 필요합니다.');
      if ((S.expires_at || 0) - 60 < Date.now() / 1000) await refresh();
      let r;
      try {
        r = await fetch(url + '/rest/v1/rpc/' + fn, {
          method: 'POST',
          headers: { apikey: key, Authorization: 'Bearer ' + S.access_token, 'Content-Type': 'application/json' },
          body: JSON.stringify({ p: p || {} }) });
      } catch (e) { throw new Error('Supabase 에 닿지 않습니다 — 인터넷 연결을 확인하세요.'); }
      if (r.status === 401 && !retried) { await refresh(); return call(fn, p, true); }
      let d = null; try { d = await r.json(); } catch (_) { }
      if (r.status === 401) { S = null; keep(); throw new LoginNeeded('로그인이 끝났습니다 — 다시 로그인하세요.'); }
      if (!r.ok) {
        const m = (d && (d.message || d.msg || d.error)) || `요청 실패 (${r.status})`;
        if (/permission denied/i.test(m)) throw new Error('이 계정으로는 볼 수 없습니다(권한 없음) — 관리자에게 문의하세요.');
        if (/Could not find the function/i.test(m)) throw new Error('Supabase 에 조회 함수가 아직 없습니다 — PC 에서 tools\\supa_items.bat 를 먼저 돌리세요.');
        throw new Error(m);
      }
      return d;
    }

    async function meta() {
      if (!META) META = await rpc('items_meta', {});
      return META;
    }
    const metaCols = () => ((META && META.columns && META.columns.columns) || []);

    /* core/items.py _fill() 과 같은 셈 — 저장한 뒤에 늘어난 열은 «꺼진 채» 필드마스터 앞 열 뒤에 끼우고,
       col_order 가 master 면 필드마스터 차례로 다시 세운다. 처음 여는 사람은 앞 아홉 열. */
    function fill(p, mine) {
      p = p || {};
      const cols = metaCols();
      const saved = (p.columns || []).filter(c => c && cols.indexOf(c.key) >= 0).map(c => ({ key: c.key, on: !!c.on, w: c.w | 0 }));
      const seen = new Set(saved.map(c => c.key));
      cols.forEach((c, i) => {
        if (seen.has(c)) return;
        let at = 0;
        for (let j = i - 1; j >= 0; j--) {
          const k = saved.findIndex(x => x.key === cols[j]);
          if (k >= 0) { at = k + 1; break; }
        }
        saved.splice(at, 0, { key: c, on: false, w: 0 }); seen.add(c);
      });
      let mode = String(p.col_order || 'master').toLowerCase();
      if (mode !== 'master' && mode !== 'manual') mode = 'master';
      let out = saved;
      if (mode === 'master') { const by = {}; saved.forEach(c => { by[c.key] = c; }); out = cols.filter(c => by[c]).map(c => by[c]); }
      if (!(p.columns || []).length) out.forEach((c, i) => { c.on = i < 9; });
      return { columns: out, filters: p.filters || [], sort: p.sort || { col: '품번', dir: 'asc' },
               limit: p.limit == null ? 0 : (p.limit | 0), col_order: mode, mine: !!mine };   // 0 = 전체(11-05)
    }

    async function view(name) {
      const m = await meta();
      const mine = await rpc('items_view_get', { name: name || '' });
      const c = m.columns || {};
      return {
        pref: fill(mine.pref || m.view_default || {}, !!mine.pref),
        all_columns: c.columns || [], col_group: c.groups || {}, group_order: c.group_order || [],
        col_groups: c.col_groups || null, custom_groups: !!c.custom_groups,
        saved: mine.saved || [], ops: m.ops || [], loaded: m.loaded || {}, ready: (c.columns || []).length > 0,
      };
    }
    async function saveView(pref, name) {
      const cols = metaCols();
      const keep_ = (pref.columns || []).filter(c => cols.indexOf(c.key) >= 0)
        .map(c => ({ key: c.key, on: !!c.on, w: Math.max(0, Math.min(c.w | 0, 600)) }));
      if (!keep_.some(c => c.on)) throw new Error('적어도 한 열은 켜 두어야 합니다. 다 끄면 볼 것이 없습니다.');
      await rpc('items_view_save', { name: name || '', payload: {
        columns: keep_, filters: pref.filters || [], sort: pref.sort || { col: '품번', dir: 'asc' },
        limit: pref.limit | 0, col_order: pref.col_order === 'manual' ? 'manual' : 'master' } });
      return { ok: true };
    }
    const dropView = name => rpc('items_view_drop', { name: name || '' });

    function search(body) {
      const b = Object.assign({}, body); delete b.actor; delete b.include_active;
      return rpc('items_search', b);
    }
    const distinct = (col, q, limit) => rpc('items_distinct', { col, q: q || '', limit: limit || 60 });

    async function one(itemNo) {
      await meta();
      const d = await rpc('items_one', { item_no: itemNo });
      const row = d.row || {};
      return { item_no: d.item_no, known: !!d.known, progress: '', state: null,
               fields: d.known ? metaCols().filter(c => c[0] !== '_').map(c => ({ col: c, value: row[c] == null ? '' : String(row[c]) })) : [] };
    }

    /* core/items.py _tree_name · _tree_fold 과 같은 셈 — 같은 코드에 이름이 여럿이면 한 줄로
       (수는 더하고 · 이름은 마스터 → 없으면 가장 많이 쓰인 것 · 나머지는 aliases). */
    function treeName(names) {
      let best = null;
      Object.keys(names).forEach(k => {
        const n = names[k];
        if (best === null || n > names[best] || (n === names[best] && k > best)) best = k;
      });
      return best || '';
    }
    function fold(rows, counts, master) {
      master = master || {};
      const acc = new Map();
      rows.forEach(r => {
        const a = acc.get(r.code) || { code: r.code, names: {}, n: 0, bigs: 0, mids: 0 };
        acc.set(r.code, a);
        a.names[r.name] = (a.names[r.name] || 0) + r.n;
        a.n += r.n; a.bigs = Math.max(a.bigs, r.bigs || 0); a.mids = Math.max(a.mids, r.mids || 0);
      });
      return [...acc.values()].map(a => {
        const name = master[a.code] || treeName(a.names);
        const others = Object.keys(a.names).filter(k => k !== name).sort();
        const row = { code: a.code, name, items: a.n };
        if (counts.indexOf('bigs') >= 0) row.bigs = a.bigs;
        if (counts.indexOf('mids') >= 0) row.mids = a.mids;
        if (others.length) row.aliases = others;
        return row;
      });
    }
    async function tree(prm) {
      const m = await meta();
      const mn = m.master_names || {};
      const d = await rpc('items_tree', { line: prm.line || '', big: prm.big || '', mid: prm.mid || '' });
      if (d.hint || d.level === 'item') return d;
      if (d.level === 'mid') return Object.assign(d, { rows: fold(d.rows, [], mn['관리_중품번']) });
      if (d.level === 'big') return Object.assign(d, { rows: fold(d.rows, ['mids'], mn['관리_대품번']) });
      const rows = fold(d.rows, ['bigs', 'mids'], mn['관리_라인']);
      const bmap = {};
      (d.brands || []).forEach(r => { (bmap[r.code] = bmap[r.code] || {})[r.b || '(기타)'] = r.n; });
      rows.forEach(r => { r.brands = bmap[r.code] || {}; });
      const b = m.brands || {};
      return { level: 'line', rows, total: d.rows.length, brand_names: b.names || {}, brand_master: b.master || [] };
    }
    async function treeSearch(q) {
      q = String(q || '').trim();
      if (!q) return { q, hits: [] };
      const d = await rpc('items_tree_search', { q, limit: 1000 });   // 앱은 300 — 브랜드로 좁힌 사람에게 뒤쪽 라인이 잘리지 않게 넉넉히
      const lim = d.limit || 300;
      const rows = (d.rows || []).slice(0, lim);
      const ql = q.toLowerCase();
      const hits = [], seen = new Set();
      const add = h => { const k = [h.level, h.line, h.big, h.mid].join('\u0001'); if (!seen.has(k)) { seen.add(k); hits.push(h); } };
      rows.forEach(r => {
        if (r.big.toLowerCase().includes(ql) || r.big_name.toLowerCase().includes(ql)) add({ level: 'big', line: r.line, big: r.big, mid: '' });
        if (r.mid.toLowerCase().includes(ql) || r.mid_name.toLowerCase().includes(ql)) add({ level: 'mid', line: r.line, big: r.big, mid: r.mid });
      });
      return { q, hits, more: (d.rows || []).length > lim };
    }
    async function treeOf(itemNo) {
      const d = await one(itemNo);
      if (!d.known) return { item_no: itemNo, known: false };
      const v = {}; d.fields.forEach(f => { v[f.col] = f.value; });
      if (!('관리_라인' in v)) return { item_no: itemNo, known: false, hint: '관리 코드 열이 없습니다.' };
      const line = v['관리_라인'] || '', big = v['관리_대품번'] || '', mid = v['관리_중품번'] || '';
      const [sib, bigs, mids] = await Promise.all([tree({ line, big, mid }), tree({ line }), tree({ line, big })]);
      return { item_no: itemNo, known: true,
               path: [{ level: 'line', code: line, name: v['관리_라인명'] || '' },
                      { level: 'big', code: big, name: v['관리_대품번명'] || '' },
                      { level: 'mid', code: mid, name: v['관리_중품번명'] || '' }],
               siblings: sib.rows || [], big_count: (bigs.rows || []).length, mid_count: (mids.rows || []).length };
    }

    return {
      kind: 'supabase', needsLogin: true, LoginNeeded,
      user: () => (S ? S.user : null),
      login, logout, onLogout: f => { onLogout = f; },
      meta, view, saveView, dropView, search, distinct, one, tree, treeSearch, treeOf,
      _fill: fill, _fold: fold,
    };
  }
  window.ItemsSrcSupabase = ItemsSrcSupabase;
})();
