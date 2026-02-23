import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";

function useInviteToken() {
  const { search } = useLocation();
  return useMemo(
    () => new URLSearchParams(search).get("token")?.trim() ?? "",
    [search]
  );
}

export default function AcceptInvitePage() {
  const token = useInviteToken();
  const { user, loading } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [status, setStatus] = useState<
    "idle" | "accepting" | "accepted" | "error" | "done"
  >("idle");
  const [message, setMessage] = useState<string>("");
  const [isNewUser, setIsNewUser] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [settingPassword, setSettingPassword] = useState(false);

  useEffect(() => {
    if (!token) return;
    if (!loading && !user) {
      navigate(
        `/login?next=${encodeURIComponent(`/accept-invite?token=${token}`)}`,
        { replace: true }
      );
      return;
    }
    if (!user?.id || status !== "idle") return;
    const acceptInvite = async () => {
      setStatus("accepting");
      const { data, error } = await supabase.rpc("accept_workspace_invite", {
        p_token: token,
      });
      if (error) {
        setStatus("error");
        setMessage(error.message);
        return;
      }
      const result = data as { workspace_id: string; is_new_user: boolean } | null;
      const workspaceId = result?.workspace_id ?? null;
      if (workspaceId) {
        localStorage.setItem(`activeWorkspace:${user.id}`, workspaceId);
      }
      const newUser = result?.is_new_user ?? false;
      setIsNewUser(newUser);
      await queryClient.invalidateQueries({
        queryKey: queryKeys.workspaces(user.id),
      });
      await queryClient.invalidateQueries({
        queryKey: queryKeys.workspaceMembers(workspaceId ?? undefined),
      });
      setStatus("accepted");
      toast({ title: "Workspace joined" });
      if (newUser) {
        return;
      }
      const { data: hasPassword } = await supabase.rpc("auth_user_has_password");
      if (hasPassword) {
        setStatus("done");
        navigate("/snippets", { replace: true });
      }
    };
    acceptInvite();
  }, [loading, user, user?.id, token, status, navigate, toast, queryClient]);

  const handleSetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
      toast({
        title: "Password too short",
        description: "At least 6 characters required.",
        variant: "destructive",
      });
      return;
    }
    if (password !== confirmPassword) {
      toast({
        title: "Passwords don't match",
        variant: "destructive",
      });
      return;
    }
    setSettingPassword(true);
    const { error } = await supabase.auth.updateUser({ password });
    setSettingPassword(false);
    if (error) {
      toast({
        title: "Failed to set password",
        description: error.message,
        variant: "destructive",
      });
      return;
    }
    toast({ title: "Password set" });
    setStatus("done");
    navigate("/snippets", { replace: true });
  };

  const handleSkipPassword = () => {
    setStatus("done");
    navigate("/snippets", { replace: true });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Accept invitation</CardTitle>
          <CardDescription>
            Join the workspace you were invited to.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!token && (
            <p className="text-sm text-muted-foreground">
              Missing or invalid invite token.
            </p>
          )}
          {token && (loading || !user) && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              {loading ? "Checking your session…" : "Redirecting to sign in…"}
            </div>
          )}
          {token && user && status === "accepting" && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              Accepting invitation…
            </div>
          )}
          {status === "error" && (
            <p className="text-sm text-destructive">
              {message || "Failed to accept invitation."}
            </p>
          )}
          {status === "accepted" && (
            <div className="space-y-4 pt-2">
              <p className="text-sm text-muted-foreground">
                {isNewUser
                  ? "Set a password so you can sign in with email next time."
                  : "Set a password so you can sign in with email and password next time."}
              </p>
              <form onSubmit={handleSetPassword} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    placeholder="Min. 6 characters"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    minLength={6}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="confirmPassword">Confirm password</Label>
                  <Input
                    id="confirmPassword"
                    type="password"
                    placeholder="Repeat password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    minLength={6}
                  />
                </div>
                <div className="flex gap-2">
                  <Button
                    type="submit"
                    disabled={
                      settingPassword ||
                      !password ||
                      password !== confirmPassword
                    }
                    className={isNewUser ? "w-full" : "flex-1"}
                  >
                    {settingPassword ? "Setting…" : "Set password"}
                  </Button>
                  {!isNewUser && (
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={handleSkipPassword}
                      disabled={settingPassword}
                    >
                      Skip
                    </Button>
                  )}
                </div>
              </form>
            </div>
          )}
        </CardContent>
        {!token && (
          <CardFooter>
            <Button asChild className="w-full">
              <Link to="/login">Back to login</Link>
            </Button>
          </CardFooter>
        )}
      </Card>
    </div>
  );
}
