import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getActor } from "@/lib/auth";
import { PageHeader } from "@/components/dashboard/page-header";
import { ConversationList } from "@/components/chat/conversation-list";
import { MessageThread } from "@/components/chat/message-thread";

export const metadata: Metadata = { title: "Chat — WorkPulse" };

export default async function ConversationPage({
  params,
}: PageProps<"/chat/[conversationId]">) {
  const actor = await getActor();
  if (!actor) redirect("/login");

  const { conversationId } = await params;

  return (
    <>
      <Link
        href="/chat"
        className="text-text-secondary hover:text-brand-brown mb-4 inline-flex items-center gap-1.5 md:hidden"
      >
        <ArrowLeft aria-hidden className="size-4" strokeWidth={1.5} />
        All conversations
      </Link>

      <PageHeader title="Chat" />

      <div className="grid gap-6 md:grid-cols-[18rem_1fr]">
        <div className="hidden md:block">
          <ConversationList />
        </div>
        <MessageThread conversationId={conversationId} />
      </div>
    </>
  );
}
