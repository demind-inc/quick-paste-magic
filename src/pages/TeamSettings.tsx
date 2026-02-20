import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import {
  useInviteMemberMutation,
  useRemoveMemberMutation,
  useUpdateMemberRoleMutation,
  useWorkspaceInvitations,
  useResendInvitationMutation,
} from "@/hooks/useWorkspaceMutations";
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
import { UserPlus, Trash2, Mail } from "lucide-react";
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
  const { workspace, members, myRole } = useWorkspace();
  const { toast } = useToast();

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"editor" | "viewer">("editor");
  const [resendingId, setResendingId] = useState<string | null>(null);

  const inviteMutation = useInviteMemberMutation();
  const removeMutation = useRemoveMemberMutation(user?.id);
  const roleMutation = useUpdateMemberRoleMutation(user?.id);
  const resendMutation = useResendInvitationMutation();
  const { data: pendingInvitations = [], isLoading: invitationsLoading } = useWorkspaceInvitations(
    workspace?.id
  );

  const handleInvite = async () => {
    if (!workspace || !user || !inviteEmail.trim()) return;
    try {
      await inviteMutation.mutateAsync({
        workspaceId: workspace.id,
        email: inviteEmail,
        role: inviteRole,
        invitedBy: user.id,
      });
      toast({ title: "Invitation sent", description: `Invited ${inviteEmail}` });
      setInviteEmail("");
    } catch (err: any) {
      toast({
        title: "Failed to send invitation",
        description: err.message,
        variant: "destructive",
      });
    }
  };

  const handleRemove = async (memberId: string, memberUserId: string) => {
    if (memberUserId === workspace?.owner_id) {
      toast({ title: "Cannot remove workspace owner", variant: "destructive" });
      return;
    }
    try {
      await removeMutation.mutateAsync(memberId);
      toast({ title: "Member removed" });
    } catch (err: any) {
      toast({ title: "Failed to remove member", description: err.message, variant: "destructive" });
    }
  };

  const handleRoleChange = async (memberId: string, role: "editor" | "viewer" | "owner") => {
    try {
      await roleMutation.mutateAsync({ memberId, role });
      toast({ title: "Role updated" });
    } catch (err: any) {
      toast({ title: "Failed to update role", description: err.message, variant: "destructive" });
    }
  };

  const handleResendInvitation = async (invitationId: string) => {
    if (!workspace) return;
    setResendingId(invitationId);
    try {
      await resendMutation.mutateAsync({ invitationId, workspaceId: workspace.id });
      toast({ title: "Invitation resent", description: "The invitation email was sent again." });
    } catch (err: any) {
      toast({
        title: "Failed to resend invitation",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setResendingId(null);
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

      {/* Pending invitations */}
      {isOwner && (pendingInvitations.length > 0 || invitationsLoading) && (
        <>
          <Separator className="mb-6" />
          <section className="mb-8">
            <h2 className="text-sm font-semibold text-foreground mb-4">Pending invitations</h2>
            {invitationsLoading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : (
              <div className="space-y-2">
                {pendingInvitations.map((inv) => (
                  <div
                    key={inv.id}
                    className="flex items-center gap-3 px-4 py-3 rounded-lg border border-border bg-muted/30"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{inv.email}</p>
                      <p className="text-xs text-muted-foreground">
                        {roleLabels[inv.role]} · Invited{" "}
                        {new Date(inv.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleResendInvitation(inv.id)}
                      disabled={resendingId !== null}
                    >
                      <Mail className="w-3.5 h-3.5 mr-1.5" />
                      {resendingId === inv.id ? "Sending…" : "Resend email"}
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}

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
              <Button size="sm" onClick={handleInvite} disabled={inviteMutation.isPending || !inviteEmail.trim()}>
                <UserPlus className="w-3.5 h-3.5 mr-1.5" />
                {inviteMutation.isPending ? "Inviting…" : "Send invitation"}
              </Button>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
