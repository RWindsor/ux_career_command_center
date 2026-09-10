"use client";

import * as React from "react";
import { Copy, Check } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { ApplicationPackage } from "@/lib/db/schema";

function BulletList({ items }: { items: string[] }) {
  if (items.length === 0) return <p className="text-sm text-muted-foreground">None identified.</p>;
  return (
    <ul className="flex flex-col gap-2 text-sm text-muted-foreground">
      {items.map((item, i) => (
        <li key={i} className="flex gap-2">
          <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-muted-foreground" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

function CopyableBlock({ title, text }: { title: string; text: string }) {
  const [copied, setCopied] = React.useState(false);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">{title}</CardTitle>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => {
            navigator.clipboard.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
        >
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? "Copied" : "Copy"}
        </Button>
      </CardHeader>
      <CardContent>
        <p className="whitespace-pre-wrap text-sm text-muted-foreground">{text}</p>
      </CardContent>
    </Card>
  );
}

export function ApplicationPackagePanel({ pkg }: { pkg: ApplicationPackage }) {
  return (
    <div className="flex flex-col gap-6">
      <p className="text-xs text-muted-foreground">
        Model: {pkg.model} · Generated {new Date(pkg.createdAt).toLocaleString()}
      </p>

      <div className="grid gap-6 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Keyword gaps</CardTitle>
            <CardDescription>Terms from the posting your resume doesn&apos;t currently evidence.</CardDescription>
          </CardHeader>
          <CardContent>
            <BulletList items={pkg.keywordGapAnalysis} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Experience to foreground</CardTitle>
            <CardDescription>Real evidence you already have — lead with this.</CardDescription>
          </CardHeader>
          <CardContent>
            <BulletList items={pkg.experienceToForeground} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Resume tailoring recommendations</CardTitle>
        </CardHeader>
        <CardContent>
          <BulletList items={pkg.resumeTailoringRecommendations} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Application strategy</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{pkg.applicationStrategyNotes}</p>
        </CardContent>
      </Card>

      <CopyableBlock title="Cover letter draft" text={pkg.coverLetterDraft} />
      <CopyableBlock title="Recruiter outreach message" text={pkg.recruiterOutreachMessage} />
    </div>
  );
}
