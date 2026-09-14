"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

/** "Message" action on a Squad card — finds or starts the 1:1 conversation, then opens it. */
export function MessageButton({
  target,
}: {
  target: { employeeId: string } | { accountId: string };
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function startConversation() {
    setPending(true);
    try {
      const response = await fetch("/api/chat/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(target),
      });
      const body = await response.json().catch(() => null);

      if (!response.ok) {
        toast.error(body?.error ?? "Could not start a conversation.");
        return;
      }

      router.push(`/chat/${body.conversationId}`);
    } finally {
      setPending(false);
    }
  }

  return (
    <Button type="button" variant="outline" onClick={startConversation} disabled={pending}>
      <MessageCircle aria-hidden />
      Message
    </Button>
  );
}
