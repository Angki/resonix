// Read-only diagnostic: prints counts of core tables.
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  const users = await p.user.findMany({ select: { id: true, username: true, role: true } });
  console.log('users:', users);
  console.log('tracks', await p.track.count());
  console.log('artists', await p.artist.count());
  console.log('albums', await p.album.count());
  const roots = await p.libraryRoot.findMany();
  for (const r of roots) {
    const n = await p.track.count({ where: { rootId: r.id } });
    console.log('root', r.id, r.name, r.path, 'enabled=', r.isEnabled, 'tracks=', n);
  }
  const sample = await p.track.findMany({ take: 5, select: { title: true, relativePath: true, artistName: true, albumTitle: true } }).catch(e => e.message);
  console.log('sample', JSON.stringify(sample, null, 1));
  await p.$disconnect();
})().catch(e => { console.error(e); process.exit(1); });
