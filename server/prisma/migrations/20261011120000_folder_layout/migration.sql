-- AlterTable
ALTER TABLE "Album" ADD COLUMN "folderKey" TEXT;

-- AlterTable
ALTER TABLE "Track" ADD COLUMN "folderAlbum" TEXT;
ALTER TABLE "Track" ADD COLUMN "folderArtist" TEXT;
ALTER TABLE "Track" ADD COLUMN "folderPath" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Album_folderKey_key" ON "Album"("folderKey");

-- CreateIndex
CREATE INDEX "Track_rootId_folderArtist_folderAlbum_idx" ON "Track"("rootId", "folderArtist", "folderAlbum");
