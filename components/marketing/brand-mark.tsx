import Image from "next/image";
import { cn } from "cn";

/**
 * WorkPulse wordmark: the full Powered.png image containing the logo, brand
 * name, and tagline in one asset.
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center", className)}>
      <Image
        src="/Powered.png"
        alt="WorkPulse"
        width={120}
        height={32}
        className="h-auto w-auto max-w-30 object-contain"
        priority
      />
    </span>
  );
}
