-- Backfill existing Leave rows so old and new rows read the same way
-- (Plan.md Phase 16). Every other request type stays NULL.
UPDATE "Request" SET "dayPart" = 'FullDay' WHERE "type" = 'Leave' AND "dayPart" IS NULL;
