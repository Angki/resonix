-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'admin',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "lastLoginAt" DATETIME
);

-- CreateTable
CREATE TABLE "LibraryRoot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "isReadOnly" BOOLEAN NOT NULL DEFAULT true,
    "lastScannedAt" DATETIME,
    "trackCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Artist" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "bio" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Album" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "normalizedTitle" TEXT NOT NULL,
    "artistId" TEXT,
    "year" INTEGER,
    "totalTracks" INTEGER,
    "totalDiscs" INTEGER,
    "artworkId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Album_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "Artist" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Album_artworkId_fkey" FOREIGN KEY ("artworkId") REFERENCES "Artwork" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Track" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "rootId" TEXT NOT NULL,
    "fullPath" TEXT NOT NULL,
    "relativePath" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "extension" TEXT NOT NULL,
    "fileSize" BIGINT NOT NULL,
    "mtimeMs" BIGINT NOT NULL,
    "title" TEXT NOT NULL,
    "trackNumber" INTEGER,
    "discNumber" INTEGER,
    "duration" REAL NOT NULL DEFAULT 0,
    "year" INTEGER,
    "genre" TEXT,
    "composer" TEXT,
    "comment" TEXT,
    "codec" TEXT,
    "bitrate" INTEGER,
    "sampleRate" INTEGER,
    "bitDepth" INTEGER,
    "channels" INTEGER,
    "isLossless" BOOLEAN NOT NULL DEFAULT false,
    "isUnavailable" BOOLEAN NOT NULL DEFAULT false,
    "artistId" TEXT,
    "artistName" TEXT NOT NULL DEFAULT 'Unknown Artist',
    "albumId" TEXT,
    "albumTitle" TEXT NOT NULL DEFAULT 'Unknown Album',
    "albumArtist" TEXT,
    "artworkId" TEXT,
    "importedPlayCount" INTEGER NOT NULL DEFAULT 0,
    "importedSkipCount" INTEGER NOT NULL DEFAULT 0,
    "importedLastPlayed" DATETIME,
    "importedDateAdded" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Track_rootId_fkey" FOREIGN KEY ("rootId") REFERENCES "LibraryRoot" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Track_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "Artist" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Track_albumId_fkey" FOREIGN KEY ("albumId") REFERENCES "Album" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Track_artworkId_fkey" FOREIGN KEY ("artworkId") REFERENCES "Artwork" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Artwork" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "hash" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL DEFAULT 'image/jpeg',
    "filePath" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Playlist" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isSmart" BOOLEAN NOT NULL DEFAULT false,
    "smartRules" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Playlist_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PlaylistTrack" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "playlistId" TEXT NOT NULL,
    "trackId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "addedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PlaylistTrack_playlistId_fkey" FOREIGN KEY ("playlistId") REFERENCES "Playlist" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PlaylistTrack_trackId_fkey" FOREIGN KEY ("trackId") REFERENCES "Track" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "UserTrackStats" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "trackId" TEXT NOT NULL,
    "rating" INTEGER,
    "isFavorite" BOOLEAN NOT NULL DEFAULT false,
    "playCount" INTEGER NOT NULL DEFAULT 0,
    "skipCount" INTEGER NOT NULL DEFAULT 0,
    "totalListeningTime" REAL NOT NULL DEFAULT 0,
    "lastPlayedAt" DATETIME,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "UserTrackStats_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "UserTrackStats_trackId_fkey" FOREIGN KEY ("trackId") REFERENCES "Track" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PlaybackSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "trackId" TEXT NOT NULL,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" DATETIME,
    "listenedSeconds" REAL NOT NULL DEFAULT 0,
    "isCompleted" BOOLEAN NOT NULL DEFAULT false,
    "clientInfo" TEXT,
    CONSTRAINT "PlaybackSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PlaybackSession_trackId_fkey" FOREIGN KEY ("trackId") REFERENCES "Track" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PlaybackEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "eventId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "trackId" TEXT NOT NULL,
    "sessionId" TEXT,
    "listenedSeconds" REAL NOT NULL,
    "thresholdReached" BOOLEAN NOT NULL DEFAULT false,
    "eventType" TEXT NOT NULL,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PlaybackEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PlaybackEvent_trackId_fkey" FOREIGN KEY ("trackId") REFERENCES "Track" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PlaybackEvent_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "PlaybackSession" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MusicBeeImport" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "libraryPath" TEXT NOT NULL,
    "sourceFile" TEXT NOT NULL,
    "tracksProcessed" INTEGER NOT NULL DEFAULT 0,
    "tracksMatched" INTEGER NOT NULL DEFAULT 0,
    "playlistsImported" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "log" TEXT,
    "importedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ExternalTrackStats" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "trackId" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'musicbee',
    "originalFilePath" TEXT NOT NULL,
    "originalPlayCount" INTEGER NOT NULL DEFAULT 0,
    "originalSkipCount" INTEGER NOT NULL DEFAULT 0,
    "originalRating" INTEGER,
    "originalLastPlayed" DATETIME,
    "metadataJson" TEXT,
    "importedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ExternalTrackStats_trackId_fkey" FOREIGN KEY ("trackId") REFERENCES "Track" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LastFmAccount" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "sessionKeyEncrypted" TEXT NOT NULL,
    "isScrobblingEnabled" BOOLEAN NOT NULL DEFAULT true,
    "compatUsername" TEXT,
    "compatPasswordEncrypted" TEXT,
    "connectedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "LastFmAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ScrobbleJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "trackId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "artist" TEXT NOT NULL,
    "trackTitle" TEXT NOT NULL,
    "albumTitle" TEXT,
    "timestamp" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "nextRetryAt" DATETIME,
    "errorMessage" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ScrobbleJob_trackId_fkey" FOREIGN KEY ("trackId") REFERENCES "Track" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Setting" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "description" TEXT,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "LibraryRoot_path_key" ON "LibraryRoot"("path");

-- CreateIndex
CREATE UNIQUE INDEX "Artist_name_key" ON "Artist"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Album_title_artistId_year_key" ON "Album"("title", "artistId", "year");

-- CreateIndex
CREATE UNIQUE INDEX "Track_fullPath_key" ON "Track"("fullPath");

-- CreateIndex
CREATE INDEX "Track_artistName_idx" ON "Track"("artistName");

-- CreateIndex
CREATE INDEX "Track_albumTitle_idx" ON "Track"("albumTitle");

-- CreateIndex
CREATE INDEX "Track_genre_idx" ON "Track"("genre");

-- CreateIndex
CREATE INDEX "Track_year_idx" ON "Track"("year");

-- CreateIndex
CREATE INDEX "Track_rootId_idx" ON "Track"("rootId");

-- CreateIndex
CREATE UNIQUE INDEX "Artwork_hash_key" ON "Artwork"("hash");

-- CreateIndex
CREATE INDEX "PlaylistTrack_playlistId_sortOrder_idx" ON "PlaylistTrack"("playlistId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "PlaylistTrack_playlistId_trackId_sortOrder_key" ON "PlaylistTrack"("playlistId", "trackId", "sortOrder");

-- CreateIndex
CREATE INDEX "UserTrackStats_userId_isFavorite_idx" ON "UserTrackStats"("userId", "isFavorite");

-- CreateIndex
CREATE INDEX "UserTrackStats_userId_playCount_idx" ON "UserTrackStats"("userId", "playCount");

-- CreateIndex
CREATE INDEX "UserTrackStats_userId_lastPlayedAt_idx" ON "UserTrackStats"("userId", "lastPlayedAt");

-- CreateIndex
CREATE UNIQUE INDEX "UserTrackStats_userId_trackId_key" ON "UserTrackStats"("userId", "trackId");

-- CreateIndex
CREATE INDEX "PlaybackSession_userId_startedAt_idx" ON "PlaybackSession"("userId", "startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PlaybackEvent_eventId_key" ON "PlaybackEvent"("eventId");

-- CreateIndex
CREATE INDEX "PlaybackEvent_userId_trackId_eventType_idx" ON "PlaybackEvent"("userId", "trackId", "eventType");

-- CreateIndex
CREATE UNIQUE INDEX "ExternalTrackStats_trackId_source_key" ON "ExternalTrackStats"("trackId", "source");

-- CreateIndex
CREATE UNIQUE INDEX "LastFmAccount_userId_key" ON "LastFmAccount"("userId");

-- CreateIndex
CREATE INDEX "ScrobbleJob_status_nextRetryAt_idx" ON "ScrobbleJob"("status", "nextRetryAt");

-- CreateIndex
CREATE INDEX "ScrobbleJob_userId_trackId_timestamp_idx" ON "ScrobbleJob"("userId", "trackId", "timestamp");

-- CreateIndex
CREATE UNIQUE INDEX "Setting_key_key" ON "Setting"("key");

