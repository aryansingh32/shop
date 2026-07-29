import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { listAudit } from "@/lib/audit.functions";
import { PageHeader } from "@/components/page-header";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatDistanceToNow, format } from "date-fns";
import { ChevronRight, ChevronDown, RefreshCw, RotateCcw } from "lucide-react";

const PAGE_SIZE = 50;

export const Route = createFileRoute("/_authenticated/audit")({
  head: () => ({
    meta: [
      { title: "Audit log — Kshetra Ops" },
      {
        name: "description",
        content:
          "Every meaningful action on the platform, with actor and before/after state.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AuditPage,
});

function AuditPage() {
  const fetch = useServerFn(listAudit);
  const qc = useQueryClient();
  const [entityType, setEntityType] = useState("all");
  const [actorEmail, setActorEmail] = useState("");
  const [action, setAction] = useState("");
  const [limit, setLimit] = useState(PAGE_SIZE);

  const queryKey = ["audit", { entityType, actorEmail, action, limit }];

  const { data } = useSuspenseQuery({
    queryKey,
    queryFn: () => fetch({ data: { entityType, actorEmail, action, limit } }),
  });

  function handleReset() {
    setEntityType("all");
    setActorEmail("");
    setAction("");
    setLimit(PAGE_SIZE);
  }

  const hasFilters = entityType !== "all" || actorEmail || action;

  return (
    <>
      <PageHeader
        title="Audit log"
        description={`${data.length} entries${limit > PAGE_SIZE ? ` (showing up to ${limit})` : ""}`}
        actions={
          <Button
            size="sm"
            variant="outline"
            onClick={() => qc.invalidateQueries({ queryKey })}
          >
            <RefreshCw className="mr-1.5 size-3.5" />
            Refresh
          </Button>
        }
      />
      <div className="space-y-4 p-6">
        <Card className="p-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[180px]">
              <Label className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                Entity type
              </Label>
              <Select value={entityType} onValueChange={setEntityType}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All types</SelectItem>
                  <SelectItem value="shop">Shop</SelectItem>
                  <SelectItem value="plan">Plan</SelectItem>
                  <SelectItem value="app">App</SelectItem>
                  <SelectItem value="team_member">Team member</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-[200px]">
              <Label className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                Actor email
              </Label>
              <Input
                className="mt-1"
                placeholder="admin@company.com"
                value={actorEmail}
                onChange={(e) => setActorEmail(e.target.value)}
              />
            </div>
            <div className="min-w-[200px] flex-1">
              <Label className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                Action contains
              </Label>
              <Input
                className="mt-1"
                placeholder="shop.created, provisioning.live…"
                value={action}
                onChange={(e) => setAction(e.target.value)}
              />
            </div>
            {hasFilters && (
              <Button size="sm" variant="ghost" onClick={handleReset}>
                <RotateCcw className="mr-1.5 size-3.5" />
                Clear
              </Button>
            )}
          </div>
        </Card>

        <Card className="p-0 overflow-hidden">
          {data.length === 0 ? (
            <div className="py-16 text-center">
              <p className="text-sm font-medium">No audit entries match your filters</p>
              <p className="mt-1 text-xs text-muted-foreground">Try clearing the filters above.</p>
            </div>
          ) : (
            <>
              <div className="divide-y divide-border">
                {data.map((row) => (
                  <AuditRow key={row.id} row={row} />
                ))}
              </div>
              {/* Load more */}
              {data.length >= limit && (
                <div className="border-t border-border px-5 py-4 text-center">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setLimit((l) => l + PAGE_SIZE)}
                  >
                    <ChevronDown className="mr-1.5 size-3.5" />
                    Load {PAGE_SIZE} more
                  </Button>
                </div>
              )}
              <div className="border-t border-border px-5 py-2 text-center text-[11px] text-muted-foreground">
                Showing {data.length} entries
              </div>
            </>
          )}
        </Card>
      </div>
    </>
  );
}

function AuditRow({ row }: { row: any }) {
  const [open, setOpen] = useState(false);
  const hasDiff = row.before_state || row.after_state;

  return (
    <div className="px-5 py-3">
      <button
        onClick={() => hasDiff && setOpen(!open)}
        className={`flex w-full items-start justify-between gap-4 text-left ${hasDiff ? "cursor-pointer" : "cursor-default"}`}
      >
        <div className="flex items-start gap-3 min-w-0">
          {hasDiff && (
            <ChevronRight
              className={`mt-0.5 size-3.5 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-90" : ""}`}
            />
          )}
          {!hasDiff && <div className="mt-0.5 size-3.5 shrink-0" />}
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-sm">{row.action}</span>
              <span className="rounded border border-border px-1.5 py-0 text-[10px] uppercase text-muted-foreground">
                {row.entity_type}
              </span>
            </div>
            <div className="mt-0.5 text-xs text-muted-foreground">
              {row.actor_email}
              {row.shop && (
                <>
                  {" · "}
                  <Link
                    to="/shops/$id"
                    params={{ id: row.shop.id }}
                    className="hover:text-foreground underline-offset-2 hover:underline"
                  >
                    {row.shop.business_name}
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>
        <div className="shrink-0 text-right text-xs text-muted-foreground">
          <div>{formatDistanceToNow(new Date(row.created_at), { addSuffix: true })}</div>
          <div className="font-mono text-[10px]">
            {format(new Date(row.created_at), "d MMM HH:mm:ss")}
          </div>
        </div>
      </button>
      {open && hasDiff && (
        <div className="mt-3 grid gap-3 pl-7 md:grid-cols-2">
          {row.before_state && (
            <div className="rounded-md border border-border bg-muted/30 p-3">
              <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                Before
              </div>
              <pre className="mt-1 max-h-64 overflow-auto whitespace-pre-wrap font-mono text-[11px]">
                {JSON.stringify(row.before_state, null, 2)}
              </pre>
            </div>
          )}
          {row.after_state && (
            <div className="rounded-md border border-border bg-muted/30 p-3">
              <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                After
              </div>
              <pre className="mt-1 max-h-64 overflow-auto whitespace-pre-wrap font-mono text-[11px]">
                {JSON.stringify(row.after_state, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
