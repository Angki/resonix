import fs from 'fs';
import path from 'path';
import { config } from '../config.js';

export interface DiscogsArtistResult {
  discogsId: number;
  name: string;
  bio?: string;
  photoUrl?: string;
}

const USER_AGENT = 'BlackLibrary/1.0 (+https://github.com/blacklibrary)';

export class DiscogsClient {
  private key: string;
  private secret: string;

  constructor(key?: string, secret?: string) {
    this.key = key || config.DISCOGS_CONSUMER_KEY || '';
    this.secret = secret || config.DISCOGS_CONSUMER_SECRET || '';
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'User-Agent': USER_AGENT,
      'Accept': 'application/json',
    };
    if (this.key && this.secret) {
      headers['Authorization'] = `Discogs key=${this.key}, secret=${this.secret}`;
    }
    return headers;
  }

  async searchArtist(artistName: string): Promise<DiscogsArtistResult | null> {
    if (!this.key || !this.secret) {
      console.warn('[DiscogsClient] No Consumer Key/Secret configured');
      return null;
    }

    const cleanName = artistName.trim();
    if (!cleanName) return null;

    const url = `https://api.discogs.com/database/search?q=${encodeURIComponent(cleanName)}&type=artist&per_page=5`;

    try {
      const res = await fetch(url, {
        headers: this.getHeaders(),
      });

      if (!res.ok) {
        console.warn(`[DiscogsClient] Search failed for "${cleanName}": HTTP ${res.status}`);
        return null;
      }

      const data = await res.json() as any;
      const results = data.results || [];
      if (results.length === 0) return null;

      // Pick exact or best match
      const lower = cleanName.toLowerCase();
      let bestMatch = results.find((r: any) => r.title?.toLowerCase() === lower);
      if (!bestMatch) {
        bestMatch = results[0];
      }

      const discogsId = Number(bestMatch.id);
      if (!discogsId) return null;

      // Fetch detailed artist info for bio and high-res primary image
      return await this.getArtistDetails(discogsId, bestMatch.cover_image);
    } catch (err) {
      console.error(`[DiscogsClient] Error searching artist "${cleanName}":`, err);
      return null;
    }
  }

  async getArtistDetails(discogsId: number, fallbackPhotoUrl?: string): Promise<DiscogsArtistResult | null> {
    const url = `https://api.discogs.com/artists/${discogsId}`;

    try {
      const res = await fetch(url, {
        headers: this.getHeaders(),
      });

      if (!res.ok) {
        console.warn(`[DiscogsClient] Details failed for ID ${discogsId}: HTTP ${res.status}`);
        return {
          discogsId,
          name: '',
          photoUrl: fallbackPhotoUrl,
        };
      }

      const data = await res.json() as any;
      let photoUrl = fallbackPhotoUrl;

      if (Array.isArray(data.images) && data.images.length > 0) {
        const primary = data.images.find((img: any) => img.type === 'primary');
        photoUrl = primary?.resource_url || primary?.uri || data.images[0].resource_url || data.images[0].uri || fallbackPhotoUrl;
      }

      return {
        discogsId,
        name: data.name || '',
        bio: data.profile || undefined,
        photoUrl,
      };
    } catch (err) {
      console.error(`[DiscogsClient] Error fetching details for ID ${discogsId}:`, err);
      return {
        discogsId,
        name: '',
        photoUrl: fallbackPhotoUrl,
      };
    }
  }

  async downloadImage(imageUrl: string, destPath: string): Promise<boolean> {
    try {
      const res = await fetch(imageUrl, {
        headers: {
          'User-Agent': USER_AGENT,
        },
      });

      if (!res.ok) {
        console.warn(`[DiscogsClient] Failed to download image from ${imageUrl}: HTTP ${res.status}`);
        return false;
      }

      const buffer = await res.arrayBuffer();
      await fs.promises.mkdir(path.dirname(destPath), { recursive: true });
      await fs.promises.writeFile(destPath, Buffer.from(buffer));
      return true;
    } catch (err) {
      console.error(`[DiscogsClient] Error downloading image from ${imageUrl}:`, err);
      return false;
    }
  }
}

export const discogsClient = new DiscogsClient();
