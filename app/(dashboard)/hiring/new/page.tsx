import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getActor } from "@/lib/auth";
import { canManageRecruitment } from "@/lib/permissions";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { FormBuilder } from "@/components/recruitment/form-builder";

export const metadata: Metadata = { title: "New hiring form" };

export default async function NewHiringFormPage() {
  const actor = await getActor();
  if (!actor) redirect("/login");
  if (!canManageRecruitment(actor)) redirect("/dashboard");

  return (
    <>
      <PageHeader
        title="New hiring form"
        description="Describe the role, then ask whatever you need to know. You choose where it gets published once it is ready."
      />

      <Card>
        <CardContent className="py-2">
          <FormBuilder />
        </CardContent>
      </Card>
    </>
  );
}
