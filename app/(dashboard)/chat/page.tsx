import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getActor } from "@/lib/auth";
import { PageHeader } from "@/components/dashboard/page-header";
import { ConversationList } from "@/components/chat/conversation-list";

export const metadata: Metadata = { title: "Chat" };

/**
 * Chat list (Phase 11). Reachable by both account types — start a
 * conversation from a Squad member's card, or continue one already listed
 * here. Messages are removed automatically 3 days after they are sent.
 */
export default async function ChatPage() {
  const actor = await getActor();
  if (!actor) redirect("/login");

  return (
    <>
      <PageHeader
        title="Chat"
        description="Message anyone at the company. Messages are removed automatically after 3 days."
      />
      <ConversationList />
    </>
  );
}
