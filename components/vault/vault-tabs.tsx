import { SectionTabs } from "@/components/dashboard/section-tabs";

/**
 * The vault manager's sub-navigation (Plan: client vault). Requesters have a
 * single `/vault` view and never see these tabs.
 */
export function VaultTabs() {
  return (
    <SectionTabs
      label="Vault sections"
      items={[
        { href: "/vault", label: "Access" },
        { href: "/vault/credentials", label: "Credentials" },
      ]}
    />
  );
}
