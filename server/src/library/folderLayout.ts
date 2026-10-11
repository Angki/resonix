/**
 * Folder layout parser for libraries organised as:
 *
 *   <root>/<Artist>/<[Year] Album>/<NN. Title.ext>
 *   <root>/<Artist>/<[Year] Album>/<CD1|Disc 2|...>/<NN. Title.ext>
 *
 * Folder information is used as a reliable fallback for missing tags and as the
 * stable identity for album grouping (so a split/compilation with varying track
 * artist tags still forms one album). Pure functions only: no filesystem access.
 */

export interface FolderLayout {
  /** First directory below the root (artist folder), if any. */
  artistFolder: string | null;
  /** Second directory below the root (album folder), if any. */
  albumFolder: string | null;
  /** Album title derived from the album folder name (year/brackets stripped). */
  albumTitle: string | null;
  /** Year parsed from the album folder name, e.g. "[2022] Title". */
  year: number | null;
  /** Disc number when the file sits inside a disc subfolder (CD1, Disc 2, ...). */
  discNumber: number | null;
  /** Root-relative directory containing the file, '/' separated ('' when at root). */
  folderPath: string;
}

const DISC_FOLDER_RE = /^(?:cd|disc|disk|dvd)[\s._-]*(\d{1,2})(?:\b.*)?$/i;
const MIN_YEAR = 1900;
const MAX_YEAR = 2100;

function validYear(n: number): number | null {
  return n >= MIN_YEAR && n <= MAX_YEAR ? n : null;
}

/**
 * Parses album folder names. Supported shapes:
 *   "[2022] Title", "(2022) Title", "2022 - Title", "2022. Title",
 *   "Title [2022]", "Title (2022)", "Title - 2022", plain "Title".
 */
export function parseAlbumFolderName(name: string): { title: string; year: number | null } {
  const trimmed = name.trim();

  let m = trimmed.match(/^[[(](\d{4})[\])]\s*[-–.]?\s*(.+)$/);
  if (m) {
    const year = validYear(parseInt(m[1], 10));
    if (year) return { title: m[2].trim(), year };
  }

  m = trimmed.match(/^(\d{4})\s*[-–.]\s*(.+)$/);
  if (m) {
    const year = validYear(parseInt(m[1], 10));
    if (year) return { title: m[2].trim(), year };
  }

  m = trimmed.match(/^(.+?)\s*[[(](\d{4})[\])]$/);
  if (m) {
    const year = validYear(parseInt(m[2], 10));
    if (year) return { title: m[1].trim(), year };
  }

  m = trimmed.match(/^(.+?)\s+[-–]\s+(\d{4})$/);
  if (m) {
    const year = validYear(parseInt(m[2], 10));
    if (year) return { title: m[1].trim(), year };
  }

  return { title: trimmed, year: null };
}

export function parseDiscFolderName(name: string): number | null {
  const m = name.trim().match(DISC_FOLDER_RE);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return n > 0 ? n : null;
}

/**
 * @param relativePath file path relative to the library root, either separator.
 */
export function parseFolderLayout(relativePath: string): FolderLayout {
  const parts = relativePath.split(/[\\/]+/).filter(Boolean);
  const dirs = parts.slice(0, -1); // drop filename
  const folderPath = dirs.join('/');

  if (dirs.length === 0) {
    return { artistFolder: null, albumFolder: null, albumTitle: null, year: null, discNumber: null, folderPath };
  }

  const artistFolder = dirs[0];
  if (dirs.length === 1) {
    // Loose tracks directly inside the artist folder
    return { artistFolder, albumFolder: null, albumTitle: null, year: null, discNumber: null, folderPath };
  }

  const albumFolder = dirs[1];
  const { title, year } = parseAlbumFolderName(albumFolder);

  // Disc subfolder immediately below the album folder (only at depth 3)
  const discNumber = dirs.length === 3 ? parseDiscFolderName(dirs[2]) : null;

  return {
    artistFolder,
    albumFolder,
    albumTitle: title || albumFolder,
    year,
    discNumber,
    folderPath,
  };
}

/** Stable, case-insensitive album identity for a folder-based album. */
export function buildAlbumFolderKey(rootId: string, artistFolder: string, albumFolder: string): string {
  return `${rootId}:${artistFolder}/${albumFolder}`.toLowerCase();
}
