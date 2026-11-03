/*
 * Dashboard bridge for self-contained wiki pages (public/wiki-apps/<wiki>/index.html).
 *
 * The wiki pages were first written as claude.ai artifacts, which reach storage,
 * the viewer's identity and Claude through window.claude.use(name). This file
 * provides the same small surface backed by the dashboard instead:
 *   use("db")     -> /wikis/<wiki>/docs   (MySQL, see wikis_api.py)
 *   use("user")   -> the signed-in dashboard user (JWT in localStorage)
 *   use("sample") -> /wikis/ai/chat       (Claude or local Ollama; tools run here)
 * Include it before the page's own script:  <script src="../bridge.js" data-wiki="enshrouded"></script>
 */
(function () {
  "use strict";
  var script = document.currentScript;
  var WIKI = (script && script.dataset.wiki) || "default";
  var API = (function () {
    // Local testing only: when the page itself is served from localhost, a local API can be
    // named with ?api=http://127.0.0.1:<port> or localStorage "wiki-api-override".
    if (/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) {
      var override = new URLSearchParams(location.search).get("api");
      try { override = override || localStorage.getItem("wiki-api-override"); } catch (e) {}
      if (override && /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(override)) return override;
    }
    try { if (window.parent && window.parent !== window && window.parent.DASHBOARD_API_URL) return window.parent.DASHBOARD_API_URL; } catch (e) {}
    return window.DASHBOARD_API_URL || "https://api.s-dashboard.com";
  })();

  // ---------- auth ----------
  function token() { try { return localStorage.getItem("token"); } catch (e) { return null; } }
  function claims() {
    var t = token(); if (!t) return null;
    try { var p = t.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"); return JSON.parse(decodeURIComponent(escape(atob(p)))); } catch (e) { return null; }
  }
  var refreshing = null;
  function refreshToken() {
    if (refreshing) return refreshing;
    var rt = null; try { rt = localStorage.getItem("refresh_token"); } catch (e) {}
    if (!rt) return Promise.resolve(null);
    refreshing = fetch(API + "/refresh", { method: "POST", headers: { Authorization: "Bearer " + rt } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) { if (d && d.token) { try { localStorage.setItem("token", d.token); } catch (e) {} return d.token; } return null; })
      .catch(function () { return null; })
      .finally(function () { refreshing = null; });
    return refreshing;
  }
  function api(path, opts, retried) {
    opts = opts || {};
    var headers = Object.assign({ "Content-Type": "application/json" }, opts.headers || {});
    var t = token(); if (t) headers.Authorization = "Bearer " + t;
    return fetch(API + path, Object.assign({}, opts, { headers: headers })).then(function (r) {
      if (r.status === 401 && !retried) return refreshToken().then(function (nt) { return nt ? api(path, opts, true) : r; });
      return r;
    });
  }
  function dbError(code, message) { return { code: code, message: message || code }; }

  // ---------- db ----------
  var listeners = {}; // collection path -> Set of refresh fns
  function notify(path) { (listeners[path] || new Set()).forEach(function (fn) { fn(); }); }
  function listDocs(path) {
    return api("/wikis/" + WIKI + "/docs?collection=" + encodeURIComponent(path)).then(function (r) {
      if (r.status === 401) throw dbError("revoked", "Signed out");
      if (r.status === 403) return { docs: [] };
      if (!r.ok) throw dbError("unavailable", "HTTP " + r.status);
      return r.json();
    }, function () { throw dbError("unavailable", "Network error"); });
  }
  function docSnap(id, data) {
    return { id: id, exists: data !== undefined, data: function () { return data; }, metadata: { fromCache: false, hasPendingWrites: false } };
  }
  function querySnap(docs) {
    var list = docs.map(function (d) { return docSnap(d.id, d.data); });
    return { docs: list, size: list.length, empty: !list.length, docChanges: function () { return []; }, metadata: { fromCache: false, hasPendingWrites: false } };
  }
  function writeDoc(path, id, data) {
    return api("/wikis/" + WIKI + "/docs?collection=" + encodeURIComponent(path) + "&id=" + encodeURIComponent(id),
      { method: "PUT", body: JSON.stringify({ data: data }) }).then(function (r) {
        if (r.status === 403 || r.status === 400) throw dbError("invalid_argument", "Not allowed");
        if (r.status === 413) throw dbError("quota_exceeded", "Too large");
        if (!r.ok) throw dbError("unavailable", "HTTP " + r.status);
        notify(path);
      }, function () { throw dbError("unavailable", "Network error"); });
  }
  function deleteDoc(path, id) {
    return api("/wikis/" + WIKI + "/docs?collection=" + encodeURIComponent(path) + "&id=" + encodeURIComponent(id), { method: "DELETE" })
      .then(function (r) {
        if (r.status === 403 || r.status === 400) throw dbError("invalid_argument", "Not allowed");
        if (!r.ok) throw dbError("unavailable", "HTTP " + r.status);
        notify(path);
      }, function () { throw dbError("unavailable", "Network error"); });
  }
  function docRef(path, id) {
    return {
      id: id, path: path + "/" + id,
      get: function () { return listDocs(path).then(function (j) { var d = j.docs.find(function (x) { return x.id === id; }); return docSnap(id, d ? d.data : undefined); }); },
      set: function (data) { return writeDoc(path, id, data); },
      update: function (data) { var self = this; return self.get().then(function (s) { if (!s.exists) throw dbError("invalid_argument", "Missing"); return writeDoc(path, id, Object.assign({}, s.data(), data)); }); },
      delete: function () { return deleteDoc(path, id); },
      onSnapshot: function (next, err) { return collectionRef(path).onSnapshot(function (qs) { var d = qs.docs.find(function (x) { return x.id === id; }); next(d || docSnap(id, undefined)); }, err); },
      collection: function (sub) { return collectionRef(path + "/" + id + "/" + sub); }
    };
  }
  function collectionRef(path, limit) {
    var q = {
      path: path,
      doc: function (id) { return docRef(path, id || ("d" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8))); },
      add: function (data) { var ref = q.doc(); return ref.set(data).then(function () { return ref; }); },
      where: function () { return q; },
      orderBy: function () { return q; },
      limit: function (n) { return collectionRef(path, n); },
      get: function () { return listDocs(path).then(function (j) { return querySnap(limit ? j.docs.slice(0, limit) : j.docs); }); },
      onSnapshot: function (next, err) {
        var alive = true;
        function load() {
          if (!alive) return;
          listDocs(path).then(function (j) { if (alive) next(querySnap(limit ? j.docs.slice(0, limit) : j.docs)); },
            function (e) { if (alive && e.code === "revoked") { alive = false; if (err) err(e); } });
        }
        (listeners[path] = listeners[path] || new Set()).add(load);
        load();
        var timer = setInterval(load, 30000);
        return function () { alive = false; clearInterval(timer); listeners[path] && listeners[path].delete(load); };
      }
    };
    return q;
  }
  var db = {
    collection: function (path) { return collectionRef(String(path).replace(/^data\/users\/me(\/|$)/, "data/users/" + selfId() + "$1")); },
    doc: function (path) { var p = String(path).split("/"); var id = p.pop(); return docRef(p.join("/"), id); }
  };

  // ---------- user ----------
  function selfId() { var c = claims(); return c && c.sub ? "u" + c.sub : null; }
  function isAdmin() { var c = claims(); return !!c && c.role === "admin"; }
  var user = {
    isOwner: function () { return Promise.resolve(isAdmin()); },
    canEdit: function () { return Promise.resolve(isAdmin()); },
    can: function (name) { return Promise.resolve(name === "data.write" ? isAdmin() : false); },
    id: function () { return Promise.resolve(selfId()); },
    me: function () { var c = claims() || {}; return Promise.resolve({ id: selfId(), name: c.username || "", avatarUrl: "", color: "#888", email: null, isOwner: isAdmin(), canEdit: isAdmin() }); },
    profiles: function (ids) { var out = {}; [].concat(ids || []).forEach(function (id) { out[id] = { id: id, name: "", avatarUrl: "", color: "#888", email: null, isMe: id === selfId(), guest: false }; }); return Promise.resolve(out); },
    search: function () { return Promise.resolve([]); }
  };

  // ---------- sample (AI chat with page-run tools) ----------
  function sampleErr(code, text) { var e = { code: code, message: code }; if (text) e.text = text; return e; }
  function mergeTurns(turns) {
    var out = [];
    turns.forEach(function (t) {
      var last = out[out.length - 1];
      if (last && last.role === t.role && typeof last.content === "string" && typeof t.content === "string") last.content += "\n\n" + t.content;
      else out.push({ role: t.role, content: t.content });
    });
    return out;
  }
  function sample(input, opts) {
    opts = opts || {};
    var tools = opts.tools || [];
    var defs = tools.map(function (t) { return { name: t.name, description: t.description, input_schema: t.inputSchema || { type: "object", properties: {} } }; });
    var messages = mergeTurns(typeof input === "string" ? [{ role: "user", content: input }] : input);
    var all = "";
    var signal = opts.signal;
    function round(n) {
      if (signal && signal.aborted) return Promise.reject(sampleErr("cancelled", all));
      if (n >= 8) return Promise.resolve();
      return api("/wikis/ai/chat", { method: "POST", body: JSON.stringify({ messages: messages, tools: defs }), signal: signal })
        .then(function (r) {
          if (r.status === 429) throw sampleErr("rate_limited", all);
          if (r.status === 503) throw sampleErr("sampling_disabled", all);
          if (r.status === 413) throw sampleErr("prompt_too_large", all);
          if (!r.ok) throw sampleErr("upstream_error", all);
          return r.json();
        }, function (e) { throw sampleErr(signal && signal.aborted ? "cancelled" : "upstream_error", all); })
        .then(function (res) {
          if (res.stop_reason === "refusal") throw sampleErr("refused");
          var text = (res.content || []).filter(function (b) { return b.type === "text"; }).map(function (b) { return b.text; }).join("");
          if (text) { all = all ? all + "\n\n" + text : text; if (opts.onText) { try { opts.onText({ text: all, delta: text }); } catch (e) {} } }
          var calls = (res.content || []).filter(function (b) { return b.type === "tool_use"; });
          if (!calls.length || res.stop_reason !== "tool_use") return;
          messages.push({ role: "assistant", content: res.content });
          return Promise.all(calls.map(function (c) {
            var tool = tools.find(function (t) { return t.name === c.name; });
            return Promise.resolve().then(function () {
              if (!tool) throw new Error("Unknown tool " + c.name);
              return tool.execute(c.input || {}, { signal: signal || new AbortController().signal });
            }).then(function (out) { return { type: "tool_result", tool_use_id: c.id, content: typeof out === "string" ? out : JSON.stringify(out === undefined ? null : out) }; },
              function (e) { return { type: "tool_result", tool_use_id: c.id, content: "Error: " + ((e && e.message) || e), is_error: true }; });
          })).then(function (results) { messages.push({ role: "user", content: results }); return round(n + 1); });
        });
    }
    return round(0).then(function () {
      if (!all) throw sampleErr("empty_completion");
      return { text: all, truncated: false, modelTierApplied: "default" };
    });
  }
  sample.limits = function () { return Promise.resolve({ maxPromptBytes: 262144, tools: { maxCount: 16 } }); };
  sample.json = function (input, opts) { return sample(input, opts).then(function (r) { var m = r.text.match(/[[{][\s\S]*[\]}]/); if (!m) throw sampleErr("invalid_json", r.text); return JSON.parse(m[0]); }); };

  var aiStatus = null;
  function aiAvailable() {
    if (!aiStatus) aiStatus = api("/wikis/ai/status").then(function (r) { return r.ok ? r.json() : { available: false }; }).then(function (j) { return !!j.available; }, function () { return false; });
    return aiStatus;
  }

  window.claude = {
    use: function (name) {
      if (!token()) return Promise.resolve(null);
      if (name === "db") return Promise.resolve(db);
      if (name === "user") return Promise.resolve(user);
      if (name === "sample") return aiAvailable().then(function (ok) { return ok ? sample : null; });
      return Promise.resolve(null);
    }
  };

  // ---------- embedding: tell the dashboard which page is showing; follow its theme ----------
  function postHash() { try { if (window.parent !== window) window.parent.postMessage({ type: "wiki-route", wiki: WIKI, hash: location.hash }, location.origin); } catch (e) {} }
  var origReplace = history.replaceState.bind(history);
  history.replaceState = function () { var r = origReplace.apply(null, arguments); postHash(); return r; };
  window.addEventListener("hashchange", postHash);
  try {
    var themeName = localStorage.getItem("themeName");
    if (themeName === "dark" || themeName === "light") document.documentElement.setAttribute("data-theme", themeName);
  } catch (e) {}
})();
