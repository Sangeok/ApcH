-- Additive migration: no credit backfill or deduction and no assumption that
-- legacy dispatches have stopped producing files.
ALTER TABLE "User" ADD COLUMN "reservedCredits" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD CONSTRAINT "User_credit_balance_check"
  CHECK ("credits" >= 0 AND "reservedCredits" >= 0 AND "reservedCredits" <= "credits");
ALTER TABLE "UploadedFile" ADD COLUMN "deletedAt" TIMESTAMP(3);
ALTER TABLE "Clip" ADD COLUMN "deletedAt" TIMESTAMP(3);

CREATE TABLE "CreditReservation" (
  "id" TEXT NOT NULL PRIMARY KEY, "userId" TEXT NOT NULL,
  "operationKey" TEXT NOT NULL, "kind" TEXT NOT NULL,
  "reservedAmount" INTEGER NOT NULL, "chargedAmount" INTEGER NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'held',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, "settledAt" TIMESTAMP(3), "releasedAt" TIMESTAMP(3),
  CONSTRAINT "CreditReservation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "CreditReservation_kind_check" CHECK ("kind" IN ('video','card-news')),
  CONSTRAINT "CreditReservation_amount_status_check" CHECK (
    "reservedAmount" > 0 AND "chargedAmount" >= 0 AND "chargedAmount" <= "reservedAmount"
    AND ("kind" <> 'card-news' OR ("reservedAmount" = 1 AND ("status" <> 'settled' OR "chargedAmount" = 1)))
    AND (("status" = 'held' AND "chargedAmount" = 0 AND "settledAt" IS NULL AND "releasedAt" IS NULL)
      OR ("status" = 'settled' AND "settledAt" IS NOT NULL AND "releasedAt" IS NULL)
      OR ("status" = 'released' AND "chargedAmount" = 0 AND "releasedAt" IS NOT NULL AND "settledAt" IS NULL)))
);
CREATE UNIQUE INDEX "CreditReservation_operationKey_key" ON "CreditReservation"("operationKey");
CREATE INDEX "CreditReservation_userId_status_idx" ON "CreditReservation"("userId","status");
CREATE INDEX "CreditReservation_status_createdAt_idx" ON "CreditReservation"("status","createdAt");

ALTER TABLE "ProcessingDispatch"
  ADD COLUMN "workerRunId" TEXT, ADD COLUMN "modalCallId" TEXT,
  ADD COLUMN "modalSpawnState" TEXT NOT NULL DEFAULT 'unknown',
  ADD COLUMN "producerEndEvidence" JSONB, ADD COLUMN "reservationId" TEXT,
  ADD COLUMN "inputSnapshot" JSONB, ADD COLUMN "claimedAt" TIMESTAMP(3),
  ADD COLUMN "leaseUntil" TIMESTAMP(3), ADD COLUMN "heartbeatAt" TIMESTAMP(3),
  ADD COLUMN "deadlineAt" TIMESTAMP(3);
ALTER TABLE "ProcessingDispatch" ADD CONSTRAINT "ProcessingDispatch_reservationId_fkey"
  FOREIGN KEY ("reservationId") REFERENCES "CreditReservation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProcessingDispatch" ADD CONSTRAINT "ProcessingDispatch_modalSpawnState_check"
  CHECK ("modalSpawnState" IN ('not_sent','sending','accepted','unknown','ended'));
CREATE INDEX "ProcessingDispatch_reservationId_idx" ON "ProcessingDispatch"("reservationId");

CREATE TABLE "CardNewsSet" (
  "id" TEXT NOT NULL PRIMARY KEY, "userId" TEXT NOT NULL, "clipId" TEXT NOT NULL,
  "uploadedFileId" TEXT NOT NULL, "sourceSnapshot" JSONB NOT NULL, "sourceHash" TEXT NOT NULL,
  "language" TEXT NOT NULL, "draftDocument" JSONB, "draftSnapshots" JSONB NOT NULL DEFAULT '{}',
  "draftRevision" INTEGER NOT NULL DEFAULT 0, "publishedRevision" INTEGER NOT NULL DEFAULT 0,
  "pendingRenderRevision" INTEGER, "regeneratedFromId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'generating', "deletedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CardNewsSet_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "CardNewsSet_clipId_fkey" FOREIGN KEY ("clipId") REFERENCES "Clip"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "CardNewsSet_uploadedFileId_fkey" FOREIGN KEY ("uploadedFileId") REFERENCES "UploadedFile"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "CardNewsSet_regeneratedFromId_fkey" FOREIGN KEY ("regeneratedFromId") REFERENCES "CardNewsSet"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "CardNewsSet_status_check" CHECK ("status" IN ('generating','ready','failed','deleting')),
  CONSTRAINT "CardNewsSet_language_check" CHECK ("language" IN ('English','Korean')),
  CONSTRAINT "CardNewsSet_revision_check" CHECK (
    "draftRevision" >= 0 AND "publishedRevision" >= 0 AND "publishedRevision" <= "draftRevision"
    AND ("pendingRenderRevision" IS NULL OR ("pendingRenderRevision" > 0 AND "pendingRenderRevision" <= "draftRevision")))
);
CREATE INDEX "CardNewsSet_userId_createdAt_idx" ON "CardNewsSet"("userId","createdAt");
CREATE INDEX "CardNewsSet_clipId_idx" ON "CardNewsSet"("clipId");
CREATE INDEX "CardNewsSet_uploadedFileId_idx" ON "CardNewsSet"("uploadedFileId");
CREATE INDEX "CardNewsSet_status_deletedAt_idx" ON "CardNewsSet"("status","deletedAt");

CREATE TABLE "CardNewsJob" (
  "id" TEXT NOT NULL PRIMARY KEY, "userId" TEXT NOT NULL, "setId" TEXT NOT NULL,
  "kind" TEXT NOT NULL, "requestId" TEXT NOT NULL, "requestHash" TEXT NOT NULL,
  "inputRevision" INTEGER NOT NULL, "inputSnapshot" JSONB NOT NULL,
  "executionEpoch" INTEGER NOT NULL DEFAULT 1, "status" TEXT NOT NULL DEFAULT 'pending',
  "stage" TEXT NOT NULL DEFAULT 'accepted', "reservationId" TEXT, "templateVersion" TEXT NOT NULL,
  "deadlineAt" TIMESTAMP(3) NOT NULL, "dispatchStatus" TEXT NOT NULL DEFAULT 'pending',
  "dispatchLeaseUntil" TIMESTAMP(3), "nextDispatchAt" TIMESTAMP(3),
  "dispatchCount" INTEGER NOT NULL DEFAULT 0, "lastDispatchError" TEXT, "dispatchedAt" TIMESTAMP(3),
  "claimedAt" TIMESTAMP(3), "heartbeatAt" TIMESTAMP(3), "workerRunId" TEXT,
  "modalCallId" TEXT, "modalSpawnState" TEXT NOT NULL DEFAULT 'not_sent', "callbackInbox" JSONB NOT NULL DEFAULT '[]',
  "selectedManifestKey" TEXT, "selectedInvocationId" TEXT, "progressInvocationId" TEXT, "manifest" JSONB,
  "failureCode" TEXT, "completedAt" TIMESTAMP(3), "usageMetrics" JSONB, "analyticsContext" JSONB,
  "pendingAnalytics" JSONB NOT NULL DEFAULT '[]', "outputRetiredAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CardNewsJob_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "CardNewsJob_setId_fkey" FOREIGN KEY ("setId") REFERENCES "CardNewsSet"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CardNewsJob_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "CreditReservation"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "CardNewsJob_kind_reservation_check" CHECK (
    ("kind" = 'generate' AND "reservationId" IS NOT NULL AND "inputRevision" = 1)
    OR ("kind" = 'render' AND "reservationId" IS NULL AND "inputRevision" >= 1)),
  CONSTRAINT "CardNewsJob_status_check" CHECK ("status" IN ('pending','running','completed','failed','superseded')),
  CONSTRAINT "CardNewsJob_dispatchStatus_check" CHECK ("dispatchStatus" IN ('pending','sending','sent','retryable_failed')),
  CONSTRAINT "CardNewsJob_modalSpawnState_check" CHECK ("modalSpawnState" IN ('not_sent','sending','accepted','unknown','ended')),
  CONSTRAINT "CardNewsJob_stage_check" CHECK ("stage" IN ('accepted','generating-text','extracting-cover','rendering','packaging','completed','failed')),
  CONSTRAINT "CardNewsJob_epoch_count_check" CHECK ("executionEpoch" >= 1 AND "dispatchCount" >= 0)
);
CREATE UNIQUE INDEX "CardNewsJob_userId_requestId_key" ON "CardNewsJob"("userId","requestId");
CREATE UNIQUE INDEX "CardNewsJob_one_active_generate_per_user_idx" ON "CardNewsJob"("userId")
  WHERE "kind" = 'generate' AND "status" IN ('pending','running');
CREATE UNIQUE INDEX "CardNewsJob_one_active_render_per_set_idx" ON "CardNewsJob"("setId")
  WHERE "kind" = 'render' AND "status" IN ('pending','running');
CREATE INDEX "CardNewsJob_setId_inputRevision_templateVersion_idx" ON "CardNewsJob"("setId","inputRevision","templateVersion");
CREATE INDEX "CardNewsJob_status_nextDispatchAt_idx" ON "CardNewsJob"("status","nextDispatchAt");
CREATE INDEX "CardNewsJob_status_deadlineAt_idx" ON "CardNewsJob"("status","deadlineAt");
CREATE INDEX "CardNewsJob_reservationId_idx" ON "CardNewsJob"("reservationId");

CREATE TABLE "CardNewsInvocation" (
  "id" TEXT NOT NULL PRIMARY KEY, "jobId" TEXT NOT NULL, "executionEpoch" INTEGER NOT NULL,
  "invocationId" TEXT NOT NULL, "modalCallId" TEXT NOT NULL, "writeDeadlineAt" TIMESTAMP(3) NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'registered', "progressSequence" INTEGER NOT NULL DEFAULT 0,
  "stage" TEXT NOT NULL DEFAULT 'accepted', "producerEndEvidence" JSONB,
  "registeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "endedAt" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CardNewsInvocation_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "CardNewsJob"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CardNewsInvocation_status_check" CHECK ("status" IN ('registered','pending','ended','unknown')),
  CONSTRAINT "CardNewsInvocation_progress_check" CHECK ("executionEpoch" >= 1 AND "progressSequence" >= 0),
  CONSTRAINT "CardNewsInvocation_stage_check" CHECK ("stage" IN ('accepted','generating-text','extracting-cover','rendering','packaging','completed','failed'))
);
CREATE UNIQUE INDEX "CardNewsInvocation_jobId_executionEpoch_invocationId_key" ON "CardNewsInvocation"("jobId","executionEpoch","invocationId");
CREATE INDEX "CardNewsInvocation_status_writeDeadlineAt_idx" ON "CardNewsInvocation"("status","writeDeadlineAt");

CREATE TABLE "AssetCleanupJob" (
  "id" TEXT NOT NULL PRIMARY KEY, "userId" TEXT NOT NULL, "kind" TEXT NOT NULL, "scopeId" TEXT NOT NULL,
  "scopeSnapshot" JSONB NOT NULL, "exactKeys" JSONB NOT NULL DEFAULT '[]',
  "dedicatedPrefixes" JSONB NOT NULL DEFAULT '[]', "retainedReferences" JSONB NOT NULL DEFAULT '[]',
  "producerReferences" JSONB NOT NULL DEFAULT '[]', "cursor" JSONB,
  "failedKeys" JSONB NOT NULL DEFAULT '[]', "status" TEXT NOT NULL DEFAULT 'pending',
  "notBefore" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "leaseUntil" TIMESTAMP(3),
  "nextRetryAt" TIMESTAMP(3), "attemptCount" INTEGER NOT NULL DEFAULT 0, "lastError" TEXT,
  "completedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AssetCleanupJob_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AssetCleanupJob_kind_check" CHECK ("kind" IN ('set','clip','uploaded-file','orphan','retention')),
  CONSTRAINT "AssetCleanupJob_status_check" CHECK ("status" IN ('pending','running','retryable_failed','completed')),
  CONSTRAINT "AssetCleanupJob_count_check" CHECK ("attemptCount" >= 0)
);
CREATE INDEX "AssetCleanupJob_status_notBefore_nextRetryAt_idx" ON "AssetCleanupJob"("status","notBefore","nextRetryAt");
CREATE INDEX "AssetCleanupJob_userId_kind_scopeId_idx" ON "AssetCleanupJob"("userId","kind","scopeId");

-- Keep monetary and producer state through accidental parent cascades. These
-- protections also apply to direct SQL, independent of application guards.
CREATE FUNCTION "card_news_guard_active_delete"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME = 'CreditReservation' AND OLD."status" = 'held' THEN
    RAISE EXCEPTION 'Cannot delete a held credit reservation' USING ERRCODE = '23514';
  ELSIF TG_TABLE_NAME = 'CardNewsJob' THEN
    IF OLD."status" IN ('pending','running') OR EXISTS (
      SELECT 1 FROM "CreditReservation" WHERE "id" = OLD."reservationId" AND "status" = 'held'
    ) THEN
      RAISE EXCEPTION 'Cannot delete an active card-news job' USING ERRCODE = '23514';
    END IF;
  ELSIF TG_TABLE_NAME = 'ProcessingDispatch' THEN
    IF EXISTS (SELECT 1 FROM "CreditReservation" WHERE "id" = OLD."reservationId" AND "status" = 'held') THEN
      RAISE EXCEPTION 'Cannot delete a reserved video dispatch' USING ERRCODE = '23514';
    END IF;
  ELSIF TG_TABLE_NAME = 'AssetCleanupJob' AND OLD."status" <> 'completed' THEN
    RAISE EXCEPTION 'Cannot delete an active asset cleanup job' USING ERRCODE = '23514';
  END IF;
  RETURN OLD;
END $$;
CREATE TRIGGER "CreditReservation_protect_held" BEFORE DELETE ON "CreditReservation"
  FOR EACH ROW EXECUTE FUNCTION "card_news_guard_active_delete"();
CREATE TRIGGER "CardNewsJob_protect_active" BEFORE DELETE ON "CardNewsJob"
  FOR EACH ROW EXECUTE FUNCTION "card_news_guard_active_delete"();
CREATE TRIGGER "ProcessingDispatch_protect_reserved" BEFORE DELETE ON "ProcessingDispatch"
  FOR EACH ROW EXECUTE FUNCTION "card_news_guard_active_delete"();
CREATE TRIGGER "AssetCleanupJob_protect_active" BEFORE DELETE ON "AssetCleanupJob"
  FOR EACH ROW EXECUTE FUNCTION "card_news_guard_active_delete"();
