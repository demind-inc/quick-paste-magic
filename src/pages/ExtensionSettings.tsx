import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import {
  useRegenerateApiKeyMutation,
  useUpdateDomainAllowlistMutation,
  useUpdateDomainDenylistMutation,
} from "@/hooks/useWorkspaceMutations";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Separator } from "@/components/ui/separator";
import { Copy, Check, RefreshCw, Eye, EyeOff } from "lucide-react";

export default function ExtensionSettingsPage() {
  const { workspace, myRole } = useWorkspace();
  const { user } = useAuth();
  const { toast } = useToast();

  const [copied, setCopied] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [denylistInput, setDenylistInput] = useState(
    workspace?.domain_denylist?.join(", ") ?? ""
  );
  const [allowlistInput, setAllowlistInput] = useState(
    workspace?.domain_allowlist?.join(", ") ?? ""
  );

  useEffect(() => {
    if (workspace?.domain_denylist) {
      setDenylistInput(workspace.domain_denylist.join(", "));
    }
  }, [workspace?.domain_denylist]);

  useEffect(() => {
    if (workspace?.domain_allowlist) {
      setAllowlistInput(workspace.domain_allowlist.join(", "));
    }
  }, [workspace?.domain_allowlist]);

  const regenerateMutation = useRegenerateApiKeyMutation(user?.id);
  const denylistMutation = useUpdateDomainDenylistMutation(user?.id);
  const allowlistMutation = useUpdateDomainAllowlistMutation(user?.id);

  const isOwner = myRole === "owner";

  const allowlistUnchanged = (() => {
    const saved = workspace?.domain_allowlist ?? [];
    const current = allowlistInput
      .split(",")
      .map((d) => d.trim().toLowerCase())
      .filter(Boolean);
    if (saved.length !== current.length) return false;
    const a = [...saved].sort().join(",");
    const b = [...current].sort().join(",");
    return a === b;
  })();

  const copyApiKey = async () => {
    if (!workspace?.api_key) return;
    await navigator.clipboard.writeText(workspace.api_key);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const regenerateKey = async () => {
    if (!workspace) return;
    try {
      await regenerateMutation.mutateAsync(workspace.id);
      toast({ title: "API key regenerated" });
    } catch (err: any) {
      toast({ title: "Failed to regenerate key", description: err.message, variant: "destructive" });
    }
  };

  const saveDenylist = async () => {
    if (!workspace) return;
    const parsed = denylistInput
      .split(",")
      .map((d) => d.trim().toLowerCase())
      .filter(Boolean);
    try {
      await denylistMutation.mutateAsync({ workspaceId: workspace.id, domainDenylist: parsed });
      toast({ title: "Domain denylist saved" });
    } catch (err: any) {
      toast({ title: "Failed to save", description: err.message, variant: "destructive" });
    }
  };

  const saveAllowlist = async () => {
    if (!workspace) return;
    const parsed = allowlistInput
      .split(",")
      .map((d) => d.trim().toLowerCase())
      .filter(Boolean);
    try {
      await allowlistMutation.mutateAsync({ workspaceId: workspace.id, domainAllowlist: parsed });
      toast({ title: "Domain allowlist saved" });
    } catch (err: any) {
      toast({ title: "Failed to save", description: err.message, variant: "destructive" });
    }
  };

  const maskedKey = workspace?.api_key
    ? showKey
      ? workspace.api_key
      : workspace.api_key.slice(0, 8) + "•".repeat(24) + workspace.api_key.slice(-4)
    : "";

  return (
    <div className="max-w-xl mx-auto px-6 py-8">
      <h1 className="text-lg font-semibold text-foreground mb-2">Chrome Extension</h1>
      <p className="text-sm text-muted-foreground mb-8">
        Connect the SnipDM Chrome extension to your workspace using the API key below.
      </p>

      {/* API Key */}
      <section>
        <h2 className="text-sm font-semibold text-foreground mb-4">Workspace API key</h2>
        <div className="flex items-center gap-2">
          <div className="flex-1 font-mono text-sm bg-muted border border-border rounded-md px-3 py-2 text-muted-foreground select-all overflow-hidden text-ellipsis whitespace-nowrap">
            {maskedKey}
          </div>
          <Button
            variant="outline"
            size="icon"
            className="h-9 w-9 flex-shrink-0"
            onClick={() => setShowKey(!showKey)}
          >
            {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </Button>
          <Button variant="outline" size="icon" className="h-9 w-9 flex-shrink-0" onClick={copyApiKey}>
            {copied ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
          </Button>
        </div>
        {isOwner && (
          <Button
            variant="ghost"
            size="sm"
            className="mt-3 gap-1.5 text-muted-foreground hover:text-foreground"
            onClick={regenerateKey}
            disabled={regenerateMutation.isPending}
          >
            <RefreshCw className="w-3.5 h-3.5" />
            {regenerateMutation.isPending ? "Regenerating…" : "Regenerate key"}
          </Button>
        )}
        <p className="text-xs text-muted-foreground mt-2">
          Keep this key secret. Paste it in the extension settings to sync your snippets.
        </p>
      </section>

      <Separator className="my-8" />

      {/* Domain allowlist */}
      <section>
        <h2 className="text-sm font-semibold text-foreground mb-1">Domain allowlist</h2>
        <p className="text-sm text-muted-foreground mb-4">
          Only show the SnipDM snipping button on these domains. Leave empty to enable all domains.
        </p>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Domains (comma-separated)</Label>
            <Input
              placeholder="docs.google.com, gmail.com, notion.so"
              value={allowlistInput}
              onChange={(e) => setAllowlistInput(e.target.value)}
              disabled={!isOwner}
            />
          </div>
          {isOwner && (
            <Button
              size="sm"
              onClick={saveAllowlist}
              disabled={allowlistMutation.isPending || allowlistUnchanged}
            >
              {allowlistMutation.isPending ? "Saving…" : "Save allowlist"}
            </Button>
          )}
        </div>

        {workspace?.domain_allowlist?.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-1.5">
            {workspace.domain_allowlist.map((d) => (
              <span
                key={d}
                className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-md font-mono"
              >
                {d}
              </span>
            ))}
          </div>
        )}
      </section>

      <Separator className="my-8" />

      {/* Domain denylist */}
      <section>
        <h2 className="text-sm font-semibold text-foreground mb-1">Domain denylist</h2>
        <p className="text-sm text-muted-foreground mb-4">
          The extension will not activate on these domains (e.g. banking sites, password managers).
        </p>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Domains (comma-separated)</Label>
            <Input
              placeholder="chase.com, 1password.com, lastpass.com"
              value={denylistInput}
              onChange={(e) => setDenylistInput(e.target.value)}
              disabled={!isOwner}
            />
          </div>
          {isOwner && (
            <Button size="sm" onClick={saveDenylist} disabled={denylistMutation.isPending}>
              {denylistMutation.isPending ? "Saving…" : "Save denylist"}
            </Button>
          )}
        </div>

        {workspace?.domain_denylist?.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-1.5">
            {workspace.domain_denylist.map((d) => (
              <span
                key={d}
                className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-md font-mono"
              >
                {d}
              </span>
            ))}
          </div>
        )}
      </section>

      <Separator className="my-8" />

      {/* Extension install info */}
      <section>
        <h2 className="text-sm font-semibold text-foreground mb-2">Install the extension</h2>
        <p className="text-sm text-muted-foreground">
          The SnipDM Chrome extension source is scaffolded in the{" "}
          <code className="bg-muted px-1 rounded font-mono text-xs">extension/</code> folder of this
          project. Load it in Chrome via{" "}
          <strong>chrome://extensions → Load unpacked</strong>.
        </p>
      </section>
    </div>
  );
}
