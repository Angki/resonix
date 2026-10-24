import { parseFile } from 'music-metadata';
import pLimit from 'p-limit';
import { prisma } from '../db.js';
import { parseReplayGain } from '../library/metadata.js';

interface Options {
  dryRun: boolean;
  force: boolean;
  limit: number | null;
  concurrency: number;
}

function parseArgs(argv: string[]): Options {
  const options: Options = { dryRun: false, force: false, limit: null, concurrency: 4 };

  for (const arg of argv) {
    if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--force') options.force = true;
    else if (arg.startsWith('--limit=')) options.limit = Math.max(1, parseInt(arg.slice(8), 10) || 1);
    else if (arg.startsWith('--concurrency=')) {
      options.concurrency = Math.min(16, Math.max(1, parseInt(arg.slice(14), 10) || 4));
    }
  }

  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  const where = options.force
    ? {}
    : {
        replayGainTrackGain: null,
        replayGainAlbumGain: null,
        replayGainTrackPeak: null,
      };

  const total = await prisma.track.count({ where });
  const scanCount = options.limit ? Math.min(total, options.limit) : total;

  console.log(
    `[ReplayGain] Scanning ${scanCount} of ${total} matching tracks ` +
      `(concurrency=${options.concurrency}${options.dryRun ? ', dry-run' : ''}${options.force ? ', force' : ''})`
  );

  let processed = 0;
  let tagged = 0;
  let updated = 0;
  let failed = 0;

  const limit = pLimit(options.concurrency);

  const runBatch = async (tracks: Array<{ id: string; fullPath: string; title: string }>) => {
    await Promise.all(
      tracks.map((track) =>
        limit(async () => {
          try {
            const metadata = await parseFile(track.fullPath, { duration: false, skipCovers: true });
            const gain = parseReplayGain(metadata.common as unknown as Record<string, any>);

            if (gain.trackGain !== undefined || gain.albumGain !== undefined || gain.trackPeak !== undefined) {
              tagged += 1;
              if (!options.dryRun) {
                await prisma.track.update({
                  where: { id: track.id },
                  data: {
                    ...(gain.trackGain !== undefined ? { replayGainTrackGain: gain.trackGain } : {}),
                    ...(gain.albumGain !== undefined ? { replayGainAlbumGain: gain.albumGain } : {}),
                    ...(gain.trackPeak !== undefined ? { replayGainTrackPeak: gain.trackPeak } : {}),
                  },
                });
                updated += 1;
              }
            }
          } catch (error: any) {
            failed += 1;
            if (failed <= 10) {
              console.warn(`[ReplayGain] Failed to read "${track.fullPath}": ${error?.message || error}`);
            }
          } finally {
            processed += 1;
            if (processed % 500 === 0) {
              console.log(`[ReplayGain] ${processed}/${scanCount} processed, ${tagged} tagged, ${updated} updated`);
            }
          }
        })
      )
    );
  };

  const BATCH_SIZE = 200;
  let offset = 0;

  while (offset < scanCount) {
    const take = Math.min(BATCH_SIZE, scanCount - offset);
    const tracks = await prisma.track.findMany({
      where,
      select: { id: true, fullPath: true, title: true },
      orderBy: { fullPath: 'asc' },
      skip: offset,
      take,
    });

    if (tracks.length === 0) break;
    await runBatch(tracks);
    offset += tracks.length;
  }

  console.log(
    `[ReplayGain] Done. processed=${processed} tagged=${tagged} updated=${updated} failed=${failed}` +
      `${options.dryRun ? ' (dry-run, no database changes)' : ''}`
  );
}

main()
  .catch((error) => {
    console.error('[ReplayGain] Backfill failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
