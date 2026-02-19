import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { UserPlus, Trash2 } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

const roleLabels: Record<string, string> = {
  owner: "Owner",
  editor: "Editor",
  viewer: "Viewer",
};

const roleBadgeVariant: Record<string, "default" | "secondary" | "outline"> = {
  owner: "default",
  editor: "secondary",
  viewer: "outline",
};

export default function TeamSettingsPage() {
  const { user } = useAuth();
  const { workspace, members, myRole, refetch } = useWorkspace();
  const { toast } = useToast();

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"editor" | "viewer">("editor");
  const [inviting, setInviting] = useState(false);

  const handleInvite = async () => {
    if (!workspace || !user || !inviteEmail.trim()) return;
    setInviting(true);
    const { error } = await supabase.from("workspace_invitations").insert({
      workspace_id: workspace.id,
      email: inviteEmail.trim().toLowerCase(),
      role: inviteRole,
      invited_by: user.id,
    });
    setInviting(false);
    if (error) {
      toast({
        title: "Failed to send invitation",
        description: error.message,
        variant: "destructive",
      });
    } else {
      toast({ title: "Invitation sent", description: `Invited ${inviteEmail}` });
      setInviteEmail("");
    }
  };

  const handleRemove = async (memberId: string, memberUserId: string) => {
    if (memberUserId === workspace?.owner_id) {
      toast({ title: "Cannot remove workspace owner", variant: "destructive" });
      return;
    }
    const { error } = await supabase
      .from("workspace_members")
      .delete()
      .eq("id", memberId);
    if (error) {
      toast({ title: "Failed to remove member", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Member removed" });
      refetch();
    }
  };

  const handleRoleChange = async (memberId: string, role: "editor" | "viewer" | "owner") => {
    const { error } = await supabase
      .from("workspace_members")
      .update({ role })
      .eq("id", memberId);
    if (error) {
      toast({ title: "Failed to update role", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Role updated" });
      refetch();
    }
  };

  const isOwner = myRole === "owner";

  return (
    <div className="max-w-xl mx-auto px-6 py-8">
      <h1 className="text-lg font-semibold text-foreground mb-6">Team members</h1>

      {/* Current members */}
      <div className="space-y-2 mb-8">
        {members.map((member) => {
          const isMe = member.user_id === user?.id;
          const initials =
            (member.profiles?.full_name ?? member.profiles?.email ?? "?")
              .slice(0, 2)
              .toUpperCase();
          return (
            <div
              key={member.id}
              className="flex items-center gap-3 px-4 py-3 rounded-lg border border-border"
            >
              <Avatar className="w-8 h-8 flex-shrink-0">
                <AvatarFallback className="text-xs bg-primary text-primary-foreground">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">
                  {member.profiles?.full_name || member.profiles?.email}
                  {isMe && <span className="text-muted-foreground font-normal"> (you)</span>}
                </p>
                {member.profiles?.full_name && (
                  <p className="text-xs text-muted-foreground truncate">{member.profiles.email}</p>
                )}
              </div>
              {isOwner && !isMe ? (
                <Select
                  value={member.role}
                  onValueChange={(v) => handleRoleChange(member.id, v as any)}
                >
                  <SelectTrigger className="w-28 h-7 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="owner">Owner</SelectItem>
                    <SelectItem value="editor">Editor</SelectItem>
                    <SelectItem value="viewer">Viewer</SelectItem>
                  </SelectContent>
                </Select>
              ) : (
                <Badge variant={roleBadgeVariant[member.role]} className="text-xs">
                  {roleLabels[member.role]}
                </Badge>
              )}
              {isOwner && !isMe && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="w-7 h-7 text-muted-foreground hover:text-destructive"
                  onClick={() => handleRemove(member.id, member.user_id)}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              )}
            </div>
          );
        })}
      </div>

      {isOwner && (
        <>
          <Separator className="mb-6" />
          <section>
            <h2 className="text-sm font-semibold text-foreground mb-4">Invite a member</h2>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>Email address</Label>
                <Input
                  type="email"
                  placeholder="colleague@company.com"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Role</Label>
                <Select value={inviteRole} onValueChange={(v) => setInviteRole(v as any)}>
                  <SelectTrigger className="w-40 h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="editor">Editor</SelectItem>
                    <SelectItem value="viewer">Viewer</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button size="sm" onClick={handleInvite} disabled={inviting || !inviteEmail.trim()}>
                <UserPlus className="w-3.5 h-3.5 mr-1.5" />
                {inviting ? "Inviting…" : "Send invitation"}
              </Button>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
