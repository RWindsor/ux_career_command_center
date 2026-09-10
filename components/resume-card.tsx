import { Sparkles } from "lucide-react";
import type { Resume, ResumeAnalysis } from "@/lib/db/schema";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ReparseResumeButton } from "@/components/reparse-resume-button";
import { DeleteResumeButton } from "@/components/delete-resume-button";

export function ResumeCard({ resume, analysis }: { resume: Resume; analysis: ResumeAnalysis | null }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between space-y-0">
        <div>
          <CardTitle className="text-base">{resume.label}</CardTitle>
          {analysis?.yearsOfExperience && (
            <CardDescription>{analysis.yearsOfExperience} of experience</CardDescription>
          )}
        </div>
        <div className="flex items-center gap-2">
          <ReparseResumeButton resumeId={resume.id} />
          <DeleteResumeButton resumeId={resume.id} />
        </div>
      </CardHeader>
      <CardContent>
        {analysis ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">{analysis.experienceSummary}</p>
            {analysis.skills.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {analysis.skills.slice(0, 12).map((skill) => (
                  <Badge key={skill} variant="secondary">
                    {skill}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        ) : (
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5" /> Not parsed yet
          </p>
        )}
      </CardContent>
    </Card>
  );
}
