-- Calendars: first day of the week (1 = Monday, 0 = Sunday)
ALTER TABLE "AppSettings" ADD COLUMN "weekStartsOn" INTEGER NOT NULL DEFAULT 1;
