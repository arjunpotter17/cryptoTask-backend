/*
  Warnings:

  - You are about to drop the `github` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropTable
DROP TABLE "github";

-- CreateTable
CREATE TABLE "Github" (
    "token" TEXT NOT NULL,
    "refresh_token" TEXT NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "Github_token_key" ON "Github"("token");

-- CreateIndex
CREATE UNIQUE INDEX "Github_refresh_token_key" ON "Github"("refresh_token");
