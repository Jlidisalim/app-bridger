-- CreateIndex
-- Enforces ID-card uniqueness at the database level so two accounts cannot
-- register with the same idDocumentNumber. NULLs remain permitted (Postgres
-- allows multiple NULLs in a unique index by default).
CREATE UNIQUE INDEX "User_idDocumentNumber_key" ON "User"("idDocumentNumber");
