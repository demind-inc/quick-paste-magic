import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { Storage } from "@plasmohq/storage";
import "./popup.css";

const storage = new Storage({ area: "local" });

async function loadStoredAuth(): Promise<{
  session: Session | null;
  apiKey: string | null;
}> {
  const [session, apiKey] = await Promise.all([
    storage.get<Session | null>("session"),
    storage.get<string | null>("apiKey"),
  ]);
  return {
    session: session ?? null,
    apiKey: apiKey ?? null,
  };
}

async function setStoredAuth(
  session: Session | null,
  apiKey: string | null
): Promise<void> {
  await storage.set("session", session);
  await storage.set("apiKey", apiKey);
}

async function clearStoredAuth(): Promise<void> {
  await storage.remove("session");
  await storage.remove("apiKey");
}

const SUPABASE_URL = process.env.PLASMO_PUBLIC_SUPABASE_URL ?? "";
const SUPABASE_PUBLISHABLE_KEY =
  process.env.PLASMO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";

const supabase =
  SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
      })
    : null;

type Snippet = {
  id?: string;
  title?: string;
  shortcut?: string;
  body?: string;
};

type Placeholder = { name: string; defaultValue?: string };

type Session = {
  access_token?: string;
  [key: string]: unknown;
};

function detectVariables(body: string) {
  const regex = /\{([^}]+)\}/g;
  const seen = new Set<string>();
  const results: Placeholder[] = [];
  let match: RegExpExecArray | null;
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

function resolveBody(body: string, values: Record<string, string>) {
  return body.replace(/\{([^}]+)\}/g, (_, raw) => {
    const [name, defaultVal] = raw.split("=");
    return values[name.trim()] ?? defaultVal?.trim() ?? `{${name.trim()}}`;
  });
}

function sendMessage<T = unknown>(
  type: string,
  payload: Record<string, unknown> = {}
) {
  return new Promise<T>((resolve) => {
    if (typeof chrome === "undefined" || !chrome.runtime?.sendMessage) {
      resolve(undefined as T);
      return;
    }
    chrome.runtime.sendMessage({ type, ...payload }, (res) =>
      resolve(res as T)
    );
  });
}

function useToast() {
  const [toast, setToast] = useState<string | null>(null);
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 2000);
    return () => clearTimeout(id);
  }, [toast]);
  return { toast, show: setToast };
}

function FillModal({
  snippet,
  vars,
  onCancel,
  onInsert,
}: {
  snippet: Snippet;
  vars: Placeholder[];
  onCancel: () => void;
  onInsert: (resolved: string) => void;
}) {
  const valuesRef = useRef<Record<string, string>>({});

  return (
    <div className="modal-overlay">
      <div className="modal">
        <h3>{snippet.title}</h3>
        <p className="modal-sub">Fill in placeholder values:</p>
        {vars.map((v) => (
          <div className="field-group" key={v.name}>
            <label>{`{${v.name}${
              v.defaultValue ? "=" + v.defaultValue : ""
            }}`}</label>
            <input
              data-var={v.name}
              placeholder={v.defaultValue ?? v.name}
              onChange={(e) => {
                valuesRef.current[v.name] = e.target.value;
              }}
            />
          </div>
        ))}
        <div className="modal-actions">
          <button id="modal-cancel" onClick={onCancel}>
            Cancel
          </button>
          <button
            id="modal-insert"
            onClick={() =>
              onInsert(resolveBody(snippet.body ?? "", valuesRef.current))
            }
          >
            Insert
          </button>
        </div>
      </div>
    </div>
  );
}

function SetupView({
  onConnect,
}: {
  onConnect: (p: {
    apiKey: string;
    email: string;
    password: string;
  }) => Promise<void>;
}) {
  const [apiKey, setApiKey] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  return (
    <div className="setup">
      <div className="logo">⚡ SnipDM</div>
      <p className="subtitle">Paste your workspace API key to sync snippets.</p>
      <input
        type="password"
        placeholder="Workspace API key…"
        value={apiKey}
        onChange={(e) => setApiKey(e.target.value)}
      />
      <input
        type="email"
        placeholder="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <input
        type="password"
        placeholder="Password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      <button
        disabled={loading}
        onClick={async () => {
          setError("");
          if (!apiKey.trim() || !email.trim() || !password) {
            setError("All fields are required.");
            return;
          }
          setLoading(true);
          try {
            await onConnect({
              apiKey: apiKey.trim(),
              email: email.trim(),
              password,
            });
          } catch (err: any) {
            setError(err?.message ?? "Login failed.");
          } finally {
            setLoading(false);
          }
        }}
      >
        {loading ? "Connecting…" : "Connect"}
      </button>
      <p id="error" className="error">
        {error}
      </p>
    </div>
  );
}

function MainView({
  snippets,
  onSync,
  onLogout,
  onInsert,
  onCopy,
}: {
  snippets: Snippet[];
  onSync: () => void;
  onLogout: () => void;
  onInsert: (s: Snippet) => void;
  onCopy: (s: Snippet) => void;
}) {
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

  return (
    <>
      <div className="header">
        <div className="logo">⚡ SnipDM</div>
        <button id="syncBtn" title="Sync now" onClick={onSync}>
          ↻
        </button>
      </div>
      <div className="search-wrap">
        <input
          id="search"
          type="text"
          placeholder="Search snippets…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
        />
      </div>
      <div id="list" className="list">
        {filtered.length === 0 ? (
          <p className="empty">No snippets found.</p>
        ) : (
          filtered.map((s, i) => (
            <div className="item" key={`${s.id ?? s.title}-${i}`}>
              <div className="item-title">{s.title}</div>
              {s.shortcut ? (
                <code className="item-shortcut">{s.shortcut}</code>
              ) : null}
              <div className="item-actions">
                <button className="btn-insert" onClick={() => onInsert(s)}>
                  Insert
                </button>
                <button className="btn-copy" onClick={() => onCopy(s)}>
                  Copy
                </button>
              </div>
            </div>
          ))
        )}
      </div>
      <div className="footer">
        <button id="logoutBtn" onClick={onLogout}>
          Sign out
        </button>
      </div>
    </>
  );
}

export default function Popup() {
  const [session, setSession] = useState<Session | null>(null);
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [snippets, setSnippets] = useState<Snippet[]>([]);
  const [modalData, setModalData] = useState<{
    snippet: Snippet;
    vars: Placeholder[];
    mode: "insert" | "copy";
  } | null>(null);
  const { toast, show } = useToast();

  // Restore auth from chrome.storage.local every time popup opens
  useEffect(() => {
    let cancelled = false;
    loadStoredAuth().then(({ session: s, apiKey: k }) => {
      if (!cancelled) {
        setSession(s);
        setApiKey(k);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const loadSnippets = async () => {
    const res = await sendMessage<{ snippets?: Snippet[] }>("GET_SNIPPETS");
    setSnippets(res?.snippets ?? []);
  };

  // Fetch snippets from API every time popup opens (when logged in)
  useEffect(() => {
    if (!session || !apiKey) return;
    const run = async () => {
      await sendMessage("SYNC_NOW");
      await loadSnippets();
    };
    void run();
  }, [session, apiKey]);

  const handleConnect = async ({
    apiKey: key,
    email,
    password,
  }: {
    apiKey: string;
    email: string;
    password: string;
  }) => {
    if (!supabase) {
      throw new Error(
        "Missing Supabase env vars. Set PLASMO_PUBLIC_SUPABASE_URL and PLASMO_PUBLIC_SUPABASE_ANON_KEY."
      );
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) {
      throw new Error(error.message ?? "Login failed.");
    }

    const sessionData = (data?.session ?? null) as unknown as Session | null;
    await setStoredAuth(sessionData, key);
    setSession(sessionData);
    setApiKey(key);
    await sendMessage("SET_SESSION");
  };

  const handleLogout = async () => {
    await clearStoredAuth();
    setSession(null);
    setApiKey(null);
    setSnippets([]);
  };

  const handleSync = async () => {
    try {
      const res = await sendMessage<{ ok?: boolean }>("SYNC_NOW");
      await loadSnippets();
      show(res?.ok !== false ? "Snippets updated" : "Sync failed — showing cached");
    } catch (err) {
      console.error("Sync failed:", err);
      show("Sync failed — showing cached");
      await loadSnippets();
    }
  };

  const handleInsert = (snippet: Snippet, mode: "insert" | "copy") => {
    const vars = detectVariables(snippet.body ?? "");
    if (vars.length > 0) {
      setModalData({ snippet, vars, mode });
      return;
    }
    void doInsert(snippet.body ?? "", mode);
  };

  const doInsert = async (text: string, mode: "insert" | "copy") => {
    if (mode === "copy") {
      await navigator.clipboard.writeText(text);
      show("Copied to clipboard!");
      return;
    }

    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    if (!tab?.id) {
      await navigator.clipboard.writeText(text);
      show("Copied! (no active tab)");
      return;
    }

    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: (textToInsert: string) => {
          const el = document.activeElement as
            | HTMLInputElement
            | HTMLTextAreaElement
            | HTMLElement
            | null;
          if (!el) return false;
          if (el.tagName === "INPUT" || el.tagName === "TEXTAREA") {
            const start = (el as HTMLInputElement).selectionStart || 0;
            const current = (el as HTMLInputElement).value;
            const nativeSetter =
              Object.getOwnPropertyDescriptor(
                window.HTMLTextAreaElement.prototype,
                "value"
              )?.set ||
              Object.getOwnPropertyDescriptor(
                window.HTMLInputElement.prototype,
                "value"
              )?.set;
            nativeSetter?.call(
              el,
              current.slice(0, start) + textToInsert + current.slice(start)
            );
            (el as HTMLInputElement).selectionStart = (
              el as HTMLInputElement
            ).selectionEnd = start + textToInsert.length;
            el.dispatchEvent(new Event("input", { bubbles: true }));
            return true;
          }
          if ((el as HTMLElement).isContentEditable) {
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
    return (
      <div className="setup">
        <div className="logo">⚡ SnipDM</div>
      </div>
    );
  }

  return (
    <div>
      {!session || !apiKey ? (
        <SetupView onConnect={handleConnect} />
      ) : (
        <MainView
          snippets={snippets}
          onSync={handleSync}
          onLogout={handleLogout}
          onInsert={(s) => handleInsert(s, "insert")}
          onCopy={(s) => handleInsert(s, "copy")}
        />
      )}
      {modalData ? (
        <FillModal
          snippet={modalData.snippet}
          vars={modalData.vars}
          onCancel={() => setModalData(null)}
          onInsert={(resolved) => {
            setModalData(null);
            void doInsert(resolved, modalData.mode);
          }}
        />
      ) : null}
      {toast ? <div className="toast">{toast}</div> : null}
    </div>
  );
}
