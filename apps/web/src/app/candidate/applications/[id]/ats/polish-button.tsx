"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { PolishResponse } from "@interviewhub/types";
import { requestPolish } from "./actions";

export function PolishButton({ applicationId }: { applicationId: string }) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<PolishResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    setError(null);
    startTransition(async () => {
      const response = await requestPolish(applicationId);
      if (response.error) {
        setError(response.error);
      } else if (response.data) {
        setResult(response.data);
      }
    });
  }

  return (
    <div className="space-y-4">
      <Button onClick={handleClick} disabled={pending} variant="outline" size="sm">
        {pending ? "Analyzing…" : "Polish my resume"}
      </Button>

      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}

      {result && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Polish suggestions</CardTitle>
            <p className="text-sm text-muted-foreground">{result.summary}</p>
          </CardHeader>
          <CardContent className="space-y-4">
            {result.suggestions.map((suggestion, index) => (
              <div key={index} className="rounded-md border p-3 text-sm space-y-2">
                <div className="font-medium text-primary">{suggestion.section}</div>
                <div className="space-y-1">
                  <div className="text-muted-foreground line-through">{suggestion.original}</div>
                  <div className="text-success">{suggestion.suggestion}</div>
                </div>
                <p className="text-xs text-muted-foreground">{suggestion.reason}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
