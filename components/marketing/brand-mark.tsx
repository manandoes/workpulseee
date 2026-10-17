import Image from "next/image";
import { cn } from "cn";

/**
 * WorkPulse wordmark: the product logo beside the brand-brown product name
 * and a "Powered By" sub-line below it.
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
          className="h-auto w-10 object-contain"
        />
      </span>
      {/* <span className="flex shrink-0 flex-col items-start gap-0.5"> */}
        <span
          className={cn(
            "text-brand-brown text-h10 font-bold leading-tight tracking-tight",
            labelClassName
          )}
        >
          WorkPulse
        </span>
        {/* <span className="text-[10px] leading-none text-muted-foreground">
          Powered By Talking Lens Media Pvt. Ltd.
        </span> */}
      {/* </span> */}
    </span>
  );
}
