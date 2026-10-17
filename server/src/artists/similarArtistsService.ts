import { prisma } from '../db.js';
import { getLastFmCredentials } from '../lastfm/api.js';

export interface SimilarArtist {
  name: string;
  matchScore: number; // 0 - 100
  imageUrl?: string;
  inLibrary: boolean;
  libraryArtistId?: string;
  trackCount?: number;
  albumCount?: number;
}

export class SimilarArtistsService {
  /**
   * Fetch similar artists for a given artist ID.
   * Uses local cache first, then Last.fm API, and matches against local library.
   */
  async getSimilarArtists(artistId: string, forceRefetch = false): Promise<SimilarArtist[]> {
    const artist = await prisma.artist.findUnique({
      where: { id: artistId },
    });

    if (!artist) {
      throw new Error(`Artist with ID '${artistId}' not found`);
    }

    // 1. Return cached if present and not force-refetching
    if (!forceRefetch && artist.similarArtists) {
      try {
        const cached = JSON.parse(artist.similarArtists) as SimilarArtist[];
        if (Array.isArray(cached) && cached.length > 0) {
          // Re-verify inLibrary status quickly to ensure accuracy if user added new tracks
          return await this.refreshLibraryStatus(cached);
        }
      } catch {
        // Corrupt cache, refetch
      }
    }

    // 2. Fetch from Last.fm
    const rawSimilar = await this.fetchFromLastFm(artist.name);
    if (!rawSimilar || rawSimilar.length === 0) {
      return [];
    }

    // 3. Cross-match against local library
    const enriched = await this.enrichWithLibraryData(rawSimilar);

    // 4. Save to database cache
    try {
      await prisma.artist.update({
        where: { id: artistId },
        data: {
          similarArtists: JSON.stringify(enriched),
        },
      });
    } catch (err) {
      console.warn(`[SimilarArtistsService] Failed to cache similar artists for "${artist.name}":`, err);
    }

    return enriched;
  }

  /**
   * Fast refresh of inLibrary status and counts for cached items
   */
  private async refreshLibraryStatus(items: SimilarArtist[]): Promise<SimilarArtist[]> {
    const names = items.map(i => i.name.toLowerCase());
    const matchedArtists = await prisma.artist.findMany({
      where: {
        normalizedName: { in: names },
      },
      include: {
        _count: {
          select: {
            tracks: { where: { isUnavailable: false } },
            albums: true,
          },
        },
      },
    });

    const artistMap = new Map<string, typeof matchedArtists[0]>();
    for (const a of matchedArtists) {
      artistMap.set(a.normalizedName.toLowerCase(), a);
      artistMap.set(a.name.toLowerCase(), a);
    }

    return items.map(item => {
      const match = artistMap.get(item.name.toLowerCase());
      if (match && match._count.tracks > 0) {
        return {
          ...item,
          inLibrary: true,
          libraryArtistId: match.id,
          trackCount: match._count.tracks,
          albumCount: match._count.albums,
        };
      }
      return {
        ...item,
        inLibrary: false,
        libraryArtistId: undefined,
        trackCount: undefined,
        albumCount: undefined,
      };
    });
  }

  /**
   * Fetch similar artists using Last.fm API
   */
  private async fetchFromLastFm(artistName: string): Promise<Array<{ name: string; matchScore: number; imageUrl?: string }>> {
    const { apiKey } = await getLastFmCredentials();
    if (!apiKey) {
      console.warn('[SimilarArtistsService] No Last.fm API key configured');
      return [];
    }

    const url = `https://ws.audioscrobbler.com/2.0/?method=artist.getsimilar&artist=${encodeURIComponent(
      artistName.trim()
    )}&api_key=${apiKey}&format=json&limit=25`;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);

      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (!res.ok) {
        console.warn(`[SimilarArtistsService] Last.fm returned ${res.status} for "${artistName}"`);
        return [];
      }

      const data = (await res.json()) as any;
      const list = data?.similarartists?.artist;
      if (!Array.isArray(list)) return [];

      return list.map((a: any) => {
        const matchVal = parseFloat(a.match || '0');
        const matchScore = Math.min(100, Math.round(matchVal * 100));
        
        // Find largest image available
        let imageUrl: string | undefined;
        if (Array.isArray(a.image)) {
          const large = a.image.find((img: any) => img.size === 'large' || img.size === 'extralarge');
          if (large && large['#text']) imageUrl = large['#text'];
        }

        return {
          name: String(a.name || '').trim(),
          matchScore,
          imageUrl,
        };
      }).filter(a => a.name.length > 0);
    } catch (err: any) {
      console.error(`[SimilarArtistsService] Error querying Last.fm for "${artistName}":`, err.message);
      return [];
    }
  }

  /**
   * Enrich raw similar artist items with local library matches
   */
  private async enrichWithLibraryData(
    items: Array<{ name: string; matchScore: number; imageUrl?: string }>
  ): Promise<SimilarArtist[]> {
    const names = items.map(i => i.name.toLowerCase());

    const matchedArtists = await prisma.artist.findMany({
      where: {
        OR: [
          { normalizedName: { in: names } },
          { name: { in: items.map(i => i.name) } },
        ],
      },
      include: {
        _count: {
          select: {
            tracks: { where: { isUnavailable: false } },
            albums: true,
          },
        },
      },
    });

    const artistMap = new Map<string, typeof matchedArtists[0]>();
    for (const a of matchedArtists) {
      artistMap.set(a.normalizedName.toLowerCase(), a);
      artistMap.set(a.name.toLowerCase(), a);
    }

    return items.map(item => {
      const match = artistMap.get(item.name.toLowerCase());
      if (match && match._count.tracks > 0) {
        return {
          ...item,
          inLibrary: true,
          libraryArtistId: match.id,
          trackCount: match._count.tracks,
          albumCount: match._count.albums,
        };
      }
      return {
        ...item,
        inLibrary: false,
      };
    });
  }
}

export const similarArtistsService = new SimilarArtistsService();
