import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { queryKeys } from "@/lib/queryKeys";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

export default function CreateWorkspacePage() {
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth();
  const { refetch } = useWorkspace();
  const queryClient = useQueryClient();

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.id) return;
    const trimmed = name.trim();
    if (!trimmed) {
      toast({ title: "Workspace name is required", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const { data: workspaceId, error } = await supabase.rpc("create_workspace", {
        p_name: trimmed,
      });
      if (error) throw error;
      if (!workspaceId) throw new Error("No workspace id returned");
      await queryClient.invalidateQueries({ queryKey: queryKeys.workspaces(user.id) });
      await refetch();
      toast({ title: "Workspace created" });
      navigate("/snippets");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to create workspace";
      toast({ title: "Could not create workspace", description: message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-full max-w-sm px-6 py-10">
        <div className="flex items-center justify-center gap-2 mb-8">
          <img src="/logo.png" alt="SnipDM" className="w-8 h-8 rounded-lg object-contain" />
          <span className="font-semibold text-lg text-foreground">SnipDM</span>
        </div>

        <h1 className="text-xl font-semibold text-foreground text-center mb-1">Create your workspace</h1>
        <p className="text-sm text-muted-foreground text-center mb-8">
          Give your snippet library a name. You can change it later in settings.
        </p>

        <form onSubmit={handleCreate} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="workspace-name">Workspace name</Label>
            <Input
              id="workspace-name"
              type="text"
              placeholder="My workspace"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoFocus
            />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Creating…" : "Create workspace"}
          </Button>
        </form>
      </div>
    </div>
  );
}
