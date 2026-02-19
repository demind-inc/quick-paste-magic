import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Separator } from "@/components/ui/separator";

export default function SettingsPage() {
  const { user } = useAuth();
  const { workspace, refetch } = useWorkspace();
  const { toast } = useToast();

  const [fullName, setFullName] = useState("");
  const [workspaceName, setWorkspaceName] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingWorkspace, setSavingWorkspace] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("profiles")
      .select("full_name")
      .eq("id", user.id)
      .single()
      .then(({ data }) => {
        if (data) setFullName(data.full_name ?? "");
      });
  }, [user]);

  useEffect(() => {
    if (workspace) setWorkspaceName(workspace.name);
  }, [workspace]);

  const saveProfile = async () => {
    if (!user) return;
    setSavingProfile(true);
    const { error } = await supabase
      .from("profiles")
      .update({ full_name: fullName.trim() })
      .eq("id", user.id);
    setSavingProfile(false);
    if (error) {
      toast({ title: "Failed to save profile", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Profile updated" });
    }
  };

  const saveWorkspace = async () => {
    if (!workspace) return;
    setSavingWorkspace(true);
    const { error } = await supabase
      .from("workspaces")
      .update({ name: workspaceName.trim() })
      .eq("id", workspace.id);
    setSavingWorkspace(false);
    if (error) {
      toast({ title: "Failed to update workspace", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Workspace updated" });
      refetch();
    }
  };

  return (
    <div className="max-w-xl mx-auto px-6 py-8">
      <h1 className="text-lg font-semibold text-foreground mb-6">Settings</h1>

      {/* Profile */}
      <section>
        <h2 className="text-sm font-semibold text-foreground mb-4">Profile</h2>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Full name</Label>
            <Input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Your name"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Email</Label>
            <Input value={user?.email ?? ""} disabled className="text-muted-foreground" />
          </div>
          <Button size="sm" onClick={saveProfile} disabled={savingProfile}>
            {savingProfile ? "Saving…" : "Save profile"}
          </Button>
        </div>
      </section>

      <Separator className="my-8" />

      {/* Workspace */}
      <section>
        <h2 className="text-sm font-semibold text-foreground mb-4">Workspace</h2>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Workspace name</Label>
            <Input
              value={workspaceName}
              onChange={(e) => setWorkspaceName(e.target.value)}
              placeholder="My Workspace"
            />
          </div>
          <Button size="sm" onClick={saveWorkspace} disabled={savingWorkspace}>
            {savingWorkspace ? "Saving…" : "Save workspace"}
          </Button>
        </div>
      </section>
    </div>
  );
}
