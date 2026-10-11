const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

(async () => {
  const tracks = await p.track.findMany({
    where: {
      OR: [
        { artistName: { contains: 'Nansarunai' } },
        { folderArtist: { contains: 'Nansarunai' } },
      ],
    },
    select: {
      title: true,
      artistName: true,
      albumTitle: true,
      folderArtist: true,
      folderAlbum: true,
      year: true,
    },
  });

  console.log(`Found ${tracks.length} Nansarunai tracks in DB:`);
  console.log(tracks.slice(0, 5));
  await p.$disconnect();
})().catch(console.error);
