import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getActor } from "@/lib/auth";
import { PageHeader } from "@/components/dashboard/page-header";
import { RequestForm } from "@/components/requests/request-form";
import { Card, CardContent } from "@/components/ui/card";

export const metadata: Metadata = { title: "New request" };

/** Submit a request (Phases.md Phase 7). Employee-only, like the API route. */
export default async function NewRequestPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; type?: string }>;
}) {
  const actor = await getActor();
  if (!actor) redirect("/login");
  if (actor.accountType !== "employee") redirect("/dashboard");

  const { date: prefillDate, type: prefillType } = await searchParams;
  const validType = ["Leave", "WFH"].includes(prefillType ?? "")
    ? (prefillType as "Leave" | "WFH")
    : undefined;

  return (
    <>
      <PageHeader
        title="New request"
        description="Your manager or HR will be notified as soon as you submit."
      />

      <Card>
        <CardContent className="py-2">
          <RequestForm
            prefillDate={prefillDate}
            prefillType={validType}
          />
        </CardContent>
      </Card>
    </>
  );
}
