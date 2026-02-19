import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Copy, Check } from "lucide-react";

interface Variable {
  name: string;
  defaultValue?: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  body: string;
  variables: Variable[];
}

export default function TestExpansionModal({ open, onClose, body, variables }: Props) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [copied, setCopied] = useState(false);

  const resolved = body.replace(/\{([^}]+)\}/g, (_, raw) => {
    const [name, defaultVal] = raw.split("=");
    const key = name.trim();
    return values[key] ?? defaultVal?.trim() ?? `{${key}}`;
  });

  const handleCopy = async () => {
    await navigator.clipboard.writeText(resolved);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Test expansion</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {variables.length > 0 && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">Fill in placeholder values:</p>
              {variables.map((v) => (
                <div key={v.name} className="space-y-1">
                  <Label className="font-mono text-xs">
                    {"{"}
                    {v.name}
                    {v.defaultValue ? `=${v.defaultValue}` : ""}
                    {"}"}
                  </Label>
                  <Input
                    placeholder={v.defaultValue ?? v.name}
                    value={values[v.name] ?? ""}
                    onChange={(e) =>
                      setValues((prev) => ({ ...prev, [v.name]: e.target.value }))
                    }
                    className="h-8 text-sm"
                  />
                </div>
              ))}
            </div>
          )}

          <div>
            <p className="text-sm font-medium text-foreground mb-2">Preview:</p>
            <div className="whitespace-pre-wrap rounded-lg border border-border bg-muted/30 px-4 py-3 text-sm min-h-[80px] font-mono text-foreground">
              {resolved || <span className="text-muted-foreground italic">Empty snippet</span>}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
          <Button onClick={handleCopy} className="gap-1.5">
            {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            {copied ? "Copied!" : "Copy to clipboard"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
