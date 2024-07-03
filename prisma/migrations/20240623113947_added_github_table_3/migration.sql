-- AlterTable
ALTER TABLE "Github" ADD COLUMN     "id" SERIAL NOT NULL,
ADD CONSTRAINT "Github_pkey" PRIMARY KEY ("id");
