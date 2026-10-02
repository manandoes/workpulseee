-- Add messaging provider enum (Postgres native enum).
CREATE TYPE "MessagingProvider" AS ENUM ('Native', 'Google', 'Both');

-- Company-level defaults: Native keeps existing organizations working unchanged.
ALTER TABLE "Company"
  ADD COLUMN     "messagingProvider" "MessagingProvider" NOT NULL DEFAULT 'Native',
  ADD COLUMN     "googleChatEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN     "googleChatRefreshTokenEncrypted" TEXT,
  ADD COLUMN     "googleChatConnectedByEmail"    TEXT,
  ADD COLUMN     "googleChatConnectedAt"         TIMESTAMPTZ;

-- Conversation records its actual backend at creation time so a later
-- default-provider switch never rewrites existing conversations.
ALTER TABLE "Conversation"
  ADD COLUMN     "provider"      "MessagingProvider" NOT NULL DEFAULT 'Native',
  ADD COLUMN     "googleSpaceId" TEXT;
