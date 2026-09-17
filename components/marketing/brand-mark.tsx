import Image from "next/image";
import { cn } from "cn";

/**
 * WorkPulse wordmark: the product logo beside the brand-brown product name.
 */
export function BrandMark({
  className,
  labelClassName,
}: {
  className?: string;
  labelClassName?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <Image
        src="/tllogo.jpeg"
        alt=""
        aria-hidden
        width={28}
        height={28}
        className="size-7 shrink-0 rounded-md object-cover"
      />
      <span
        className={cn(
          "text-brand-brown text-h3 font-semibold tracking-tight",
          labelClassName
        )}
      >
        WorkPulse
      </span>
    </span>
  );
}
