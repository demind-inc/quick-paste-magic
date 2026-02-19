import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Separator } from "@/components/ui/separator";
import { Copy, Check, RefreshCw, Eye, EyeOff } from "lucide-react";

export default function ExtensionSettingsPage() {
  const { workspace, myRole, refetch } = useWorkspace();
  const { toast } = useToast();

  const [copied, setCopied] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [denylistInput, setDenylistInput] = useState(
    workspace?.domain_denylist?.join(", ") ?? ""
  );
  const [savingDenylist, setSavingDenylist] = useState(false);
  const [regenerating, setRegenerating] = useState(false);

  const isOwner = myRole === "owner";

  const copyApiKey = async () => {
    if (!workspace?.api_key) return;
    await navigator.clipboard.writeText(workspace.api_key);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const regenerateKey = async () => {
    if (!workspace) return;
    setRegenerating(true);
    // Generate a new hex key client-side (server-side is preferable in prod)
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    const newKey = Array.from(array).map((b) => b.toString(16).padStart(2, "0")).join("");

    const { error } = await supabase
      .from("workspaces")
      .update({ api_key: newKey })
      .eq("id", workspace.id);
    setRegenerating(false);
    if (error) {
      toast({ title: "Failed to regenerate key", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "API key regenerated" });
      refetch();
    }
  };

  const saveDenylist = async () => {
    if (!workspace) return;
    setSavingDenylist(true);
    const parsed = denylistInput
      .split(",")
      .map((d) => d.trim().toLowerCase())
      .filter(Boolean);

    const { error } = await supabase
      .from("workspaces")
      .update({ domain_denylist: parsed })
      .eq("id", workspace.id);
    setSavingDenylist(false);
    if (error) {
      toast({ title: "Failed to save", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Domain denylist saved" });
      refetch();
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
            disabled={regenerating}
          >
            <RefreshCw className="w-3.5 h-3.5" />
            {regenerating ? "Regenerating…" : "Regenerate key"}
          </Button>
        )}
        <p className="text-xs text-muted-foreground mt-2">
          Keep this key secret. Paste it in the extension settings to sync your snippets.
        </p>
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
            <Button size="sm" onClick={saveDenylist} disabled={savingDenylist}>
              {savingDenylist ? "Saving…" : "Save denylist"}
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
