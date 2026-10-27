-- CreateTable
CREATE TABLE "Member" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "colour" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "archivedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ImportBatch" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileHash" TEXT NOT NULL,
    "dateFrom" DATETIME NOT NULL,
    "dateTo" DATETIME NOT NULL,
    "rowCount" INTEGER NOT NULL,
    "importedCount" INTEGER NOT NULL,
    "skippedCount" INTEGER NOT NULL,
    "statementBalanceCents" INTEGER,
    "statementBalanceDate" DATETIME,
    "createdByMemberId" TEXT,
    "importedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "undoneAt" DATETIME,
    CONSTRAINT "ImportBatch_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ImportBatch_createdByMemberId_fkey" FOREIGN KEY ("createdByMemberId") REFERENCES "Member" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_ImportBatch" ("accountId", "dateFrom", "dateTo", "fileHash", "fileName", "id", "importedAt", "importedCount", "rowCount", "skippedCount", "statementBalanceCents", "statementBalanceDate", "undoneAt") SELECT "accountId", "dateFrom", "dateTo", "fileHash", "fileName", "id", "importedAt", "importedCount", "rowCount", "skippedCount", "statementBalanceCents", "statementBalanceDate", "undoneAt" FROM "ImportBatch";
DROP TABLE "ImportBatch";
ALTER TABLE "new_ImportBatch" RENAME TO "ImportBatch";
CREATE INDEX "ImportBatch_accountId_fileHash_idx" ON "ImportBatch"("accountId", "fileHash");
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Transaction_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Transaction_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Transaction_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Transaction_createdByMemberId_fkey" FOREIGN KEY ("createdByMemberId") REFERENCES "Member" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Transaction_importBatchId_fkey" FOREIGN KEY ("importBatchId") REFERENCES "ImportBatch" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Transaction" ("accountId", "amountCents", "balanceAfterCents", "bankReference", "bookedAt", "categoryId", "createdAt", "description", "fingerprint", "id", "importBatchId", "note", "payee", "transferId", "updatedAt", "valueDate") SELECT "accountId", "amountCents", "balanceAfterCents", "bankReference", "bookedAt", "categoryId", "createdAt", "description", "fingerprint", "id", "importBatchId", "note", "payee", "transferId", "updatedAt", "valueDate" FROM "Transaction";
DROP TABLE "Transaction";
ALTER TABLE "new_Transaction" RENAME TO "Transaction";
CREATE INDEX "Transaction_accountId_bookedAt_idx" ON "Transaction"("accountId", "bookedAt");
CREATE INDEX "Transaction_bookedAt_idx" ON "Transaction"("bookedAt");
CREATE INDEX "Transaction_categoryId_idx" ON "Transaction"("categoryId");
CREATE INDEX "Transaction_transferId_idx" ON "Transaction"("transferId");
CREATE INDEX "Transaction_importBatchId_idx" ON "Transaction"("importBatchId");
CREATE INDEX "Transaction_memberId_idx" ON "Transaction"("memberId");
CREATE UNIQUE INDEX "Transaction_accountId_fingerprint_key" ON "Transaction"("accountId", "fingerprint");
CREATE UNIQUE INDEX "Transaction_accountId_bankReference_key" ON "Transaction"("accountId", "bankReference");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
