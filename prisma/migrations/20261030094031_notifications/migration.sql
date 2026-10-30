-- AlterTable
ALTER TABLE "RecurringRule" ADD COLUMN "remindDays" INTEGER;

-- CreateTable
CREATE TABLE "NotificationState" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "readAt" DATETIME,
    "dismissedAt" DATETIME,
    "toastedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_AppSettings" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "language" TEXT NOT NULL DEFAULT 'el',
    "dateFormat" TEXT NOT NULL DEFAULT 'dd/MM/yyyy',
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "notifyLeadDays" INTEGER NOT NULL DEFAULT 3,
    "notifyToasts" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_AppSettings" ("createdAt", "currency", "dateFormat", "id", "language", "updatedAt") SELECT "createdAt", "currency", "dateFormat", "id", "language", "updatedAt" FROM "AppSettings";
DROP TABLE "AppSettings";
ALTER TABLE "new_AppSettings" RENAME TO "AppSettings";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
