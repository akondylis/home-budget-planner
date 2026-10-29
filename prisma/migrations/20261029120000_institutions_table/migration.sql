-- Banks become a list the user edits (Settings → Banks) instead of a fixed enum.
-- Hand-written: Prisma's table rewrite would drop Account.institution without carrying it over.

-- CreateTable
CREATE TABLE "Institution" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'BANK',
    "statementPreset" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "archivedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "Institution_name_key" ON "Institution"("name");

-- Starter list: the common Greek banks, then the meal-voucher issuers
INSERT INTO "Institution" ("id", "name", "kind", "statementPreset", "sortOrder", "updatedAt") VALUES
    ('inst_alpha',     'Alpha Bank',          'BANK',           'alpha',    0, CURRENT_TIMESTAMP),
    ('inst_eurobank',  'Eurobank',            'BANK',           'eurobank', 1, CURRENT_TIMESTAMP),
    ('inst_piraeus',   'Piraeus Bank',        'BANK',           NULL,       2, CURRENT_TIMESTAMP),
    ('inst_nbg',       'National Bank (NBG)', 'BANK',           NULL,       3, CURRENT_TIMESTAMP),
    ('inst_revolut',   'Revolut',             'BANK',           NULL,       4, CURRENT_TIMESTAMP),
    ('inst_optima',    'Optima bank',         'BANK',           NULL,       5, CURRENT_TIMESTAMP),
    ('inst_viva',      'Viva Wallet',         'BANK',           NULL,       6, CURRENT_TIMESTAMP),
    ('inst_attica',    'Attica Bank',         'BANK',           NULL,       7, CURRENT_TIMESTAMP),
    ('inst_edenred',   'Edenred',             'VOUCHER_ISSUER', NULL,       8, CURRENT_TIMESTAMP),
    ('inst_up_hellas', 'Up Hellas',           'VOUCHER_ISSUER', NULL,       9, CURRENT_TIMESTAMP);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Account" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "institutionId" TEXT,
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
    CONSTRAINT "Account_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Account_holderMemberId_fkey" FOREIGN KEY ("holderMemberId") REFERENCES "Member" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Account" ("archivedAt", "createdAt", "currency", "holderMemberId", "id", "importMapping", "importProfile", "institutionId", "kind", "name", "openingBalanceCents", "openingDate", "sortOrder", "updatedAt")
SELECT "archivedAt", "createdAt", "currency", "holderMemberId", "id", "importMapping", "importProfile",
    CASE "institution"
        WHEN 'ALPHA' THEN 'inst_alpha'
        WHEN 'EUROBANK' THEN 'inst_eurobank'
        WHEN 'EDENRED' THEN 'inst_edenred'
        WHEN 'UP_HELLAS' THEN 'inst_up_hellas'
        ELSE NULL
    END,
    "kind", "name", "openingBalanceCents", "openingDate", "sortOrder", "updatedAt"
FROM "Account";
DROP TABLE "Account";
ALTER TABLE "new_Account" RENAME TO "Account";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
