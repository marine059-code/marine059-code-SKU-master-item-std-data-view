/* ═══════════════════════════════════════════════════════════════
   품목조회 모듈 — 데이터 길 ② PC 앱 API (/api/core/items/*) (2026-11-02)
   ─────────────────────────────────────────────────────────────
   같은 화면(items.js)을 PC 앱(app.db)에 붙일 때 쓰는 길. Supabase 길(src_supabase.js)과 같은 함수·같은 모양의 답.
   앱의 API 가 이미 그 모양이라 대부분 그대로 넘긴다. 누가 보는지(actor)는 cfg.actor() 가 주면 싣는다.
   ═══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  function ItemsSrcApp(cfg) {
    cfg = cfg || {};
    const base = String(cfg.base || '/api/core').replace(/\/+$/, '');
    const actor = () => { try { return (cfg.actor && cfg.actor()) || {}; } catch (_) { return {}; } };

    async function call(path, body) {
      let r;
      try {
        r = await fetch(base + path, body === undefined ? {} : {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      } catch (e) { throw new Error('앱 서버에 닿지 않습니다 — 앱이 켜져 있는지 확인하세요.'); }
      let d = {}; try { d = await r.json(); } catch (_) { }
      if (!r.ok || d.error) throw new Error(d.error || `요청 실패 (${r.status})`);
      return d;
    }
    const qs = o => '?' + new URLSearchParams(o);
    let META = null;

    async function view(name) {
      const d = await call('/items/view' + qs({ me_emp_no: actor().emp_no || '', name: name || '' }));
      META = d;
      return { pref: d.pref, all_columns: d.all_columns, col_group: d.col_group || {}, group_order: d.group_order || [],
               col_groups: d.col_groups || null, custom_groups: !!d.custom_groups, saved: d.saved || [],
               ops: (d.summary || {}).ops || [], loaded: {}, ready: !!(d.summary || {}).ready };
    }
    return {
      kind: 'app', needsLogin: false,
      user: () => { const a = actor(); return a.name ? { id: a.emp_no || '', email: a.name } : null; },
      login: async () => null, logout: async () => null, onLogout: () => { },
      meta: async () => META || {},
      view,
      saveView: (pref, name) => call('/items/view', { actor: actor(), pref, name: name || '' }),
      dropView: name => call('/items/view/delete', { actor: actor(), name: name || '' }),
      search: body => call('/items/search', Object.assign({}, body, { actor: actor() })),
      distinct: (col, q, limit) => call('/items/distinct' + qs({ col, q: q || '', limit: limit || 60 })),
      one: itemNo => call('/items/one' + qs({ item_no: itemNo })),
      tree: p => call('/items/tree' + qs({ line: p.line || '', big: p.big || '', mid: p.mid || '' })),
      treeSearch: q => call('/items/tree/search' + qs({ q: q || '' })),
      treeOf: itemNo => call('/items/tree/of' + qs({ item_no: itemNo })),
    };
  }
  window.ItemsSrcApp = ItemsSrcApp;
})();
