import { cn } from "cn";

/**
 * Full-width marketing section with a centered 1200px content container
 * (Design.md section 5).
 */
export function Section({
  id,
  className,
  containerClassName,
  children,
}: {
  id?: string;
  className?: string;
  containerClassName?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className={cn("w-full px-6 py-20 sm:py-28", className)}>
      <div className={cn("mx-auto w-full max-w-[1200px]", containerClassName)}>
        {children}
      </div>
    </section>
  );
}

/**
 * A section's heading, on its own — no eyebrow/kicker line above it. The
 * heading carries its own weight at a committed display scale; a label
 * floating above it would only repeat what the heading already says.
 */
export function SectionHeading({
  title,
  description,
  align = "center",
}: {
  title: string;
  description?: string;
  align?: "center" | "start";
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-4",
        align === "center" ? "items-center text-center" : "items-start"
      )}
    >
      <h2 className="text-brand-brown max-w-3xl text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
        {title}
      </h2>
      {description ? (
        <p
          className={cn(
            "text-text-secondary max-w-2xl text-lg text-pretty",
            align === "center" && "mx-auto"
          )}
        >
          {description}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Scoreboard-style all-caps label — a roster position, a plan division, a
 * step count. Used inline beside content it names (a card's own header, a
 * nav tab), never floating above a heading as a kicker.
 */
export function LabelTag({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "border-brand-brown text-brand-brown inline-flex items-center gap-1.5 rounded-full border-2 px-3 py-1 text-xs font-bold tracking-wide uppercase",
        className
      )}
    >
      {children}
    </span>
  );
}
