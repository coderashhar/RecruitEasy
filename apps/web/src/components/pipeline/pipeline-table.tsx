"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { ApplicationStatus } from "@interviewhub/db";
import { ApplicationStatusSelect } from "./application-status-select";
import { bulkChangeApplicationStatus } from "@/app/recruiter/applications/actions";

export interface PipelineRow {
  applicationId: string;
  candidateName: string;
  jobTitle: string;
  status: ApplicationStatus;
  atsScore: number | null;
}

const ALL_STATUSES: ApplicationStatus[] = [
  "APPLIED",
  "SCREENING",
  "INTERVIEWING",
  "OFFER",
  "HIRED",
  "REJECTED",
];

type SortField = "name" | "score";
type SortDir = "asc" | "desc";

export function PipelineTable({ rows: initial }: { rows: PipelineRow[] }) {
  const [rows, setRows] = useState(initial);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<ApplicationStatus | "">("");
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
  }, [rows, search, filterStatus, sortField, sortDir]);

  function toggleSort(field: SortField) {
    if (sortField === field) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir(field === "score" ? "desc" : "asc");
    }
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (selected.size === filtered.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map((row) => row.applicationId)));
    }
  }

  function handleBulkStatus(status: ApplicationStatus) {
    const ids = [...selected];
    if (ids.length === 0) return;

    startTransition(async () => {
      try {
        await bulkChangeApplicationStatus(ids, status);
        setRows((prev) =>
          prev.map((row) =>
            ids.includes(row.applicationId) ? { ...row, status } : row,
          ),
        );
        setSelected(new Set());
        toast.success(`${ids.length} application${ids.length > 1 ? "s" : ""} moved to ${status}.`);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Bulk update failed.");
      }
    });
  }

  const sortIndicator = (field: SortField) =>
    sortField === field ? (sortDir === "asc" ? " \u25b2" : " \u25bc") : "";

  return (
    <div className="space-y-3">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="Search candidate or job…"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className="h-8 w-48"
        />
        <select
          value={filterStatus}
          onChange={(event) => setFilterStatus(event.target.value as ApplicationStatus | "")}
          className="h-8 rounded-md border border-input bg-transparent px-2 text-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          aria-label="Filter by status"
        >
          <option value="">All statuses</option>
          {ALL_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>

        {selected.size > 0 && (
          <div className="flex items-center gap-1.5 ml-auto">
            <span className="text-xs text-muted-foreground">{selected.size} selected</span>
            {ALL_STATUSES.map((s) => (
              <Button
                key={s}
                size="sm"
                variant="outline"
                disabled={isPending}
                onClick={() => handleBulkStatus(s)}
                className="h-7 text-xs"
              >
                {s}
              </Button>
            ))}
          </div>
        )}
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">No matching applications.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8">
                <input
                  type="checkbox"
                  checked={selected.size === filtered.length && filtered.length > 0}
                  onChange={toggleAll}
                  aria-label="Select all"
                />
              </TableHead>
              <TableHead>
                <button type="button" onClick={() => toggleSort("name")} className="font-medium">
                  Candidate{sortIndicator("name")}
                </button>
              </TableHead>
              <TableHead>Job</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>
                <button type="button" onClick={() => toggleSort("score")} className="font-medium">
                  ATS score{sortIndicator("score")}
                </button>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((row) => (
              <TableRow key={row.applicationId}>
                <TableCell>
                  <input
                    type="checkbox"
                    checked={selected.has(row.applicationId)}
                    onChange={() => toggleSelect(row.applicationId)}
                    aria-label={`Select ${row.candidateName}`}
                  />
                </TableCell>
                <TableCell className="font-medium">{row.candidateName}</TableCell>
                <TableCell>{row.jobTitle}</TableCell>
                <TableCell>
                  <ApplicationStatusSelect
                    applicationId={row.applicationId}
                    status={row.status}
                    statuses={ALL_STATUSES}
                  />
                </TableCell>
                <TableCell>{row.atsScore != null ? `${row.atsScore}/100` : "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
