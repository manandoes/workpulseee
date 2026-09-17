import type { DefaultSession } from "next-auth";
import type { AccountType, AppRole } from "@/lib/permissions";

/**
 * Session shape for WorkPulse.
 *
 * Every authenticated request carries the tenant (`companyId`), the role, and
 * which table the identity came from (`accountType`), so tenant scoping and
 * role checks never need an extra database round trip.
 */
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      companyId: string;
      companySlug: string;
      companyName: string;
      role: AppRole;
      accountType: AccountType;
    } & DefaultSession["user"];
  }

  interface User {
    companyId: string;
    companySlug: string;
    companyName: string;
    role: AppRole;
    accountType: AccountType;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    companyId: string;
    companySlug: string;
    companyName: string;
    role: AppRole;
    accountType: AccountType;
  }
}
