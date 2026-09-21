"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { ChevronDownIcon } from "lucide-react";
import type { ApplicationStatus } from "@interviewhub/db";
import { APPLICATION_STATUS, ApplicationStatusBadge, StatusGlyph } from "@/components/broadsheet/status-badge";
import { ScoreBar } from "@/components/broadsheet/measures";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { bulkChangeApplicationStatus } from "@/app/recruiter/applications/actions";
import { classifyStatusChange } from "@/lib/application-status";
import { cn } from "@/lib/utils";
import { ShortlistToggle } from "./shortlist-toggle";

export interface PipelineRow {
  applicationId: string;
  candidateName: string;
  jobTitle: string;
  status: ApplicationStatus;
  atsScore: number | null;
  shortlisted: boolean;
}

const ALL_STATUSES: ApplicationStatus[] = [
  "APPLIED",
  "SCREENING",
  "INTERVIEWING",
  "OFFER",
  "HIRED",
  "REJECTED",
];

const COMPARE_MIN = 2;
const COMPARE_MAX = 4;

type SortField = "name" | "score";
type SortDir = "asc" | "desc";

const controlClass =
  "h-[30px] border border-border bg-transparent px-[11px] text-[13px] outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

/**
 * `canManage` is false for interviewers: they read the pipeline and compare
 * candidates, but moving applications and shortlisting stay with recruiters.
 * The Server Actions enforce that regardless; this only avoids offering
 * controls that would be refused.
 */
export function PipelineTable({ rows: initial, canManage = true }: { rows: PipelineRow[]; canManage?: boolean }) {
  const [rows, setRows] = useState(initial);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<ApplicationStatus | "">("");
  const [shortlistedOnly, setShortlistedOnly] = useState(false);
  const [sortField, setSortField] = useState<SortField>("score");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isPending, startTransition] = useTransition();

  const filtered = useMemo(() => {
    let result = rows;

    if (search) {
      const lower = search.toLowerCase();
      result = result.filter(
        (row) =>
          row.candidateName.toLowerCase().includes(lower) ||
          row.jobTitle.toLowerCase().includes(lower),
      );
    }

    if (filterStatus) {
      result = result.filter((row) => row.status === filterStatus);
    }

    if (shortlistedOnly) {
      result = result.filter((row) => row.shortlisted);
    }

    result = [...result].sort((a, b) => {
      if (sortField === "name") {
        const cmp = a.candidateName.localeCompare(b.candidateName);
        return sortDir === "asc" ? cmp : -cmp;
      }
      const scoreA = a.atsScore ?? -1;
      const scoreB = b.atsScore ?? -1;
      return sortDir === "asc" ? scoreA - scoreB : scoreB - scoreA;
    });

    return result;
  }, [rows, search, filterStatus, shortlistedOnly, sortField, sortDir]);

  function setRowShortlisted(applicationId: string, shortlisted: boolean) {
    setRows((prev) =>
      prev.map((row) => (row.applicationId === applicationId ? { ...row, shortlisted } : row)),
    );
  }

  function toggleSort(field: SortField) {
    if (sortField === field) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir(field === "score" ? "desc" : "asc");
    }
  }

  function toggleSelect(id: string, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function toggleAll(checked: boolean) {
    setSelected(checked ? new Set(filtered.map((row) => row.applicationId)) : new Set());
  }

  function handleBulkStatus(status: ApplicationStatus) {
    const ids = [...selected];
    if (ids.length === 0) return;

    startTransition(async () => {
      try {
        const result = await bulkChangeApplicationStatus(ids, status);
        // Only rows the server actually moved change here; decided ones keep
        // their status, which is the point of skipping them.
        setRows((prev) =>
          prev.map((row) =>
            ids.includes(row.applicationId) && classifyStatusChange(row.status, status) === "move"
              ? { ...row, status }
              : row,
          ),
        );
        setSelected(new Set());
        const label = APPLICATION_STATUS[status].label;
        const plural = (n: number) => `${n} application${n === 1 ? "" : "s"}`;
        const notes = [
          result.unchanged > 0 && `${plural(result.unchanged)} already ${label}`,
          result.decided > 0 &&
            `${plural(result.decided)} left as is: hired or rejected. Change those one at a time from the candidate's page`,
        ].filter(Boolean);
        const message = `${plural(result.moved)} moved to ${label}.`;
        if (result.decided > 0) toast.warning(message, { description: notes.join(" · ") });
        else toast.success(message, notes.length > 0 ? { description: notes.join(" · ") } : undefined);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Bulk update failed.");
      }
    });
  }

  const sortLabel = `sorted by ${sortField === "score" ? "ATS" : "name"} ${sortDir === "asc" ? "▲" : "▼"}`;
  const allSelected = filtered.length > 0 && filtered.every((row) => selected.has(row.applicationId));
  const someSelected = !allSelected && filtered.some((row) => selected.has(row.applicationId));
  const canCompare = selected.size >= COMPARE_MIN && selected.size <= COMPARE_MAX;

  return (
    <div>
      {selected.size > 0 ? (
        // The bulk bar takes the filter row's place rather than stacking above
        // it, so selecting a row never pushes the table down.
        <div className="flex min-h-[30px] flex-wrap items-center gap-2.5">
          <span className="font-mono text-[11.5px] text-muted-foreground tabular-nums">{selected.size} selected</span>
          {canCompare ? (
            <Button
              size="sm"
              variant="ink"
              nativeButton={false}
              render={<Link href={`/recruiter/compare?ids=${[...selected].join(",")}`}>Compare</Link>}
            />
          ) : (
            <span className="text-[13px] text-muted-foreground">
              Select {COMPARE_MIN}–{COMPARE_MAX} to compare
            </span>
          )}
          {canManage && (
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button size="sm" variant="outline" disabled={isPending} />}>
                Move to
                <ChevronDownIcon className="size-3.5 text-muted-foreground" />
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-44" align="start">
                {ALL_STATUSES.map((status) => {
                  const display = APPLICATION_STATUS[status];
                  return (
                    <DropdownMenuItem key={status} onClick={() => handleBulkStatus(status)}>
                      <StatusGlyph shape={display.shape} tone={display.tone} />
                      {display.label}
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          <button
            type="button"
            onClick={() => setSelected(new Set())}
            className="ml-auto text-[13px] text-primary hover:underline"
          >
            Clear selection
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2.5">
          <Input
            placeholder="Search candidate or job"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="h-[30px] w-full border-border text-[13px] sm:w-[210px]"
            aria-label="Search candidate or job"
          />
          <select
            value={filterStatus}
            onChange={(event) => setFilterStatus(event.target.value as ApplicationStatus | "")}
            className={controlClass}
            aria-label="Filter by status"
          >
            <option value="">All statuses</option>
            {ALL_STATUSES.map((status) => (
              <option key={status} value={status}>
                {APPLICATION_STATUS[status].label}
              </option>
            ))}
          </select>
          <button
            type="button"
            aria-pressed={shortlistedOnly}
            onClick={() => setShortlistedOnly((value) => !value)}
            className={cn(
              controlClass,
              "inline-flex items-center gap-[7px] transition-colors",
              shortlistedOnly ? "border-foreground font-medium text-foreground" : "text-muted-foreground",
            )}
          >
            <span className="text-primary">★</span>
            Shortlisted only
          </button>
          <button
            type="button"
            onClick={() => toggleSort(sortField === "score" ? "name" : "score")}
            className="ml-auto font-mono text-[11.5px] text-muted-foreground hover:text-foreground"
          >
            {sortLabel}
          </button>
        </div>
      )}

      {filtered.length === 0 ? (
        <p className="mt-4 border-t border-rule-strong py-6 text-sm text-muted-foreground">
          {rows.length === 0 ? "No applications yet." : "No applications match these filters."}
        </p>
      ) : (
        <>
          <Table className="mt-4 hidden text-sm md:table">
            <TableHeader>
              <TableRow>
                <TableHead className="w-7">
                  <Checkbox
                    checked={allSelected}
                    indeterminate={someSelected}
                    onCheckedChange={(checked) => toggleAll(checked)}
                    aria-label="Select all"
                  />
                </TableHead>
                <TableHead className="w-7 px-0">
                  <span className="sr-only">Shortlisted</span>
                </TableHead>
                <TableHead>
                  <button type="button" onClick={() => toggleSort("name")} className="uppercase hover:text-foreground">
                    Candidate
                  </button>
                </TableHead>
                <TableHead>Job</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">
                  <button type="button" onClick={() => toggleSort("score")} className="uppercase hover:text-foreground">
                    ATS score
                  </button>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((row) => (
                <TableRow key={row.applicationId} data-state={selected.has(row.applicationId) ? "selected" : undefined}>
                  <TableCell>
                    <Checkbox
                      checked={selected.has(row.applicationId)}
                      onCheckedChange={(checked) => toggleSelect(row.applicationId, checked)}
                      aria-label={`Select ${row.candidateName}`}
                    />
                  </TableCell>
                  <TableCell className="px-0">
                    <ShortlistToggle
                      applicationId={row.applicationId}
                      candidateName={row.candidateName}
                      shortlisted={row.shortlisted}
                      disabled={!canManage}
                      onChange={(next) => setRowShortlisted(row.applicationId, next)}
                    />
                  </TableCell>
                  <TableCell className="font-medium">
                    <Link href={`/recruiter/candidates/${row.applicationId}`} className="hover:underline">
                      {row.candidateName}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{row.jobTitle}</TableCell>
                  <TableCell>
                    <ApplicationStatusBadge status={row.status} />
                  </TableCell>
                  <TableCell className="text-right">
                    <ScoreBar value={row.atsScore} suffix="/100" />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {/* At phone width a six-column table can't fit; each row becomes two lines instead. */}
          <ul className="mt-4 border-t border-rule-strong md:hidden">
            {filtered.map((row) => (
              <li key={row.applicationId} className="flex items-start gap-3 border-b border-hairline py-[13px]">
                <Checkbox
                  className="mt-1"
                  checked={selected.has(row.applicationId)}
                  onCheckedChange={(checked) => toggleSelect(row.applicationId, checked)}
                  aria-label={`Select ${row.candidateName}`}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2.5">
                    <Link
                      href={`/recruiter/candidates/${row.applicationId}`}
                      className="truncate text-[14.5px] font-medium"
                    >
                      {row.candidateName}
                      {row.shortlisted && <span className="ml-[7px] text-primary">★</span>}
                    </Link>
                    <span className="font-mono text-[12.5px] tabular-nums">
                      {row.atsScore === null ? "—" : `${row.atsScore}/100`}
                    </span>
                  </div>
                  <div className="mt-[7px] flex flex-wrap items-center gap-2.5">
                    <span className="text-[13px] text-muted-foreground">{row.jobTitle}</span>
                    <ApplicationStatusBadge status={row.status} size="sm" />
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
