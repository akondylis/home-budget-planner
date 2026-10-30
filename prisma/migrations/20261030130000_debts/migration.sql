-- CreateTable
CREATE TABLE "Debt" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "direction" TEXT NOT NULL DEFAULT 'WE_OWE',
    "counterparty" TEXT,
    "institutionId" TEXT,
    "principalCents" INTEGER NOT NULL,
    "rateBp" INTEGER NOT NULL DEFAULT 0,
    "termMonths" INTEGER,
    "instalmentCents" INTEGER,
    "startDate" DATETIME NOT NULL,
    "accountId" TEXT,
    "memberId" TEXT,
    "ruleId" TEXT,
    "balanceOverrideCents" INTEGER,
    "balanceOverrideAt" DATETIME,
    "note" TEXT,
    "archivedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Debt_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Debt_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Debt_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Debt_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "RecurringRule" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Transaction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountId" TEXT NOT NULL,
    "bookedAt" DATETIME NOT NULL,
    "valueDate" DATETIME,
    "amountCents" INTEGER NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "payee" TEXT,
    "categoryId" TEXT,
    "note" TEXT,
    "memberId" TEXT,
    "createdByMemberId" TEXT,
    "transferId" TEXT,
    "importBatchId" TEXT,
    "fingerprint" TEXT,
    "bankReference" TEXT,
    "balanceAfterCents" INTEGER,
    "debtId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Transaction_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Transaction_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Transaction_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Transaction_createdByMemberId_fkey" FOREIGN KEY ("createdByMemberId") REFERENCES "Member" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Transaction_importBatchId_fkey" FOREIGN KEY ("importBatchId") REFERENCES "ImportBatch" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Transaction_debtId_fkey" FOREIGN KEY ("debtId") REFERENCES "Debt" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Transaction" ("accountId", "amountCents", "balanceAfterCents", "bankReference", "bookedAt", "categoryId", "createdAt", "createdByMemberId", "description", "fingerprint", "id", "importBatchId", "memberId", "note", "payee", "transferId", "updatedAt", "valueDate") SELECT "accountId", "amountCents", "balanceAfterCents", "bankReference", "bookedAt", "categoryId", "createdAt", "createdByMemberId", "description", "fingerprint", "id", "importBatchId", "memberId", "note", "payee", "transferId", "updatedAt", "valueDate" FROM "Transaction";
DROP TABLE "Transaction";
ALTER TABLE "new_Transaction" RENAME TO "Transaction";
CREATE INDEX "Transaction_accountId_bankReference_idx" ON "Transaction"("accountId", "bankReference");
CREATE INDEX "Transaction_accountId_bookedAt_idx" ON "Transaction"("accountId", "bookedAt");
CREATE INDEX "Transaction_bookedAt_idx" ON "Transaction"("bookedAt");
CREATE INDEX "Transaction_categoryId_idx" ON "Transaction"("categoryId");
CREATE INDEX "Transaction_transferId_idx" ON "Transaction"("transferId");
CREATE INDEX "Transaction_importBatchId_idx" ON "Transaction"("importBatchId");
CREATE INDEX "Transaction_memberId_idx" ON "Transaction"("memberId");
CREATE INDEX "Transaction_debtId_idx" ON "Transaction"("debtId");
CREATE UNIQUE INDEX "Transaction_accountId_fingerprint_key" ON "Transaction"("accountId", "fingerprint");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "Debt_ruleId_key" ON "Debt"("ruleId");
