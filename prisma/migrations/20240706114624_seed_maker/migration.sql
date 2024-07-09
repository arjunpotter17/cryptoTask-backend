/*
  Warnings:

  - You are about to drop the column `expiry` on the `Task` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Task" DROP COLUMN "expiry",
ADD COLUMN     "escrow_seed" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "maker_key" TEXT NOT NULL DEFAULT '';
