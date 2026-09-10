import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { jobs, resumes } from "@/lib/db/schema";
import { getPipelineStats, getLatestWeeklyReport } from "@/app/actions/reports";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Briefcase, FileText, TrendingUp, Users, Percent, XCircle } from "lucide-react";
import { GenerateWeeklyReportButton } from "@/components/generate-weekly-report-button";

export default async function DashboardPage() {
  const session = await auth();
  const user = session?.user;
  const userId = user!.id!;

  const firstName = user?.email?.split("@")[0] ?? "there";

  const userJobs = await db.select().from(jobs).where(eq(jobs.userId, userId));
  const userResumes = await db.select().from(resumes).where(eq(resumes.userId, userId));
  const stats = await getPipelineStats(userId);
  const latestReport = await getLatestWeeklyReport(userId);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h2 className="font-display text-2xl font-semibold tracking-tight">Welcome back, {firstName}</h2>
        <p className="text-sm text-muted-foreground">
          {userJobs.length > 0
            ? `${userJobs.length} job${userJobs.length === 1 ? "" : "s"} in your pipeline.`
            : "Add your first job to get a Gemini analysis."}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Applications submitted</CardTitle>
            <Briefcase className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="font-display text-3xl font-semibold">{stats.applicationsSubmittedThisWeek}</div>
            <p className="text-xs text-muted-foreground">This week · {userJobs.length} total saved</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Active opportunities</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="font-display text-3xl font-semibold">{stats.totalActiveOpportunities}</div>
            <p className="text-xs text-muted-foreground">Applied/interviewing jobs + open contract opportunities</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Interview conversion</CardTitle>
            <Percent className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="font-display text-3xl font-semibold">
              {stats.interviewConversionRate !== null ? `${stats.interviewConversionRate}%` : "—"}
            </div>
            <p className="text-xs text-muted-foreground">Of applications sent, reached interviewing or offer</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Rejection rate</CardTitle>
            <XCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="font-display text-3xl font-semibold">
              {stats.rejectionRate !== null ? `${stats.rejectionRate}%` : "—"}
            </div>
            <p className="text-xs text-muted-foreground">Of applications sent</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Recruiter activity</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="font-display text-3xl font-semibold">{stats.recruiterActivity.totalContacts}</div>
            <p className="text-xs text-muted-foreground">
              {stats.recruiterActivity.contactedThisWeek} contacted this week ·{" "}
              {stats.recruiterActivity.overdueFollowUps} overdue follow-ups
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Resumes on file</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="font-display text-3xl font-semibold">{userResumes.length}</div>
            <p className="text-xs text-muted-foreground">In your Resume Library</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Pipeline breakdown</CardTitle>
            <CardDescription>Jobs by status</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {Object.entries(stats.pipelineBreakdown).length === 0 ? (
              <p className="text-sm text-muted-foreground">No jobs yet.</p>
            ) : (
              Object.entries(stats.pipelineBreakdown).map(([status, count]) => (
                <Badge key={status} variant="outline">
                  {status}: {count}
                </Badge>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Top-match opportunities</CardTitle>
            <CardDescription>Highest Gemini match scores</CardDescription>
          </CardHeader>
          <CardContent>
            {stats.topMatches.length === 0 ? (
              <p className="text-sm text-muted-foreground">No match scores yet — score a job against a resume to see it here.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {stats.topMatches.map((match, i) => (
                  <li key={i} className="flex items-center justify-between text-sm">
                    <span>
                      {match.title} <span className="text-muted-foreground">@ {match.company}</span>
                    </span>
                    <Badge>{match.score}%</Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
          <div>
            <CardTitle>Weekly career report</CardTitle>
            <CardDescription>
              {latestReport
                ? `Generated ${new Date(latestReport.createdAt).toLocaleString()} for the week of ${new Date(
                    latestReport.weekStart
                  ).toLocaleDateString()}`
                : "Generate an AI recap of this week's activity and recommendations for next week."}
            </CardDescription>
          </div>
          <GenerateWeeklyReportButton />
        </CardHeader>
        {latestReport && (
          <CardContent className="flex flex-col gap-4">
            <p className="text-sm text-muted-foreground">{latestReport.summary}</p>
            <div>
              <p className="mb-2 text-sm font-medium">Recommendations for next week</p>
              <ul className="flex flex-col gap-2">
                {latestReport.recommendations.map((rec, i) => (
                  <li key={i} className="flex gap-2 text-sm text-muted-foreground">
                    <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-muted-foreground" />
                    <span>{rec}</span>
                  </li>
                ))}
              </ul>
            </div>
          </CardContent>
        )}
      </Card>
    </div>
  );
}
