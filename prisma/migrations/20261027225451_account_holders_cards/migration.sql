-- CreateTable
CREATE TABLE "Card" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountId" TEXT NOT NULL,
    "last4" TEXT NOT NULL,
    "holderMemberId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Card_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Card_holderMemberId_fkey" FOREIGN KEY ("holderMemberId") REFERENCES "Member" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Account" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "institution" TEXT NOT NULL DEFAULT 'OTHER',
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "openingBalanceCents" INTEGER NOT NULL DEFAULT 0,
    "openingDate" DATETIME NOT NULL,
    "importProfile" TEXT,
    "importMapping" JSONB,
    "holderMemberId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "archivedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Account_holderMemberId_fkey" FOREIGN KEY ("holderMemberId") REFERENCES "Member" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Account" ("archivedAt", "createdAt", "currency", "id", "importMapping", "importProfile", "institution", "kind", "name", "openingBalanceCents", "openingDate", "sortOrder", "updatedAt") SELECT "archivedAt", "createdAt", "currency", "id", "importMapping", "importProfile", "institution", "kind", "name", "openingBalanceCents", "openingDate", "sortOrder", "updatedAt" FROM "Account";
DROP TABLE "Account";
ALTER TABLE "new_Account" RENAME TO "Account";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "Card_accountId_last4_key" ON "Card"("accountId", "last4");
