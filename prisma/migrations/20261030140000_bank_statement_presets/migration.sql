-- Statement presets for the starter banks whose exports the app now reads (by id, so a renamed bank keeps it).
-- NBG has none yet: its files still go through the column mapping step.
UPDATE "Institution" SET "statementPreset" = 'piraeus' WHERE "id" = 'inst_piraeus' AND "statementPreset" IS NULL;
UPDATE "Institution" SET "statementPreset" = 'revolut' WHERE "id" = 'inst_revolut' AND "statementPreset" IS NULL;
