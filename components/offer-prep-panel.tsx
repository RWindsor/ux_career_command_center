import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import type { OfferPrep } from "@/lib/db/schema";

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

export function OfferPrepPanel({ prep }: { prep: OfferPrep }) {
  return (
    <div className="flex flex-col gap-6">
      <p className="text-xs text-muted-foreground">
        Model: {prep.model} · Generated {new Date(prep.createdAt).toLocaleString()}
      </p>

      <Card>
        <CardHeader>
          <CardTitle>Negotiation guide</CardTitle>
          <CardDescription>Based only on the compensation details you entered.</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{prep.negotiationGuide}</p>
        </CardContent>
      </Card>

      <div className="grid gap-6 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Offer evaluation checklist</CardTitle>
          </CardHeader>
          <CardContent>
            <BulletList items={prep.offerEvaluationChecklist} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Questions to ask before accepting</CardTitle>
          </CardHeader>
          <CardContent>
            <BulletList items={prep.questionsToAskBeforeAccepting} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Negotiation talking points</CardTitle>
        </CardHeader>
        <CardContent>
          <BulletList items={prep.negotiationTalkingPoints} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>30-60-90 day onboarding plan</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-6 sm:grid-cols-3">
          <div>
            <h4 className="mb-2 text-sm font-semibold">First 30 days</h4>
            <BulletList items={prep.onboardingPlan30} />
          </div>
          <div>
            <h4 className="mb-2 text-sm font-semibold">Days 30-60</h4>
            <BulletList items={prep.onboardingPlan60} />
          </div>
          <div>
            <h4 className="mb-2 text-sm font-semibold">Days 60-90</h4>
            <BulletList items={prep.onboardingPlan90} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
