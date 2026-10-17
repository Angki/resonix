import fs from 'fs';
import path from 'path';

export interface MetallumArtistResult {
  metallumId: string;
  bandUrl: string;
  name: string;
  country?: string;
  genre?: string;
  logoUrl?: string;
  photoUrl?: string;
}

const METALLUM_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

export class MetallumScraper {
  private lastRequestTime = 0;
  private readonly minDelayMs = 1500; // 1.5s delay to protect against Cloudflare 429

  private async throttle(): Promise<void> {
    const elapsed = Date.now() - this.lastRequestTime;
    if (elapsed < this.minDelayMs) {
      await new Promise(resolve => setTimeout(resolve, this.minDelayMs - elapsed));
    }
    this.lastRequestTime = Date.now();
  }

  async searchBand(artistName: string): Promise<MetallumArtistResult | null> {
    const cleanName = artistName.trim();
    if (!cleanName) return null;

    await this.throttle();

    const searchUrl = `https://www.metal-archives.com/search/ajax-band-search/?field=name&query=${encodeURIComponent(cleanName)}`;

    try {
      const res = await fetch(searchUrl, {
        headers: {
          'User-Agent': METALLUM_USER_AGENT,
          'Accept': 'application/json, text/javascript, */*; q=0.01',
          'Accept-Language': 'en-US,en;q=0.9',
          'Sec-Ch-Ua': '"Not/A)Brand";v="8", "Chromium";v="126", "Google Chrome";v="126"',
          'Sec-Ch-Ua-Mobile': '?0',
          'Sec-Ch-Ua-Platform': '"Windows"',
          'Sec-Fetch-Dest': 'empty',
          'Sec-Fetch-Mode': 'cors',
          'Sec-Fetch-Site': 'same-origin',
          'X-Requested-With': 'XMLHttpRequest',
          'Referer': 'https://www.metal-archives.com/',
        },
      });

      if (!res.ok) {
        console.warn(`[MetallumScraper] Search failed for "${cleanName}": HTTP ${res.status}`);
        return null;
      }

      const data = await res.json() as any;
      const rows = data.aaData || [];
      if (!Array.isArray(rows) || rows.length === 0) {
        return null;
      }

      // Find best match in rows
      // Format of row[0]: '<a href="https://www.metal-archives.com/bands/Butcher_ABC/5766">Butcher ABC</a>'
      let matchedRow: any = null;
      const lower = cleanName.toLowerCase();

      for (const row of rows) {
        const linkHtml = row[0] || '';
        const match = linkHtml.match(/<a[^>]+href="([^"]+)"[^>]*>([^<]+)<\/a>/i);
        if (match) {
          const bandTitle = match[2].trim();
          if (bandTitle.toLowerCase() === lower) {
            matchedRow = { url: match[1], title: bandTitle, country: row[1], genre: row[2] };
            break;
          }
        }
      }

      if (!matchedRow && rows.length > 0) {
        const match = (rows[0][0] || '').match(/<a[^>]+href="([^"]+)"[^>]*>([^<]+)<\/a>/i);
        if (match) {
          matchedRow = { url: match[1], title: match[2].trim(), country: rows[0][1], genre: rows[0][2] };
        }
      }

      if (!matchedRow) return null;

      return await this.fetchBandPage(matchedRow.url, matchedRow.title, matchedRow.country, matchedRow.genre);
    } catch (err) {
      console.error(`[MetallumScraper] Error searching for band "${cleanName}":`, err);
      return null;
    }
  }

  async fetchBandPage(bandUrl: string, name: string, country?: string, genre?: string): Promise<MetallumArtistResult | null> {
    await this.throttle();

    try {
      const res = await fetch(bandUrl, {
        headers: {
          'User-Agent': METALLUM_USER_AGENT,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Referer': 'https://www.metal-archives.com/',
        },
      });

      if (!res.ok) {
        console.warn(`[MetallumScraper] Failed to fetch band page ${bandUrl}: HTTP ${res.status}`);
        return null;
      }

      const html = await res.text();

      // Extract band ID from URL (e.g. "https://www.metal-archives.com/bands/Butcher_ABC/5766" -> "5766")
      const idMatch = bandUrl.match(/\/bands\/[^\/]+\/(\d+)/);
      const metallumId = idMatch ? idMatch[1] : bandUrl;

      // Extract Logo URL: <a id="logo" class="image" href="..."> or <img id="logo" src="...">
      let logoUrl: string | undefined;
      const logoMatch = html.match(/id="logo"[^>]*href="([^"]+)"/i) || html.match(/href="([^"]+)"[^>]*id="logo"/i) || html.match(/id="logo"[^>]*src="([^"]+)"/i);
      if (logoMatch) {
        logoUrl = logoMatch[1];
      }

      // Extract Photo URL: <a id="photo" class="image" href="..."> or <img id="photo" src="...">
      let photoUrl: string | undefined;
      const photoMatch = html.match(/id="photo"[^>]*href="([^"]+)"/i) || html.match(/href="([^"]+)"[^>]*id="photo"/i) || html.match(/id="photo"[^>]*src="([^"]+)"/i);
      if (photoMatch) {
        photoUrl = photoMatch[1];
      }

      return {
        metallumId,
        bandUrl,
        name,
        country,
        genre,
        logoUrl,
        photoUrl,
      };
    } catch (err) {
      console.error(`[MetallumScraper] Error fetching band page ${bandUrl}:`, err);
      return null;
    }
  }

  async downloadImage(imageUrl: string, destPath: string): Promise<boolean> {
    await this.throttle();

    try {
      const res = await fetch(imageUrl, {
        headers: {
          'User-Agent': METALLUM_USER_AGENT,
          'Referer': 'https://www.metal-archives.com/',
        },
      });

      if (!res.ok) {
        console.warn(`[MetallumScraper] Failed to download image ${imageUrl}: HTTP ${res.status}`);
        return false;
      }

      const buffer = await res.arrayBuffer();
      await fs.promises.mkdir(path.dirname(destPath), { recursive: true });
      await fs.promises.writeFile(destPath, Buffer.from(buffer));
      return true;
    } catch (err) {
      console.error(`[MetallumScraper] Error downloading image from ${imageUrl}:`, err);
      return false;
    }
  }
}

export const metallumScraper = new MetallumScraper();
