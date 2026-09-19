import Image from "next/image";
import { cn } from "cn";

/**
 * WorkPulse wordmark: the product logo beside the brand-brown product name.
 */
export function BrandMark({
  className,
  labelClassName,
  logoBoxClassName,
}: {
  className?: string;
  labelClassName?: string;
  /** Lets the collapsed sidebar sit this logo in the same fixed icon box its
   * nav rows use, so every icon shares one vertical axis. */
  logoBoxClassName?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <span
        className={cn(
          "flex shrink-0 items-center justify-center",
          logoBoxClassName
        )}
      >
        <Image
          src="/workpulse-mark.png"
          alt=""
          aria-hidden
          width={28}
          height={18}
          className="h-auto w-7 object-contain"
        />
      </span>
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
