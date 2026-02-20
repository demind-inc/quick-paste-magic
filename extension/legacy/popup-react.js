/* global React, ReactDOM */
/**
 * SnipDM Extension Popup (React, no build step)
 * Uses React UMD builds bundled locally under extension/vendor.
 */

const SUPABASE_URL = "https://YOUR_SUPABASE_URL.supabase.co";
const SUPABASE_ANON_KEY = "YOUR_SUPABASE_ANON_KEY";

const h = React.createElement;
const { useEffect, useMemo, useRef, useState } = React;

function detectVariables(body) {
  const regex = /\{([^}]+)\}/g;
  const seen = new Set();
  const results = [];
  let match;
  while ((match = regex.exec(body)) !== null) {
    const [name, defaultVal] = match[1].split("=");
    const key = name.trim();
    if (!seen.has(key)) {
      seen.add(key);
      results.push({ name: key, defaultValue: defaultVal?.trim() });
    }
  }
  return results;
}

function resolveBody(body, values) {
  return body.replace(/\{([^}]+)\}/g, (_, raw) => {
    const [name, defaultVal] = raw.split("=");
    return values[name.trim()] ?? defaultVal?.trim() ?? `{${name.trim()}}`;
  });
}

function sendMessage(type, payload) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type, ...payload }, (res) => resolve(res));
  });
}

function useToast() {
  const [toast, setToast] = useState(null);
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 2000);
    return () => clearTimeout(id);
  }, [toast]);
  return { toast, show: setToast };
}

function FillModal({ snippet, vars, onCancel, onInsert }) {
  const valuesRef = useRef({});

  return h(
    "div",
    { className: "modal-overlay" },
    h(
      "div",
      { className: "modal" },
      h("h3", null, snippet.title),
      h("p", { className: "modal-sub" }, "Fill in placeholder values:"),
      vars.map((v) =>
        h(
          "div",
          { className: "field-group", key: v.name },
          h("label", null, `{${v.name}${v.defaultValue ? "=" + v.defaultValue : ""}}`),
          h("input", {
            "data-var": v.name,
            placeholder: v.defaultValue ?? v.name,
            onChange: (e) => {
              valuesRef.current[v.name] = e.target.value;
            },
          })
        )
      ),
      h(
        "div",
        { className: "modal-actions" },
        h(
          "button",
          { id: "modal-cancel", onClick: onCancel },
          "Cancel"
        ),
        h(
          "button",
          {
            id: "modal-insert",
            onClick: () => onInsert(resolveBody(snippet.body, valuesRef.current)),
          },
          "Insert"
        )
      )
    )
  );
}

function SetupView({ onConnect }) {
  const [apiKey, setApiKey] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  return h(
    "div",
    { className: "setup" },
    h("div", { className: "logo" }, "⚡ SnipDM"),
    h("p", { className: "subtitle" }, "Paste your workspace API key to sync snippets."),
    h("input", {
      type: "password",
      placeholder: "Workspace API key…",
      value: apiKey,
      onChange: (e) => setApiKey(e.target.value),
    }),
    h("input", {
      type: "email",
      placeholder: "Email",
      value: email,
      onChange: (e) => setEmail(e.target.value),
    }),
    h("input", {
      type: "password",
      placeholder: "Password",
      value: password,
      onChange: (e) => setPassword(e.target.value),
    }),
    h(
      "button",
      {
        disabled: loading,
        onClick: async () => {
          setError("");
          if (!apiKey.trim() || !email.trim() || !password) {
            setError("All fields are required.");
            return;
          }
          setLoading(true);
          try {
            await onConnect({ apiKey: apiKey.trim(), email: email.trim(), password });
          } catch (err) {
            setError(err?.message ?? "Login failed.");
          } finally {
            setLoading(false);
          }
        },
      },
      loading ? "Connecting…" : "Connect"
    ),
    h("p", { id: "error", className: "error" }, error)
  );
}

function MainView({ snippets, onSync, onLogout, onInsert, onCopy }) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    if (!q) return snippets;
    return snippets.filter(
      (s) =>
        s.title?.toLowerCase().includes(q) ||
        s.shortcut?.toLowerCase().includes(q) ||
        s.body?.toLowerCase().includes(q)
    );
  }, [snippets, query]);

  return h(
    React.Fragment,
    null,
    h(
      "div",
      { className: "header" },
      h("div", { className: "logo" }, "⚡ SnipDM"),
      h(
        "button",
        { id: "syncBtn", title: "Sync now", onClick: onSync },
        "↻"
      )
    ),
    h(
      "div",
      { className: "search-wrap" },
      h("input", {
        id: "search",
        type: "text",
        placeholder: "Search snippets…",
        value: query,
        onChange: (e) => setQuery(e.target.value),
        autoFocus: true,
      })
    ),
    h(
      "div",
      { id: "list", className: "list" },
      filtered.length === 0
        ? h("p", { className: "empty" }, "No snippets found.")
        : filtered.map((s, i) =>
            h(
              "div",
              { className: "item", key: `${s.id ?? s.title}-${i}` },
              h("div", { className: "item-title" }, s.title),
              s.shortcut
                ? h("code", { className: "item-shortcut" }, s.shortcut)
                : null,
              h(
                "div",
                { className: "item-actions" },
                h(
                  "button",
                  { className: "btn-insert", onClick: () => onInsert(s) },
                  "Insert"
                ),
                h(
                  "button",
                  { className: "btn-copy", onClick: () => onCopy(s) },
                  "Copy"
                )
              )
            )
          )
    ),
    h(
      "div",
      { className: "footer" },
      h(
        "button",
        { id: "logoutBtn", onClick: onLogout },
        "Sign out"
      )
    )
  );
}

function App() {
  const [session, setSession] = useState(null);
  const [apiKey, setApiKey] = useState(null);
  const [snippets, setSnippets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalData, setModalData] = useState(null);
  const { toast, show } = useToast();

  const loadSnippets = async () => {
    const res = await sendMessage("GET_SNIPPETS");
    setSnippets(res?.snippets ?? []);
  };

  useEffect(() => {
    chrome.storage.local.get(["session", "apiKey"], (res) => {
      setSession(res?.session ?? null);
      setApiKey(res?.apiKey ?? null);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    if (!session || !apiKey) return;
    loadSnippets();
  }, [session, apiKey]);

  const handleConnect = async ({ apiKey: key, email, password }) => {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_ANON_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email, password }),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error_description ?? "Login failed.");
    }

    await chrome.storage.local.set({ session: data, apiKey: key });
    await sendMessage("SET_SESSION", { session: data });
    setSession(data);
    setApiKey(key);
  };

  const handleLogout = async () => {
    await chrome.storage.local.clear();
    setSession(null);
    setApiKey(null);
    setSnippets([]);
  };

  const handleSync = async () => {
    await sendMessage("SYNC_NOW");
    loadSnippets();
  };

  const handleInsert = (snippet, mode) => {
    const vars = detectVariables(snippet.body);
    if (vars.length > 0) {
      setModalData({ snippet, vars, mode });
      return;
    }
    doInsert(snippet.body, mode);
  };

  const doInsert = async (text, mode) => {
    if (mode === "copy") {
      await navigator.clipboard.writeText(text);
      show("Copied to clipboard!");
      return;
    }

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) {
      await navigator.clipboard.writeText(text);
      show("Copied! (no active tab)");
      return;
    }

    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: (textToInsert) => {
          const el = document.activeElement;
          if (!el) return false;
          if (el.tagName === "INPUT" || el.tagName === "TEXTAREA") {
            const start = el.selectionStart;
            const current = el.value;
            const nativeSetter =
              Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")
                ?.set ||
              Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
            nativeSetter?.call(el, current.slice(0, start) + textToInsert + current.slice(start));
            el.selectionStart = el.selectionEnd = start + textToInsert.length;
            el.dispatchEvent(new Event("input", { bubbles: true }));
            return true;
          }
          if (el.isContentEditable) {
            document.execCommand("insertText", false, textToInsert);
            return true;
          }
          return false;
        },
        args: [text],
      });
      window.close();
    } catch {
      await navigator.clipboard.writeText(text);
      show("Copied! (insertion blocked)");
    }
  };

  if (loading) {
    return h("div", { className: "setup" }, h("div", { className: "logo" }, "⚡ SnipDM"));
  }

  return h(
    "div",
    null,
    !session || !apiKey
      ? h(SetupView, { onConnect: handleConnect })
      : h(MainView, {
          snippets,
          onSync: handleSync,
          onLogout: handleLogout,
          onInsert: (s) => handleInsert(s, "insert"),
          onCopy: (s) => handleInsert(s, "copy"),
        }),
    modalData
      ? h(FillModal, {
          snippet: modalData.snippet,
          vars: modalData.vars,
          onCancel: () => setModalData(null),
          onInsert: (resolved) => {
            setModalData(null);
            doInsert(resolved, modalData.mode);
          },
        })
      : null,
    toast ? h("div", { className: "toast" }, toast) : null
  );
}

const mountNode = document.getElementById("root");
if (ReactDOM.createRoot) {
  const root = ReactDOM.createRoot(mountNode);
  root.render(h(App));
} else {
  ReactDOM.render(h(App), mountNode);
}
