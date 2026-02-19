import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { useProfileQuery, useUpdateProfileMutation, useUpdateWorkspaceMutation } from "@/hooks/useProfile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Separator } from "@/components/ui/separator";

export default function SettingsPage() {
  const { user } = useAuth();
  const { workspace } = useWorkspace();
  const { toast } = useToast();

  const { data: profileFullName } = useProfileQuery(user?.id);
  const [fullName, setFullName] = useState("");
  const [workspaceName, setWorkspaceName] = useState("");

  useEffect(() => {
    if (profileFullName !== undefined) setFullName(profileFullName ?? "");
  }, [profileFullName]);
  useEffect(() => {
    if (workspace) setWorkspaceName(workspace.name);
  }, [workspace]);

  const updateProfile = useUpdateProfileMutation(user?.id);
  const updateWorkspace = useUpdateWorkspaceMutation(user?.id);

  const saveProfile = async () => {
    if (!user) return;
    try {
      await updateProfile.mutateAsync(fullName);
      toast({ title: "Profile updated" });
    } catch (err: any) {
      toast({ title: "Failed to save profile", description: err.message, variant: "destructive" });
    }
  };

  const saveWorkspace = async () => {
    if (!workspace) return;
    try {
      await updateWorkspace.mutateAsync({ workspaceId: workspace.id, name: workspaceName });
      toast({ title: "Workspace updated" });
    } catch (err: any) {
      toast({ title: "Failed to update workspace", description: err.message, variant: "destructive" });
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
          <Button size="sm" onClick={saveProfile} disabled={updateProfile.isPending}>
            {updateProfile.isPending ? "Saving…" : "Save profile"}
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
          <Button size="sm" onClick={saveWorkspace} disabled={updateWorkspace.isPending}>
            {updateWorkspace.isPending ? "Saving…" : "Save workspace"}
          </Button>
        </div>
      </section>
    </div>
  );
}
