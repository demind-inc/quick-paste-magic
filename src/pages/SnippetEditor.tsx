import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Plus, X, FlaskConical, Variable } from "lucide-react";
import TestExpansionModal from "@/components/TestExpansionModal";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Tag { id: string; name: string; color: string; }
interface Folder { id: string; name: string; parent_id: string | null; }

function detectVariables(body: string): Array<{ name: string; defaultValue?: string }> {
  const regex = /\{([^}]+)\}/g;
  const seen = new Set<string>();
  const results: Array<{ name: string; defaultValue?: string }> = [];
  let match;
  while ((match = regex.exec(body)) !== null) {
    const raw = match[1];
    const [name, defaultValue] = raw.split("=");
    if (!seen.has(name.trim())) {
      seen.add(name.trim());
      results.push({ name: name.trim(), defaultValue: defaultValue?.trim() });
    }
  }
  return results;
}

export default function SnippetEditorPage() {
  const { id } = useParams<{ id?: string }>();
  const isNew = !id;
  const navigate = useNavigate();
  const { workspace, myRole } = useWorkspace();
  const { user } = useAuth();
  const { toast } = useToast();

  const [title, setTitle] = useState("");
  const [shortcut, setShortcut] = useState("");
  const [body, setBody] = useState("");
  const [sharedScope, setSharedScope] = useState<"private" | "workspace">("private");
  const [folderId, setFolderId] = useState<string | null>(null);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [newTagName, setNewTagName] = useState("");
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testOpen, setTestOpen] = useState(false);
  const [shortcutError, setShortcutError] = useState("");

  const variables = detectVariables(body);

  const fetchMeta = useCallback(async () => {
    if (!workspace) return;
    const [{ data: tagData }, { data: folderData }] = await Promise.all([
      supabase.from("tags").select("id, name, color").eq("workspace_id", workspace.id),
      supabase.from("folders").select("id, name, parent_id").eq("workspace_id", workspace.id),
    ]);
    if (tagData) setAllTags(tagData as Tag[]);
    if (folderData) setFolders(folderData as Folder[]);
  }, [workspace]);

  const fetchSnippet = useCallback(async () => {
    if (isNew || !workspace) return;
    setLoading(true);
    const { data } = await supabase
      .from("snippets")
      .select(`*, snippet_tags(tag_id)`)
      .eq("id", id)
      .single();

    if (data) {
      setTitle(data.title);
      setShortcut(data.shortcut ?? "");
      setBody(data.body);
      setSharedScope(data.shared_scope as "private" | "workspace");
      setFolderId(data.folder_id ?? null);
      setSelectedTagIds((data.snippet_tags as any[]).map((st) => st.tag_id));
    }
    setLoading(false);
  }, [id, isNew, workspace]);

  useEffect(() => {
    fetchMeta();
    fetchSnippet();
  }, [fetchMeta, fetchSnippet]);

  const handleSave = async () => {
    if (!workspace || !user) return;
    if (!title.trim()) {
      toast({ title: "Title is required", variant: "destructive" });
      return;
    }

    // Validate shortcut uniqueness
    if (shortcut.trim()) {
      const { data: existing } = await supabase
        .from("snippets")
        .select("id")
        .eq("workspace_id", workspace.id)
        .eq("shortcut", shortcut.trim())
        .neq("id", id ?? "00000000-0000-0000-0000-000000000000")
        .limit(1);

      if (existing && existing.length > 0) {
        setShortcutError("This shortcut is already in use in your workspace.");
        return;
      }
    }
    setShortcutError("");

    setSaving(true);
    try {
      let snippetId = id;

      if (isNew) {
        const { data, error } = await supabase
          .from("snippets")
          .insert({
            workspace_id: workspace.id,
            owner_id: user.id,
            title: title.trim(),
            shortcut: shortcut.trim() || null,
            body,
            shared_scope: sharedScope,
            folder_id: folderId,
          })
          .select("id")
          .single();

        if (error) throw error;
        snippetId = data.id;
      } else {
        const { error } = await supabase
          .from("snippets")
          .update({
            title: title.trim(),
            shortcut: shortcut.trim() || null,
            body,
            shared_scope: sharedScope,
            folder_id: folderId,
          })
          .eq("id", id!);

        if (error) throw error;
      }

      // Sync tags
      await supabase.from("snippet_tags").delete().eq("snippet_id", snippetId!);
      if (selectedTagIds.length > 0) {
        await supabase.from("snippet_tags").insert(
          selectedTagIds.map((tag_id) => ({ snippet_id: snippetId!, tag_id }))
        );
      }

      toast({ title: isNew ? "Snippet created" : "Snippet saved" });
      navigate("/snippets");
    } catch (err: any) {
      toast({ title: "Save failed", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleCreateTag = async () => {
    if (!workspace || !user || !newTagName.trim()) return;
    const colors = ["#6366f1","#f59e0b","#10b981","#ef4444","#3b82f6","#8b5cf6","#ec4899","#14b8a6"];
    const color = colors[Math.floor(Math.random() * colors.length)];
    const { data, error } = await supabase
      .from("tags")
      .insert({ workspace_id: workspace.id, name: newTagName.trim(), color, created_by: user.id })
      .select()
      .single();
    if (!error && data) {
      setAllTags((prev) => [...prev, data as Tag]);
      setSelectedTagIds((prev) => [...prev, data.id]);
      setNewTagName("");
    }
  };

  const toggleTag = (tagId: string) => {
    setSelectedTagIds((prev) =>
      prev.includes(tagId) ? prev.filter((t) => t !== tagId) : [...prev, tagId]
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-60">
        <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-6 py-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="icon" onClick={() => navigate("/snippets")} className="h-8 w-8">
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <h1 className="text-base font-semibold text-foreground">
          {isNew ? "New snippet" : "Edit snippet"}
        </h1>
      </div>

      <div className="space-y-5">
        {/* Title */}
        <div className="space-y-1.5">
          <Label htmlFor="title">Title <span className="text-destructive">*</span></Label>
          <Input
            id="title"
            placeholder="e.g. Introduction message"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            autoFocus
          />
        </div>

        {/* Shortcut */}
        <div className="space-y-1.5">
          <Label htmlFor="shortcut">Shortcut</Label>
          <Input
            id="shortcut"
            placeholder="/intro"
            value={shortcut}
            onChange={(e) => {
              setShortcut(e.target.value);
              setShortcutError("");
            }}
            className={shortcutError ? "border-destructive" : ""}
          />
          {shortcutError && <p className="text-xs text-destructive">{shortcutError}</p>}
          <p className="text-xs text-muted-foreground">
            Type this shortcut in the extension to auto-expand this snippet.
          </p>
        </div>

        {/* Body */}
        <div className="space-y-1.5">
          <Label htmlFor="body">Body</Label>
          <Textarea
            id="body"
            placeholder={`Hi {first_name},\n\nI noticed {company} is doing amazing work in…`}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            className="min-h-[160px] font-mono text-sm resize-y"
          />
          <p className="text-xs text-muted-foreground">
            Use <code className="bg-muted px-1 rounded">{"{variable}"}</code> for placeholders.
            Defaults: <code className="bg-muted px-1 rounded">{"{name=Hayato}"}</code>
          </p>
        </div>

        {/* Detected variables */}
        {variables.length > 0 && (
          <div className="rounded-lg border border-border bg-muted/30 px-4 py-3">
            <div className="flex items-center gap-2 mb-2">
              <Variable className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Detected variables
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {variables.map((v) => (
                <Badge key={v.name} variant="secondary" className="font-mono text-xs">
                  {"{"}
                  {v.name}
                  {v.defaultValue ? `=${v.defaultValue}` : ""}
                  {"}"}
                </Badge>
              ))}
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-3 gap-1.5"
              onClick={() => setTestOpen(true)}
            >
              <FlaskConical className="w-3.5 h-3.5" />
              Test expansion
            </Button>
          </div>
        )}

        {/* Tags */}
        <div className="space-y-1.5">
          <Label>Tags</Label>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {allTags.map((tag) => (
              <button
                key={tag.id}
                type="button"
                onClick={() => toggleTag(tag.id)}
                className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs border transition-colors ${
                  selectedTagIds.includes(tag.id)
                    ? "border-primary bg-primary/10 text-foreground"
                    : "border-border text-muted-foreground hover:text-foreground hover:border-primary/40"
                }`}
              >
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: tag.color }} />
                {tag.name}
                {selectedTagIds.includes(tag.id) && <X className="w-3 h-3 ml-0.5" />}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <Input
              placeholder="New tag name…"
              value={newTagName}
              onChange={(e) => setNewTagName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleCreateTag())}
              className="h-8 text-sm"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleCreateTag}
              disabled={!newTagName.trim()}
            >
              <Plus className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>

        {/* Folder */}
        {folders.length > 0 && (
          <div className="space-y-1.5">
            <Label>Folder</Label>
            <Select value={folderId ?? "none"} onValueChange={(v) => setFolderId(v === "none" ? null : v)}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="No folder" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No folder</SelectItem>
                {folders.map((f) => (
                  <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Scope toggle */}
        <div className="flex items-center justify-between py-3 px-4 rounded-lg border border-border">
          <div>
            <p className="text-sm font-medium text-foreground">Share with workspace</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {sharedScope === "workspace"
                ? "Visible to all workspace members"
                : "Only visible to you"}
            </p>
          </div>
          <Switch
            checked={sharedScope === "workspace"}
            onCheckedChange={(v) => setSharedScope(v ? "workspace" : "private")}
            disabled={myRole === "viewer"}
          />
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3 pt-2">
          <Button onClick={handleSave} disabled={saving} className="min-w-24">
            {saving ? "Saving…" : "Save"}
          </Button>
          <Button variant="ghost" onClick={() => navigate("/snippets")} disabled={saving}>
            Cancel
          </Button>
        </div>
      </div>

      <TestExpansionModal
        open={testOpen}
        onClose={() => setTestOpen(false)}
        body={body}
        variables={variables}
      />
    </div>
  );
}
