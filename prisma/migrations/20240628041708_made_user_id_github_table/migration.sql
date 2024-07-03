/*
  Warnings:

  - You are about to drop the column `user_token` on the `Github` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[user_github_id]` on the table `Github` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `user_github_id` to the `Github` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "Github_user_token_key";

-- AlterTable
ALTER TABLE "Github" DROP COLUMN "user_token",
ADD COLUMN     "user_github_id" INTEGER NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Github_user_github_id_key" ON "Github"("user_github_id");
