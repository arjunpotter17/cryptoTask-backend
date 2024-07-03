/*
  Warnings:

  - A unique constraint covering the columns `[repo,issueId]` on the table `Task` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "Task_repo_issueId_key" ON "Task"("repo", "issueId");
