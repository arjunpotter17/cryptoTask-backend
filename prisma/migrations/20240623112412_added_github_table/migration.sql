-- CreateTable
CREATE TABLE "github" (
    "token" TEXT NOT NULL,
    "refresh_token" TEXT NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "github_token_key" ON "github"("token");

-- CreateIndex
CREATE UNIQUE INDEX "github_refresh_token_key" ON "github"("refresh_token");
