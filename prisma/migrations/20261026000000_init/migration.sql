-- CreateTable
CREATE TABLE "AppSettings" (
    "id" INTEGER NOT NULL PRIMARY KEY,
    "language" TEXT NOT NULL DEFAULT 'el',
    "dateFormat" TEXT NOT NULL DEFAULT 'dd/MM/yyyy',
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
