import { auth } from "@/auth";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Briefcase, FileText, TrendingUp } from "lucide-react";

export default async function DashboardPage() {
  const session = await auth();
  const user = session?.user;

  const firstName = user?.email?.split("@")[0] ?? "there";

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="font-display text-2xl font-semibold tracking-tight">
          Welcome back, {firstName}
        </h2>
        <p className="text-sm text-muted-foreground">
          Your foundation is live. Job tracking arrives in Phase 2.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Active applications</CardTitle>
            <Briefcase className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="font-display text-3xl font-semibold">—</div>
            <p className="text-xs text-muted-foreground">Job Database arrives in Phase 2</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Response rate</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="font-display text-3xl font-semibold">—</div>
            <p className="text-xs text-muted-foreground">Tracked once applications exist</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Resumes on file</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="font-display text-3xl font-semibold">—</div>
            <p className="text-xs text-muted-foreground">Resume Library arrives in Phase 2</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>You&apos;re signed in and protected</CardTitle>
          <CardDescription>
            This page only renders for an authenticated session — middleware and the layout both check it.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Account: <span className="font-medium text-foreground">{user?.email}</span>
        </CardContent>
      </Card>
    </div>
  );
}
