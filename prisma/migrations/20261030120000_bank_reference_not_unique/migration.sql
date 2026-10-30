-- A bank reference is not unique alone: Alpha gives credit interest and the tax on it one reference.
-- Import dedupe now keys on reference + amount, so the unique index becomes a plain one.
DROP INDEX "Transaction_accountId_bankReference_key";

CREATE INDEX "Transaction_accountId_bankReference_idx" ON "Transaction"("accountId", "bankReference");
