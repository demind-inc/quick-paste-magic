import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { supabase } from "@/integrations/supabase/client";
import {
  useDeleteInvitationMutation,
  useInviteMemberMutation,
  useRemoveMemberMutation,
  useResendInvitationMutation,
  useUpdateMemberRoleMutation,
  useWorkspaceInvitations,
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
import { UserPlus, Trash2, RefreshCw } from "lucide-react";
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

  const inviteMutation = useInviteMemberMutation();
  const resendMutation = useResendInvitationMutation();
  const deleteInvitationMutation = useDeleteInvitationMutation(workspace?.id);
  const removeMutation = useRemoveMemberMutation(user?.id, workspace?.id);
  const roleMutation = useUpdateMemberRoleMutation(user?.id, workspace?.id);
  const { data: pendingInvitations = [], isLoading: invitationsLoading } =
    useWorkspaceInvitations(workspace?.id);
  const [resendingId, setResendingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [resendConfirmInv, setResendConfirmInv] = useState<{
    id: string;
    email: string;
  } | null>(null);

  const handleInvite = async () => {
    if (!workspace || !user || !inviteEmail.trim()) return;
    try {
      const result = await inviteMutation.mutateAsync({
        workspaceId: workspace.id,
        email: inviteEmail,
        role: inviteRole,
        invitedBy: user.id,
      });
      setInviteEmail("");
      if (result?.existingUser && result?.token) {
        const redirectTo = `${window.location.origin}/accept-invite?token=${result.token}`;
        const { error: otpError } = await supabase.auth.signInWithOtp({
          email: inviteEmail.trim().toLowerCase(),
          options: { emailRedirectTo: redirectTo },
        });
        if (otpError) {
          toast({
            title: "Invitation created",
            description: `Could not send email to ${inviteEmail}. Share this link: ${redirectTo}`,
            variant: "destructive",
          });
          return;
        }
        toast({
          title: "Invitation sent",
          description: `Invited ${inviteEmail}. They'll receive an email to accept.`,
        });
      } else {
        toast({
          title: "Invitation sent",
          description: result?.existingUser
            ? `Invited ${inviteEmail}. They'll receive an invite email.`
            : `Invited ${inviteEmail}`,
        });
      }
    } catch (err: any) {
      toast({
        title: "Failed to send invitation",
        description: err.message,
        variant: "destructive",
      });
    }
  };

  const handleResend = async (inv: { id: string; email: string }) => {
    if (!workspace) return;
    setResendingId(inv.id);
    setResendConfirmInv(null);
    try {
      const result = await resendMutation.mutateAsync({
        invitationId: inv.id,
        workspaceId: workspace.id,
      });
      const email = (result?.email ?? inv.email).trim().toLowerCase();
      const token = result?.token;
      if (token) {
        const redirectTo = `${window.location.origin}/accept-invite?token=${token}`;
        const { error: otpError } = await supabase.auth.signInWithOtp({
          email,
          options: { emailRedirectTo: redirectTo },
        });
        if (otpError) {
          toast({
            title: "Invitation link ready",
            description: `Could not send email to ${email}. Share this link: ${redirectTo}`,
            variant: "destructive",
          });
          return;
        }
      }
      toast({
        title: "Invitation resent",
        description: `Email sent to ${email}. They'll receive an invite to accept.`,
      });
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

  const handleDeleteInvitation = async (invitationId: string) => {
    setDeletingId(invitationId);
    try {
      await deleteInvitationMutation.mutateAsync(invitationId);
      toast({ title: "Invitation removed" });
    } catch (err: any) {
      toast({
        title: "Failed to remove invitation",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setDeletingId(null);
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
      toast({
        title: "Failed to remove member",
        description: err.message,
        variant: "destructive",
      });
    }
  };

  const handleRoleChange = async (
    memberId: string,
    role: "editor" | "viewer" | "owner"
  ) => {
    try {
      await roleMutation.mutateAsync({ memberId, role });
      toast({ title: "Role updated" });
    } catch (err: any) {
      toast({
        title: "Failed to update role",
        description: err.message,
        variant: "destructive",
      });
    }
  };

  const isOwner = myRole === "owner";

  return (
    <div className="min-w-[550px] max-w-xl mx-auto px-6 py-8">
      <h1 className="text-lg font-semibold text-foreground mb-6">
        Team members
      </h1>

      {/* Current members */}
      <div className="space-y-2 mb-8">
        {members.map((member) => {
          const isMe = member.user_id === user?.id;
          const initials = (
            member.profiles?.full_name ??
            member.profiles?.email ??
            "?"
          )
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
                  {isMe && (
                    <span className="text-muted-foreground font-normal">
                      {" "}
                      (you)
                    </span>
                  )}
                </p>
                {member.profiles?.full_name && (
                  <p className="text-xs text-muted-foreground truncate">
                    {member.profiles.email}
                  </p>
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
                <Badge
                  variant={roleBadgeVariant[member.role]}
                  className="text-xs"
                >
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
            <h2 className="text-sm font-semibold text-foreground mb-4">
              Pending invitations
            </h2>
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
                      <p className="text-sm font-medium text-foreground truncate">
                        {inv.email}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {roleLabels[inv.role]} · Invited{" "}
                        {new Date(inv.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="w-7 h-7 text-muted-foreground hover:text-foreground"
                        onClick={() => setResendConfirmInv(inv)}
                        disabled={resendingId === inv.id}
                        aria-label={`Resend invitation to ${inv.email}`}
                      >
                        <RefreshCw
                          className={`w-3.5 h-3.5 ${resendingId === inv.id ? "animate-spin" : ""}`}
                        />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="w-7 h-7 text-muted-foreground hover:text-destructive"
                        onClick={() => handleDeleteInvitation(inv.id)}
                        disabled={deletingId === inv.id}
                        aria-label={`Remove invitation for ${inv.email}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}

      <AlertDialog
        open={!!resendConfirmInv}
        onOpenChange={(open) => !open && setResendConfirmInv(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Resend invitation?</AlertDialogTitle>
            <AlertDialogDescription>
              Send the invitation email again to{" "}
              {resendConfirmInv?.email ?? ""}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                resendConfirmInv && handleResend(resendConfirmInv)
              }
            >
              Resend
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {isOwner && (
        <>
          <Separator className="mb-6" />
          <section>
            <h2 className="text-sm font-semibold text-foreground mb-4">
              Invite a member
            </h2>
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
                <Select
                  value={inviteRole}
                  onValueChange={(v) => setInviteRole(v as any)}
                >
                  <SelectTrigger className="w-40 h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="editor">Editor</SelectItem>
                    <SelectItem value="viewer">Viewer</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button
                size="sm"
                onClick={handleInvite}
                disabled={inviteMutation.isPending || !inviteEmail.trim()}
              >
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
