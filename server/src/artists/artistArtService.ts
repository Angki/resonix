import path from 'path';
import fs from 'fs';
import { prisma } from '../db.js';
import { config } from '../config.js';
import { findLocalArtistArt } from './localArtFinder.js';
import { metallumScraper } from './metallumScraper.js';
import { discogsClient } from './discogsClient.js';

export interface ArtistArtFetchResult {
  artistId: string;
  name: string;
  photoPath?: string | null;
  logoPath?: string | null;
  source: 'local' | 'metallum' | 'discogs' | 'none';
  bio?: string | null;
}

export interface BatchArtStatus {
  isRunning: boolean;
  totalArtists: number;
  processedArtists: number;
  artistsWithPhoto: number;
  artistsWithLogo: number;
  currentArtistName?: string;
  lastError?: string;
}

class ArtistArtService {
  private isBatchRunning = false;
  private batchAbortRequested = false;
  private currentArtistName: string | undefined;
  private lastError: string | undefined;

  async fetchArtistArt(artistId: string, force = false): Promise<ArtistArtFetchResult> {
    const artist = await prisma.artist.findUnique({
      where: { id: artistId },
    });

    if (!artist) {
      throw new Error(`Artist not found: ${artistId}`);
    }

    // Skip if already fetched recently unless forced
    if (!force && artist.artFetchedAt && (artist.photoPath || artist.logoPath)) {
      return {
        artistId: artist.id,
        name: artist.name,
        photoPath: artist.photoPath,
        logoPath: artist.logoPath,
        bio: artist.bio,
        source: 'local',
      };
    }

    const artistDir = config.artistArtDir;
    const destPhotoPath = path.join(artistDir, `${artist.id}_photo.jpg`);
    const destLogoPath = path.join(artistDir, `${artist.id}_logo.png`);

    let finalPhotoPath: string | null = artist.photoPath || null;
    let finalLogoPath: string | null = artist.logoPath || null;
    let finalBio: string | null = artist.bio || null;
    let discogsId: number | null = artist.discogsId || null;
    let metallumId: string | null = artist.metallumId || null;
    let primarySource: 'local' | 'metallum' | 'discogs' | 'none' = 'none';

    // 1. Check Local Disk (Audio folders & MusicBee cache)
    try {
      const local = await findLocalArtistArt(artist.id, artist.name);
      if (local.photoPath && (!finalPhotoPath || force)) {
        await fs.promises.copyFile(local.photoPath, destPhotoPath);
        finalPhotoPath = destPhotoPath;
        primarySource = 'local';
      }
      if (local.logoPath && (!finalLogoPath || force)) {
        await fs.promises.copyFile(local.logoPath, destLogoPath);
        finalLogoPath = destLogoPath;
        primarySource = 'local';
      }
    } catch (err) {
      console.warn(`[ArtistArtService] Local check failed for "${artist.name}":`, err);
    }

    // 2. Query Encyclopaedia Metallum (Excellent for Metal / Grind / Black / Death band logos & photos)
    if (!finalLogoPath || !finalPhotoPath) {
      try {
        const metallum = await metallumScraper.searchBand(artist.name);
        if (metallum) {
          metallumId = metallum.metallumId;

          // Download Logo
          if (!finalLogoPath && metallum.logoUrl) {
            const ok = await metallumScraper.downloadImage(metallum.logoUrl, destLogoPath);
            if (ok) {
              finalLogoPath = destLogoPath;
              if (primarySource === 'none') primarySource = 'metallum';
            }
          }

          // Download Photo
          if (!finalPhotoPath && metallum.photoUrl) {
            const ok = await metallumScraper.downloadImage(metallum.photoUrl, destPhotoPath);
            if (ok) {
              finalPhotoPath = destPhotoPath;
              if (primarySource === 'none') primarySource = 'metallum';
            }
          }
        }
      } catch (err) {
        console.warn(`[ArtistArtService] Metallum check failed for "${artist.name}":`, err);
      }
    }

    // 3. Fallback / Universal check via Discogs API
    if (!finalPhotoPath || !finalBio) {
      try {
        const discogs = await discogsClient.searchArtist(artist.name);
        if (discogs) {
          discogsId = discogs.discogsId;
          if (!finalBio && discogs.bio) {
            finalBio = discogs.bio;
          }

          if (!finalPhotoPath && discogs.photoUrl) {
            const ok = await discogsClient.downloadImage(discogs.photoUrl, destPhotoPath);
            if (ok) {
              finalPhotoPath = destPhotoPath;
              if (primarySource === 'none') primarySource = 'discogs';
            }
          }
        }
      } catch (err) {
        console.warn(`[ArtistArtService] Discogs check failed for "${artist.name}":`, err);
      }
    }

    // 4. Update Database
    await prisma.artist.update({
      where: { id: artist.id },
      data: {
        photoPath: finalPhotoPath,
        logoPath: finalLogoPath,
        bio: finalBio,
        discogsId,
        metallumId,
        artFetchedAt: new Date(),
      },
    });

    return {
      artistId: artist.id,
      name: artist.name,
      photoPath: finalPhotoPath,
      logoPath: finalLogoPath,
      bio: finalBio,
      source: primarySource,
    };
  }

  async getBatchStatus(): Promise<BatchArtStatus> {
    const totalArtists = await prisma.artist.count();
    const processedArtists = await prisma.artist.count({
      where: { artFetchedAt: { not: null } },
    });
    const artistsWithPhoto = await prisma.artist.count({
      where: { photoPath: { not: null } },
    });
    const artistsWithLogo = await prisma.artist.count({
      where: { logoPath: { not: null } },
    });

    return {
      isRunning: this.isBatchRunning,
      totalArtists,
      processedArtists,
      artistsWithPhoto,
      artistsWithLogo,
      currentArtistName: this.currentArtistName,
      lastError: this.lastError,
    };
  }

  async startBatchFetch(force = false): Promise<void> {
    if (this.isBatchRunning) return;

    this.isBatchRunning = true;
    this.batchAbortRequested = false;
    this.lastError = undefined;

    // Run asynchronously in background
    (async () => {
      try {
        const whereClause = force ? {} : { artFetchedAt: null };
        const artists = await prisma.artist.findMany({
          where: whereClause,
          select: { id: true, name: true },
          orderBy: { name: 'asc' },
        });

        console.log(`[ArtistArtService] Starting batch artwork fetch for ${artists.length} artists...`);

        for (const artist of artists) {
          if (this.batchAbortRequested) {
            console.log('[ArtistArtService] Batch artwork fetch paused by user.');
            break;
          }

          this.currentArtistName = artist.name;
          try {
            await this.fetchArtistArt(artist.id, force);
          } catch (err: any) {
            console.warn(`[ArtistArtService] Error processing "${artist.name}":`, err);
            this.lastError = err?.message || String(err);
          }

          // Gentle delay between artists to respect external rates
          await new Promise(resolve => setTimeout(resolve, 800));
        }
      } catch (err: any) {
        console.error('[ArtistArtService] Fatal batch fetch error:', err);
        this.lastError = err?.message || String(err);
      } finally {
        this.isBatchRunning = false;
        this.currentArtistName = undefined;
        console.log('[ArtistArtService] Batch artwork fetch complete or stopped.');
      }
    })();
  }

  pauseBatchFetch(): void {
    if (this.isBatchRunning) {
      this.batchAbortRequested = true;
    }
  }
}

export const artistArtService = new ArtistArtService();
