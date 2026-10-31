-- Own IBANs on accounts (transfers between own accounts are recognised by them),
-- pending card payments, and the Viva Wallet statement preset.
ALTER TABLE "Account" ADD COLUMN "iban" TEXT;
CREATE UNIQUE INDEX "Account_iban_key" ON "Account"("iban");

ALTER TABLE "Transaction" ADD COLUMN "pending" BOOLEAN NOT NULL DEFAULT false;

UPDATE "Institution" SET "statementPreset" = 'viva' WHERE "id" = 'inst_viva' AND "statementPreset" IS NULL;
