import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";

function useInviteToken() {
  const { search } = useLocation();
  return useMemo(() => new URLSearchParams(search).get("token")?.trim() ?? "", [search]);
}

export default function AcceptInvitePage() {
  const token = useInviteToken();
  const { user, loading } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [status, setStatus] = useState<"idle" | "accepting" | "accepted" | "error">("idle");
  const [message, setMessage] = useState<string>("");

  useEffect(() => {
    if (!user?.id || !token || status !== "idle") return;
    const acceptInvite = async () => {
      setStatus("accepting");
      const { data, error } = await supabase.rpc("accept_workspace_invite", { p_token: token });
      if (error) {
        setStatus("error");
        setMessage(error.message);
        return;
      }
      const workspaceId = data as string | null;
      if (workspaceId) {
        localStorage.setItem(`activeWorkspace:${user.id}`, workspaceId);
      }
      await queryClient.invalidateQueries({ queryKey: queryKeys.workspaces(user.id) });
      await queryClient.invalidateQueries({ queryKey: queryKeys.workspaceMembers(workspaceId ?? undefined) });
      setStatus("accepted");
      toast({ title: "Workspace joined" });
      navigate("/snippets", { replace: true });
    };
    acceptInvite();
  }, [user?.id, token, status, navigate, toast, queryClient]);

  const nextParam = encodeURIComponent(`/accept-invite?token=${token}`);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Accept invitation</CardTitle>
          <CardDescription>Join the workspace you were invited to.</CardDescription>
        </CardHeader>
        <CardContent>
          {!token && (
            <p className="text-sm text-muted-foreground">Missing or invalid invite token.</p>
          )}
          {token && loading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              Checking your session…
            </div>
          )}
          {token && !loading && !user && (
            <p className="text-sm text-muted-foreground">
              Please sign in or create an account with the invited email to accept this invitation.
            </p>
          )}
          {token && user && status === "accepting" && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              Accepting invitation…
            </div>
          )}
          {status === "error" && (
            <p className="text-sm text-destructive">{message || "Failed to accept invitation."}</p>
          )}
        </CardContent>
        <CardFooter className="flex gap-2">
          {!loading && !user && token && (
            <>
              <Button asChild className="flex-1">
                <Link to={`/login?next=${nextParam}`}>Sign in</Link>
              </Button>
              <Button asChild variant="outline" className="flex-1">
                <Link to={`/signup?next=${nextParam}`}>Create account</Link>
              </Button>
            </>
          )}
          {!token && (
            <Button asChild className="w-full">
              <Link to="/login">Back to login</Link>
            </Button>
          )}
        </CardFooter>
      </Card>
    </div>
  );
}
