/*
  Warnings:

  - A unique constraint covering the columns `[user_token]` on the table `Github` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `user_token` to the `Github` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Github" ADD COLUMN     "user_token" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Github_user_token_key" ON "Github"("user_token");
