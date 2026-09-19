import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getActor } from "@/lib/auth";
import { canManageRecruitment } from "@/lib/permissions";
import { loadApplicants, loadHiringForm } from "@/lib/recruitment-data";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { FormBuilder } from "@/components/recruitment/form-builder";

export const metadata: Metadata = { title: "Edit hiring form" };

/**
 * Editing is refused once anyone has applied.
 *
 * Saving rewrites the question rows wholesale, which would take every stored
 * answer with them — so the server refuses it, and this page refuses to offer
 * it rather than letting someone fill in a form that will not save.
 */
export default async function EditHiringFormPage({
  params,
}: PageProps<"/hiring/[formId]/edit">) {
  const actor = await getActor();
  if (!actor) redirect("/login");
  if (!canManageRecruitment(actor)) redirect("/dashboard");

  const { formId } = await params;

  const form = await loadHiringForm(actor, formId);
  if (!form) notFound();

  const applicants = await loadApplicants(actor, formId);
  if (applicants.length > 0) redirect(`/hiring/${formId}`);

  return (
    <>
      <PageHeader
        title={`Edit ${form.title}`}
        description="Changing the questions is only possible while nobody has applied."
      />

      <Card>
        <CardContent className="py-2">
          <FormBuilder form={form} />
        </CardContent>
      </Card>
    </>
  );
}
