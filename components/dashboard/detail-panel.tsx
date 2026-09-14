import { Card, CardContent } from "@/components/ui/card";

/**
 * A titled card for a profile-style detail page. Shared by
 * `employees/[id]/page.tsx` and `squad/[memberKind]/[memberId]/page.tsx` —
 * both render the same "gated block with an explanatory note when hidden"
 * shape, just for different subjects.
 */
export function Panel({
  title,
  note,
  /** Render the body as prose or a list rather than a definition list. */
  plain,
  children,
}: {
  title: string;
  note?: string;
  plain?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-4 py-2">
        <div className="flex flex-col gap-1">
          <h2 className="text-h3 text-brand-brown font-semibold">{title}</h2>
          {note ? (
            <p className="text-text-secondary text-meta">{note}</p>
          ) : null}
        </div>
        {plain ? (
          children
        ) : (
          <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">{children}</dl>
        )}
      </CardContent>
    </Card>
  );
}

export function Detail({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-text-secondary text-meta">{label}</dt>
      <dd className="text-foreground break-words">{value || "—"}</dd>
    </div>
  );
}
