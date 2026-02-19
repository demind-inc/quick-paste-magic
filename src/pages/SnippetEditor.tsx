import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { useAuth } from "@/contexts/AuthContext";
import {
  useTagsQuery,
  useFoldersQuery,
  useSnippetQuery,
  useSaveSnippetMutation,
  useCreateTagMutation,
  type Tag,
  type Folder,
} from "@/hooks/useSnippetEditor";
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
  const [testOpen, setTestOpen] = useState(false);
  const [shortcutError, setShortcutError] = useState("");

  const { data: allTags = [] } = useTagsQuery(workspace?.id);
  const { data: folders = [] } = useFoldersQuery(workspace?.id);
  const { data: snippetData, isLoading: loading } = useSnippetQuery(id, !isNew);
  const saveMutation = useSaveSnippetMutation();
  const createTagMutation = useCreateTagMutation(workspace?.id, user?.id);

  const variables = detectVariables(body);

  useEffect(() => {
    if (!snippetData) return;
    setTitle(snippetData.title);
    setShortcut(snippetData.shortcut ?? "");
    setBody(snippetData.body);
    setSharedScope(snippetData.shared_scope as "private" | "workspace");
    setFolderId(snippetData.folder_id ?? null);
    setSelectedTagIds((snippetData.snippet_tags ?? []).map((st) => st.tag_id));
  }, [snippetData]);

  const handleSave = async () => {
    if (!workspace || !user) return;
    if (!title.trim()) {
      toast({ title: "Title is required", variant: "destructive" });
      return;
    }

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

    try {
      await saveMutation.mutateAsync({
        id,
        isNew,
        workspaceId: workspace.id,
        ownerId: user.id,
        title: title.trim(),
        shortcut: shortcut.trim() || null,
        body,
        sharedScope,
        folderId,
        selectedTagIds,
      });
      toast({ title: isNew ? "Snippet created" : "Snippet saved" });
      navigate("/snippets");
    } catch (err: any) {
      toast({ title: "Save failed", description: err.message, variant: "destructive" });
    }
  };

  const handleCreateTag = () => {
    if (!newTagName.trim()) return;
    createTagMutation.mutate(newTagName, {
      onSuccess: (tag) => {
        setSelectedTagIds((prev) => [...prev, tag.id]);
        setNewTagName("");
      },
    });
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
          <Button onClick={handleSave} disabled={saveMutation.isPending} className="min-w-24">
            {saveMutation.isPending ? "Saving…" : "Save"}
          </Button>
          <Button variant="ghost" onClick={() => navigate("/snippets")} disabled={saveMutation.isPending}>
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
