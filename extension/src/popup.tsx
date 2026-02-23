import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { Storage } from "@plasmohq/storage";
import "./popup.css";

import logoUrl from "data-base64:~assets/logo.png";
import { WEB_DASHBOARD_URL } from "./constants";

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
  await storage.remove("domainAllowlist");
  await storage.remove("activeWorkspaceId");
}

async function clearStoredApiKey(): Promise<void> {
  await storage.remove("apiKey");
  await storage.remove("domainAllowlist");
  await storage.remove("activeWorkspaceId");
}

const SUPABASE_URL = process.env.PLASMO_PUBLIC_SUPABASE_URL ?? "";
const SUPABASE_PUBLISHABLE_KEY =
  process.env.PLASMO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";

let supabase: ReturnType<typeof createClient> | null = null;
let warnedInvalidSupabaseConfig = false;

const isValidSupabaseUrl = (url: string) => {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:";
  } catch {
    return false;
  }
};

const getSupabaseClient = () => {
  if (!supabase) {
    if (
      !SUPABASE_URL ||
      !SUPABASE_PUBLISHABLE_KEY ||
      !isValidSupabaseUrl(SUPABASE_URL)
    ) {
      if (!warnedInvalidSupabaseConfig) {
        warnedInvalidSupabaseConfig = true;
      }
      return null;
    }
    supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return supabase;
};

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
  onCopy,
}: {
  snippet: Snippet;
  vars: Placeholder[];
  onCancel: () => void;
  onInsert: (resolved: string) => void;
  onCopy: (resolved: string) => void;
}) {
  const modalRef = useRef<HTMLDivElement>(null);

  const getResolved = () => {
    const values: Record<string, string> = {};
    modalRef.current
      ?.querySelectorAll<HTMLInputElement>("input[data-var]")
      ?.forEach((input) => {
        const name = input.dataset.var ?? "";
        if (name) values[name] = input.value;
      });
    return resolveBody(snippet.body ?? "", values);
  };

  const handleInsert = () => onInsert(getResolved());
  const handleCopy = () => onCopy(getResolved());

  return (
    <div className="modal-overlay">
      <div className="modal" ref={modalRef}>
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
            />
          </div>
        ))}
        <div className="modal-actions">
          <button id="modal-cancel" onClick={onCancel}>
            Cancel
          </button>
          <button id="modal-copy" onClick={handleCopy}>
            Copy
          </button>
          <button id="modal-insert" onClick={handleInsert}>
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
      <div className="logo">
        <img src={logoUrl} alt="SnipDM" className="logo-img" />
        <span>SnipDM</span>
      </div>
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
  snippetsLoading,
  onSync,
  onLogout,
  onCopy,
}: {
  snippets: Snippet[];
  snippetsLoading: boolean;
  onSync: () => void;
  onLogout: () => void;
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
        <div className="logo">
          <img src={logoUrl} alt="SnipDM" className="logo-img" />
          <span>SnipDM</span>
        </div>
        <div className="header-actions">
          <a
            href={WEB_DASHBOARD_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-add-snippet"
            title="Add snippet"
          >
            Add snippet
          </a>
          <button
            id="syncBtn"
            className="sync-btn"
            title="Sync now"
            onClick={onSync}
            disabled={snippetsLoading}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M21 12a9 9 0 1 1-2.6-6.4" />
              <path d="M21 3v6h-6" />
            </svg>
          </button>
          <a
            href={`${WEB_DASHBOARD_URL}/settings/extension`}
            target="_blank"
            rel="noopener noreferrer"
            className="icon-link"
            title="Extension settings"
            aria-label="Open extension settings"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3h.1A1.7 1.7 0 0 0 9 3.1V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5h.1a1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8v.1A1.7 1.7 0 0 0 20.9 11H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
            </svg>
          </a>
        </div>
      </div>
      <div className="search-wrap">
        <input
          id="search"
          type="text"
          placeholder="Search snippets…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
          disabled={snippetsLoading}
        />
      </div>
      <div id="list" className="list">
        {snippetsLoading ? (
          <div className="snippets-loader" aria-label="Loading snippets">
            <span className="snippets-spinner" />
            <p className="empty">Loading snippets…</p>
          </div>
        ) : filtered.length === 0 ? (
          <p className="empty">No snippets found.</p>
        ) : (
          filtered.map((s, i) => (
            <div className="item" key={`${s.id ?? s.title}-${i}`}>
              <div className="item-title">{s.title}</div>
              {s.shortcut ? (
                <code className="item-shortcut">{s.shortcut}</code>
              ) : null}
              <div className="item-actions">
                <button className="btn-copy" onClick={() => onCopy(s)}>
                  Copy
                </button>
                <a
                  href={
                    s.id
                      ? `${WEB_DASHBOARD_URL}/snippets/${s.id}/edit`
                      : `${WEB_DASHBOARD_URL}/`
                  }
                  target="_blank"
                  rel="noopener noreferrer"
                  className="item-external"
                  title="Open in SnipDM"
                  aria-label="Open snippet in SnipDM"
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden
                  >
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                    <polyline points="15 3 21 3 21 9" />
                    <line x1="10" y1="14" x2="21" y2="3" />
                  </svg>
                </a>
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
  const [snippetsLoading, setSnippetsLoading] = useState(false);
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
    let cancelled = false;
    setSnippetsLoading(true);
    const run = async () => {
      try {
        const res = await sendMessage<{
          ok?: boolean;
          sessionInvalid?: boolean;
          invalidApiKey?: boolean;
        }>("SYNC_NOW");
        if (cancelled) return;
        if (res?.sessionInvalid) {
          await clearStoredAuth();
          setSession(null);
          setApiKey(null);
          setSnippets([]);
          return;
        }
        if (res?.invalidApiKey) {
          await clearStoredApiKey();
          setApiKey(null);
          setSnippets([]);
          return;
        }
        await loadSnippets();
      } finally {
        if (!cancelled) setSnippetsLoading(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
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
    const client = getSupabaseClient();
    if (!client) {
      throw new Error(
        "Invalid Supabase config. Set PLASMO_PUBLIC_SUPABASE_URL (https) and PLASMO_PUBLIC_SUPABASE_PUBLISHABLE_KEY."
      );
    }

    const { data, error } = await client.auth.signInWithPassword({
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
    const setRes = await sendMessage<{
      ok?: boolean;
      sessionInvalid?: boolean;
      invalidApiKey?: boolean;
    }>("SET_SESSION");
    if (setRes?.sessionInvalid) {
      await clearStoredAuth();
      setSession(null);
      setApiKey(null);
      throw new Error("Session invalid. Please sign in again.");
    }
    if (setRes?.invalidApiKey) {
      await clearStoredApiKey();
      setApiKey(null);
      throw new Error("Invalid workspace API key for this account.");
    }
  };

  const handleLogout = async () => {
    await clearStoredAuth();
    setSession(null);
    setApiKey(null);
    setSnippets([]);
  };

  const handleSync = async () => {
    setSnippetsLoading(true);
    try {
      const res = await sendMessage<{
        ok?: boolean;
        sessionInvalid?: boolean;
        invalidApiKey?: boolean;
      }>("SYNC_NOW");
      if (res?.sessionInvalid) {
        await clearStoredAuth();
        setSession(null);
        setApiKey(null);
        setSnippets([]);
        show("Session expired — signed out");
        return;
      }
      if (res?.invalidApiKey) {
        await clearStoredApiKey();
        setApiKey(null);
        setSnippets([]);
        show("Invalid workspace API key — please reconnect.");
        return;
      }
      await loadSnippets();
      show(
        res?.ok !== false ? "Snippets updated" : "Sync failed — showing cached"
      );
    } catch {
      show("Sync failed — showing cached");
      await loadSnippets();
    } finally {
      setSnippetsLoading(false);
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
      const response = await chrome.tabs.sendMessage(tab.id, {
        type: "INSERT_TEXT",
        text,
      });
      if (response?.ok) {
        try {
          await chrome.tabs.update(tab.id, { active: true });
        } catch {
          // ignore
        }
        window.close();
        return;
      }
    } catch {
      // Content script may not be loaded or INSERT_TEXT not handled
    }

    try {
      const results = await chrome.scripting.executeScript({
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
      const inserted = results?.[0]?.result === true;
      if (inserted) {
        window.close();
        return;
      }
    } catch {
      // executeScript failed (e.g. restricted page)
    }

    await navigator.clipboard.writeText(text);
    try {
      await chrome.tabs.update(tab.id, { active: true });
    } catch {
      // ignore
    }
    show("Copied! Paste with Cmd+V (or Ctrl+V)");
  };

  if (loading) {
    return (
      <div className="setup">
        <div className="logo">
          <img src={logoUrl} alt="SnipDM" className="logo-img" />
          <span>SnipDM</span>
        </div>
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
          snippetsLoading={snippetsLoading}
          onSync={handleSync}
          onLogout={handleLogout}
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
            void doInsert(resolved, "insert");
          }}
          onCopy={(resolved) => {
            setModalData(null);
            void doInsert(resolved, "copy");
          }}
        />
      ) : null}
      {toast ? <div className="toast">{toast}</div> : null}
    </div>
  );
}
