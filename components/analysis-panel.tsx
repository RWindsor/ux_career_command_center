import type { JobAnalysis } from "@/lib/db/schema";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

function MetaItem({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium">{value}</dd>
    </div>
  );
}

function ListSection({ title, items }: { title: string; items: string[] }) {
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

export function AnalysisPanel({ analysis }: { analysis: JobAnalysis }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Gemini analysis</CardTitle>
        <CardDescription>
          Model: {analysis.model} · Generated {new Date(analysis.createdAt).toLocaleString()}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <p className="text-sm">{analysis.summary}</p>

        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <MetaItem label="Seniority" value={analysis.seniorityLevel} />
          <MetaItem label="Employment type" value={analysis.employmentType} />
          <MetaItem label="Experience" value={analysis.yearsOfExperience} />
          <MetaItem label="Salary range" value={analysis.salaryRange} />
        </dl>

        <div className="grid gap-6 sm:grid-cols-2">
          <ListSection title="Key responsibilities" items={analysis.keyResponsibilities} />
          <ListSection title="Required skills" items={analysis.requiredSkills} />
          <ListSection title="Nice to have" items={analysis.niceToHaveSkills} />
        </div>

        {analysis.keywords.length > 0 && (
          <div className="flex flex-col gap-2">
            <h4 className="text-sm font-semibold">Keywords</h4>
            <div className="flex flex-wrap gap-2">
              {analysis.keywords.map((keyword) => (
                <Badge key={keyword}>{keyword}</Badge>
              ))}
            </div>
          </div>
        )}

        <details className="text-xs text-muted-foreground">
          <summary className="cursor-pointer select-none">Raw structured JSON</summary>
          <pre className="mt-2 overflow-x-auto rounded-md bg-secondary p-3">
            {JSON.stringify(analysis.rawResponse, null, 2)}
          </pre>
        </details>
      </CardContent>
    </Card>
  );
}
