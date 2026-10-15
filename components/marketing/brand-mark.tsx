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
        width={400}
        height={80}
        className="h-auto w-full object-contain"
        priority
      />
    </span>
  );
}
