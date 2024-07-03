/*
  Warnings:

  - Added the required column `issueId` to the `Task` table without a default value. This is not possible if the table is not empty.
  - Added the required column `repo` to the `Task` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "issueId" INTEGER NOT NULL,
ADD COLUMN     "repo" TEXT NOT NULL;
