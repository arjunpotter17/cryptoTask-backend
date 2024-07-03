/*
  Warnings:

  - Changed the type of `expires_in` on the `Github` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `refresh_token_expires_in` on the `Github` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- DropIndex
DROP INDEX "Github_expires_in_key";

-- DropIndex
DROP INDEX "Github_refresh_token_expires_in_key";

-- AlterTable
ALTER TABLE "Github" DROP COLUMN "expires_in",
ADD COLUMN     "expires_in" TIMESTAMP(3) NOT NULL,
DROP COLUMN "refresh_token_expires_in",
ADD COLUMN     "refresh_token_expires_in" TIMESTAMP(3) NOT NULL;
