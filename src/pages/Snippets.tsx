import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  useSnippetsQuery,
  useTagsQuery,
  useSnippetDeleteMutation,
  useSnippetDuplicateMutation,
  type SnippetTag,
} from "@/hooks/useSnippets";
import {
  Plus, Search, Copy, Pencil, Trash2, Globe, Lock,
  ArrowUpDown, Clock, Hash, BarChart2, Folder,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface Snippet {
  id: string;
  title: string;
  shortcut: string | null;
  body: string;
  shared_scope: "private" | "workspace";
  use_count: number;
  last_used_at: string | null;
  created_at: string;
  updated_at: string;
  owner_id: string;
  folder_id: string | null;
  tags?: SnippetTag[];
}

type SortKey = "updated_at" | "use_count" | "title";

export default function SnippetsPage() {
  const { workspace } = useWorkspace();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [sortKey, setSortKey] = useState<SortKey>("updated_at");

  const [search, setSearch] = useState("");
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [scopeFilter, setScopeFilter] = useState<"all" | "private" | "workspace">("all");
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const { data: snippets = [], isLoading: loading } = useSnippetsQuery(workspace?.id, sortKey);
  const { data: tags = [] } = useTagsQuery(workspace?.id);
  const deleteMutation = useSnippetDeleteMutation(workspace?.id, sortKey);
  const duplicateMutation = useSnippetDuplicateMutation(workspace?.id, sortKey, user?.id);

  const filtered = (snippets as Snippet[]).filter((s) => {
    if (scopeFilter !== "all" && s.shared_scope !== scopeFilter) return false;
    if (selectedTag && !s.tags?.some((t) => t.id === selectedTag)) return false;
    if (search) {
      const q = search.toLowerCase();
      const matchTitle = s.title.toLowerCase().includes(q);
      const matchShortcut = s.shortcut?.toLowerCase().includes(q);
      const matchBody = s.body.toLowerCase().includes(q);
      const matchTag = s.tags?.some((t) => t.name.toLowerCase().includes(q));
      if (!matchTitle && !matchShortcut && !matchBody && !matchTag) return false;
    }
    return true;
  });

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await deleteMutation.mutateAsync(deleteId);
      toast({ title: "Snippet deleted" });
    } catch (err) {
      toast({
        title: "Failed to delete snippet",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    }
    setDeleteId(null);
  };

  const handleDuplicate = async (snippet: Snippet) => {
    if (!workspace || !user) return;
    try {
      await duplicateMutation.mutateAsync({
        title: snippet.title,
        body: snippet.body,
        folder_id: snippet.folder_id,
      });
      toast({ title: "Snippet duplicated" });
    } catch (err) {
      toast({
        title: "Failed to duplicate",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    }
  };

  const formatDate = (d: string | null) => {
    if (!d) return "—";
    return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  return (
    <div className="flex h-full">
      {/* Left filter panel */}
      <aside className="w-52 flex-shrink-0 border-r border-border bg-muted/20 p-4 space-y-6 hidden lg:block">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Scope</p>
          <div className="space-y-0.5">
            {(["all", "private", "workspace"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setScopeFilter(s)}
                className={`w-full text-left px-2.5 py-1.5 rounded-md text-sm capitalize transition-colors ${
                  scopeFilter === s
                    ? "bg-accent text-accent-foreground font-medium"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
                }`}
              >
                {s === "all" ? "All snippets" : s === "private" ? "Private" : "Shared"}
              </button>
            ))}
          </div>
        </div>

        {tags.length > 0 && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Tags</p>
            <div className="space-y-0.5">
              <button
                onClick={() => setSelectedTag(null)}
                className={`w-full text-left px-2.5 py-1.5 rounded-md text-sm transition-colors ${
                  !selectedTag
                    ? "bg-accent text-accent-foreground font-medium"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
                }`}
              >
                All tags
              </button>
              {tags.map((tag) => (
                <button
                  key={tag.id}
                  onClick={() => setSelectedTag(selectedTag === tag.id ? null : tag.id)}
                  className={`w-full text-left px-2.5 py-1.5 rounded-md text-sm flex items-center gap-2 transition-colors ${
                    selectedTag === tag.id
                      ? "bg-accent text-accent-foreground font-medium"
                      : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
                  }`}
                >
                  <span
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ backgroundColor: tag.color }}
                  />
                  {tag.name}
                </button>
              ))}
            </div>
          </div>
        )}
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <div className="flex items-center gap-3 px-6 py-4 border-b border-border">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search snippets…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-9"
            />
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1.5">
                <ArrowUpDown className="w-3.5 h-3.5" />
                Sort
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setSortKey("updated_at")}>
                <Clock className="w-3.5 h-3.5 mr-2" /> Most recent
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSortKey("use_count")}>
                <BarChart2 className="w-3.5 h-3.5 mr-2" /> Most used
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSortKey("title")}>
                <Hash className="w-3.5 h-3.5 mr-2" /> Alphabetical
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Button size="sm" asChild>
            <Link to="/snippets/new">
              <Plus className="w-4 h-4 mr-1" /> New snippet
            </Link>
          </Button>
        </div>

        {/* Snippet list */}
        <div className="flex-1 overflow-auto px-6 py-4">
          {loading ? (
            <div className="flex items-center justify-center h-40">
              <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-60 text-center">
              <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center mb-3">
                <Folder className="w-6 h-6 text-muted-foreground" />
              </div>
              <p className="text-sm font-medium text-foreground">No snippets found</p>
              <p className="text-sm text-muted-foreground mt-1">
                {search ? "Try a different search term" : "Create your first snippet to get started"}
              </p>
              {!search && (
                <Button size="sm" className="mt-4" asChild>
                  <Link to="/snippets/new">
                    <Plus className="w-4 h-4 mr-1" /> New snippet
                  </Link>
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map((snippet) => (
                <div
                  key={snippet.id}
                  className="group flex items-start gap-4 px-4 py-3.5 rounded-lg border border-border bg-card hover:border-primary/20 hover:shadow-sm transition-all cursor-pointer"
                  onClick={() => navigate(`/snippets/${snippet.id}/edit`)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="font-medium text-sm text-foreground">{snippet.title}</span>
                      {snippet.shortcut && (
                        <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono text-muted-foreground">
                          {snippet.shortcut}
                        </code>
                      )}
                      <span className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
                        {snippet.shared_scope === "workspace" ? (
                          <Globe className="w-3 h-3" />
                        ) : (
                          <Lock className="w-3 h-3" />
                        )}
                        {snippet.shared_scope === "workspace" ? "Shared" : "Private"}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground line-clamp-1">{snippet.body}</p>
                    <div className="flex items-center gap-3 mt-2 flex-wrap">
                      {snippet.tags?.map((tag) => (
                        <Badge
                          key={tag.id}
                          variant="secondary"
                          className="text-xs px-1.5 py-0 h-5"
                          style={{ borderLeft: `3px solid ${tag.color}` }}
                        >
                          {tag.name}
                        </Badge>
                      ))}
                      <span className="text-xs text-muted-foreground ml-auto">
                        {snippet.use_count} uses · Last used {formatDate(snippet.last_used_at)}
                      </span>
                    </div>
                  </div>

                  {/* Action buttons */}
                  <div
                    className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Button
                      variant="ghost"
                      size="icon"
                      className="w-7 h-7 text-muted-foreground hover:text-foreground"
                      title="Duplicate"
                      onClick={() => handleDuplicate(snippet)}
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="w-7 h-7 text-muted-foreground hover:text-foreground"
                      title="Edit"
                      onClick={() => navigate(`/snippets/${snippet.id}/edit`)}
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="w-7 h-7 text-muted-foreground hover:text-destructive"
                      title="Delete"
                      onClick={() => setDeleteId(snippet.id)}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete snippet?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. The snippet will be permanently deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
