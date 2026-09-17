import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getActor } from "@/lib/auth";
import { PageHeader } from "@/components/dashboard/page-header";
import { RequestForm } from "@/components/requests/request-form";
import { Card, CardContent } from "@/components/ui/card";

export const metadata: Metadata = { title: "New request — WorkPulse" };

/** Submit a request (Phases.md Phase 7). Employee-only, like the API route. */
export default async function NewRequestPage() {
  const actor = await getActor();
  if (!actor) redirect("/login");
  if (actor.accountType !== "employee") redirect("/dashboard");

  return (
    <>
      <PageHeader
        title="New request"
        description="Your manager or HR will be notified as soon as you submit."
      />

      <Card>
        <CardContent className="py-2">
          <RequestForm />
        </CardContent>
      </Card>
    </>
  );
}
