import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { InterviewPrep } from "@/lib/db/schema";

function BulletList({ items }: { items: string[] }) {
  if (items.length === 0) return <p className="text-sm text-muted-foreground">Nothing generated for this section.</p>;
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

export function InterviewPrepPanel({ prep }: { prep: InterviewPrep }) {
  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Company research</CardTitle>
          <CardDescription>Model: {prep.model} · Generated {new Date(prep.createdAt).toLocaleString()}</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{prep.companyResearch}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Role-specific interview questions</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {prep.interviewQuestions.map((q, i) => (
            <div key={i} className="flex flex-col gap-1 border-b border-border pb-3 last:border-0 last:pb-0">
              <Badge variant="outline" className="w-fit">
                {q.category}
              </Badge>
              <p className="text-sm">{q.question}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>STAR story suggestions</CardTitle>
          <CardDescription>Mapped from your resume where possible.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {prep.starStories.map((s, i) => (
            <div key={i} className="flex flex-col gap-1 border-b border-border pb-4 last:border-0 last:pb-0">
              <p className="text-sm font-medium">{s.question}</p>
              <p className="text-sm text-muted-foreground">{s.suggestedStory}</p>
              <p className="text-xs text-muted-foreground/70">Resume evidence: {s.resumeEvidence}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="grid gap-6 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Portfolio / case study picks</CardTitle>
          </CardHeader>
          <CardContent>
            <BulletList items={prep.portfolioRecommendations} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Recruiter screen prep</CardTitle>
          </CardHeader>
          <CardContent>
            <BulletList items={prep.recruiterScreenPrep} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Hiring manager interview prep</CardTitle>
          </CardHeader>
          <CardContent>
            <BulletList items={prep.hiringManagerPrep} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Portfolio presentation prep</CardTitle>
          </CardHeader>
          <CardContent>
            <BulletList items={prep.portfolioPresentationPrep} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
