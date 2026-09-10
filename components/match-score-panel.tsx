"use client";

import * as React from "react";
import { RefreshCw, Sparkles } from "lucide-react";
import { runMatchScore } from "@/app/actions/matches";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { matchTier, TIER_LABELS } from "@/lib/pipeline";

export interface MatchScoreView {
  score: number;
  strengths: string[];
  gaps: string[];
  recommendations: string[];
  model: string;
}

interface ResumeOption {
  id: string;
  label: string;
}

function ListBlock({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      <h4 className="text-sm font-semibold">{title}</h4>
      <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

export function MatchScorePanel({
  jobId,
  resumes,
  matchesByResume,
}: {
  jobId: string;
  resumes: ResumeOption[];
  matchesByResume: Record<string, MatchScoreView>;
}) {
  const [selectedResumeId, setSelectedResumeId] = React.useState(resumes[0]?.id ?? "");
  const [isPending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  const match = matchesByResume[selectedResumeId];

  function handleScore() {
    if (!selectedResumeId) return;
    setError(null);
    startTransition(async () => {
      const result = await runMatchScore(jobId, selectedResumeId);
      if (result?.error) setError(result.error);
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Match score</CardTitle>
        <CardDescription>Compares this job's requirements against a stored resume.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={selectedResumeId}
            onChange={(event) => setSelectedResumeId(event.target.value)}
            className="flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            {resumes.map((resume) => (
              <option key={resume.id} value={resume.id}>
                {resume.label}
              </option>
            ))}
          </select>
          <Button type="button" size="sm" disabled={isPending} onClick={handleScore}>
            <RefreshCw className={`h-4 w-4 ${isPending ? "animate-spin" : ""}`} />
            {isPending ? "Scoring…" : match ? "Re-score" : "Score match"}
          </Button>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        {match ? (
          <div className="flex flex-col gap-4">
            <div className="flex items-baseline gap-2">
              <span className="font-display text-3xl font-semibold">{match.score}</span>
              <span className="text-sm text-muted-foreground">/ 100 · {match.model}</span>
              <Badge variant={matchTier(match.score) === "A" ? "default" : "secondary"}>{TIER_LABELS[matchTier(match.score)]}</Badge>
            </div>
            <div className="grid gap-6 sm:grid-cols-3">
              <ListBlock title="Strengths" items={match.strengths} />
              <ListBlock title="Gaps" items={match.gaps} />
              <ListBlock title="Recommendations" items={match.recommendations} />
            </div>
          </div>
        ) : (
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5" /> No score yet for this resume.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
