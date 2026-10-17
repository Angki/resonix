import { prisma } from '../db.js';
import { cleanTitle, parseVinylOrTrackNumber } from '../library/metadata.js';
import path from 'path';

/**
 * Universal Metadata Cleaner Tool for Black Library
 * Scans tracks in the database and cleans titles (stripping redundant artist/track prefixes,
 * residual audio extensions) while parsing vinyl sides and disc numbers cleanly.
 *
 * Usage:
 *   npx tsx server/src/scripts/clean_metadata.ts [--dry-run]
 */
async function main() {
  const isDryRun = process.argv.includes('--dry-run');
  console.log(`\n======================================================`);
  console.log(`🎵 BLACK LIBRARY - METADATA CLEANER & NORMALIZER`);
  console.log(`⚙️  Mode: ${isDryRun ? 'DRY RUN (Preview Only)' : 'LIVE DATABASE UPDATE'}`);
  console.log(`======================================================\n`);

  const total = await prisma.track.count();
  console.log(`Scanning ${total} tracks in library...`);

  const batchSize = 2000;
  let cursor: string | undefined = undefined;
  let processedCount = 0;
  let modifiedCandidates = 0;
  let actuallyUpdated = 0;

  let titleCleanedCount = 0;
  let discAssignedCount = 0;
  let trackAssignedCount = 0;

  const previewSamples: Array<{
    oldTitle: string;
    newTitle: string;
    oldDisc: number | null;
    newDisc?: number;
    oldTrack: number | null;
    newTrack?: number;
  }> = [];

  const startTime = Date.now();

  while (true) {
    const tracks: Array<{
      id: string;
      title: string;
      artistName: string | null;
      fullPath: string;
      trackNumber: number | null;
      discNumber: number | null;
    }> = await prisma.track.findMany({
      take: batchSize,
      skip: cursor ? 1 : 0,
      cursor: cursor ? { id: cursor } : undefined,
      orderBy: { id: 'asc' },
      select: {
        id: true,
        title: true,
        artistName: true,
        fullPath: true,
        trackNumber: true,
        discNumber: true,
      },
    });

    if (tracks.length === 0) break;
    cursor = tracks[tracks.length - 1].id;
    processedCount += tracks.length;

    const pendingUpdates: Array<{
      id: string;
      title: string;
      discNumber?: number;
      trackNumber?: number;
      oldTitle: string;
      oldDisc: number | null;
      oldTrack: number | null;
    }> = [];

    for (const t of tracks) {
      const filename = path.basename(t.fullPath);
      const cleaned = cleanTitle(t.title, filename, t.artistName || undefined);
      const nums = parseVinylOrTrackNumber(filename);

      const needsTitle = Boolean(cleaned && cleaned !== t.title && cleaned.trim().length > 0);
      const needsDisc = Boolean(nums.discNumber && t.discNumber !== nums.discNumber);
      const needsTrack = Boolean(nums.trackNumber && (!t.trackNumber || t.trackNumber <= 0));

      if (needsTitle || needsDisc || needsTrack) {
        if (needsTitle) titleCleanedCount++;
        if (needsDisc) discAssignedCount++;
        if (needsTrack) trackAssignedCount++;

        const finalTitle = needsTitle ? cleaned : t.title;

        pendingUpdates.push({
          id: t.id,
          title: finalTitle,
          discNumber: nums.discNumber ?? t.discNumber ?? undefined,
          trackNumber: nums.trackNumber ?? t.trackNumber ?? undefined,
          oldTitle: t.title,
          oldDisc: t.discNumber,
          oldTrack: t.trackNumber,
        });

        if (previewSamples.length < 25) {
          previewSamples.push({
            oldTitle: t.title,
            newTitle: finalTitle,
            oldDisc: t.discNumber,
            newDisc: nums.discNumber ?? t.discNumber ?? undefined,
            oldTrack: t.trackNumber,
            newTrack: nums.trackNumber ?? t.trackNumber ?? undefined,
          });
        }
      }
    }

    if (pendingUpdates.length > 0) {
      modifiedCandidates += pendingUpdates.length;

      if (!isDryRun) {
        // Chunk into safe sub-transactions of 50 to prevent SQLite lock contention
        const chunkSize = 50;
        for (let i = 0; i < pendingUpdates.length; i += chunkSize) {
          const chunk = pendingUpdates.slice(i, i + chunkSize);
          await prisma.$transaction(
            chunk.map((item) =>
              prisma.track.update({
                where: { id: item.id },
                data: {
                  title: item.title,
                  discNumber: item.discNumber,
                  trackNumber: item.trackNumber,
                },
              })
            )
          );
          actuallyUpdated += chunk.length;
        }
      }
    }

    if (processedCount % 10000 === 0 || processedCount >= total) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`Processed ${processedCount}/${total} tracks in ${elapsed}s... (${modifiedCandidates} cleanups detected)`);
    }
  }

  const totalDuration = ((Date.now() - startTime) / 1000).toFixed(2);

  console.log(`\n======================================================`);
  if (isDryRun) {
    console.log(`🔎 Dry Run Finished in ${totalDuration}s`);
    console.log(`📊 Statistics:`);
    console.log(`   - Total Tracks Scanned: ${processedCount}`);
    console.log(`   - Candidates to Clean:  ${modifiedCandidates}`);
    console.log(`   - Titles to Normalize:  ${titleCleanedCount}`);
    console.log(`   - Discs to Assign:      ${discAssignedCount}`);
    console.log(`   - Tracks to Assign:     ${trackAssignedCount}`);

    if (previewSamples.length > 0) {
      console.log(`\n📋 Sample Changes Preview (First ${previewSamples.length}):`);
      for (const s of previewSamples) {
        const titleChange = s.oldTitle !== s.newTitle ? `Title: "${s.oldTitle}" -> "${s.newTitle}"` : `Title: "${s.newTitle}" (unchanged)`;
        const discChange = s.oldDisc !== s.newDisc ? ` | Disc: ${s.oldDisc ?? 'null'} -> ${s.newDisc}` : '';
        const trackChange = s.oldTrack !== s.newTrack ? ` | Trk: ${s.oldTrack ?? 'null'} -> ${s.newTrack}` : '';
        console.log(`  • ${titleChange}${discChange}${trackChange}`);
      }
    }
    console.log(`\n💡 Run "npm run db:clean-metadata" to apply these changes to the database.`);
  } else {
    console.log(`✅ Cleanup Complete in ${totalDuration}s:`);
    console.log(`   - Total Updated Records: ${actuallyUpdated}`);
    console.log(`   - Titles Normalized:     ${titleCleanedCount}`);
    console.log(`   - Discs Assigned:        ${discAssignedCount}`);
    console.log(`   - Tracks Assigned:       ${trackAssignedCount}`);
  }
  console.log(`======================================================\n`);
}

main().catch(console.error).finally(() => process.exit(0));
