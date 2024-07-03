/*
  Warnings:

  - A unique constraint covering the columns `[expires_in]` on the table `Github` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[refresh_token_expires_in]` on the table `Github` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `expires_in` to the `Github` table without a default value. This is not possible if the table is not empty.
  - Added the required column `refresh_token_expires_in` to the `Github` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Github" ADD COLUMN     "expires_in" INTEGER NOT NULL,
ADD COLUMN     "refresh_token_expires_in" INTEGER NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Github_expires_in_key" ON "Github"("expires_in");

-- CreateIndex
CREATE UNIQUE INDEX "Github_refresh_token_expires_in_key" ON "Github"("refresh_token_expires_in");
