import { prisma } from '../db.js';
import { updateNowPlaying, processScrobbleQueue } from '../lastfm/api.js';
import { decryptSecret } from '../crypto.js';

export async function startPlaybackSession(userId: string, trackId: string, clientInfo?: string) {
  const session = await prisma.playbackSession.create({
    data: {
      userId,
      trackId,
      startedAt: new Date(),
      clientInfo: clientInfo || 'Web Player',
    },
    include: {
      track: true,
    },
  });

  // Notify Last.fm Now Playing asynchronously
  prisma.lastFmAccount.findUnique({
    where: { userId },
  }).then(account => {
    if (account && account.isScrobblingEnabled) {
      const sessionKey = decryptSecret(account.sessionKeyEncrypted);
      if (sessionKey) {
        updateNowPlaying(
          sessionKey,
          session.track.artistName,
          session.track.title,
          session.track.albumTitle || undefined
        ).catch(err => {
          console.error('Failed to update Last.fm now playing:', err);
        });
      }
    }
  }).catch(() => {});

  return session;
}

export async function reportPlaybackProgress(params: {
  userId: string;
  trackId: string;
  sessionId: string;
  listenedSeconds: number;
  eventId: string;
}) {
  const { userId, trackId, sessionId, listenedSeconds, eventId } = params;

  // Idempotency: check if eventId already processed
  const existingEvent = await prisma.playbackEvent.findUnique({
    where: { eventId },
  });
  if (existingEvent) {
    const session = await prisma.playbackSession.findUnique({ where: { id: sessionId } });
    return {
      status: 'already_recorded',
      thresholdReached: existingEvent.thresholdReached,
      playCountIncremented: false,
      isCompleted: session?.isCompleted || existingEvent.thresholdReached,
    };
  }

  const track = await prisma.track.findUnique({
    where: { id: trackId },
  });
  if (!track) {
    throw new Error('Track not found');
  }

  // Settings threshold: 50% duration or 240 seconds max
  const thresholdSec = Math.min(track.duration * 0.5, 240);
  const isEligibleLength = track.duration >= 30;
  const reached = isEligibleLength && listenedSeconds >= thresholdSec;

  // Record idempotent event
  await prisma.playbackEvent.create({
    data: {
      eventId,
      userId,
      trackId,
      sessionId,
      listenedSeconds,
      thresholdReached: reached,
      eventType: reached ? 'play_counted' : 'heartbeat',
    },
  });

  // Check if session already had a counted play
  const session = await prisma.playbackSession.findUnique({
    where: { id: sessionId },
  });

  let playCountIncremented = false;

  if (reached && session && !session.isCompleted) {
    // Mark session completed
    await prisma.playbackSession.update({
      where: { id: sessionId },
      data: {
        isCompleted: true,
        listenedSeconds,
        endedAt: new Date(),
      },
    });

    // Update user stats (local play count)
    await prisma.userTrackStats.upsert({
      where: {
        userId_trackId: { userId, trackId },
      },
      update: {
        playCount: { increment: 1 },
        totalListeningTime: { increment: listenedSeconds },
        lastPlayedAt: new Date(),
      },
      create: {
        userId,
        trackId,
        playCount: 1,
        totalListeningTime: listenedSeconds,
        lastPlayedAt: new Date(),
      },
    });

    playCountIncremented = true;

    // Check Last.fm queue eligibility
    const lastFmAccount = await prisma.lastFmAccount.findUnique({
      where: { userId },
    });

    if (lastFmAccount && lastFmAccount.isScrobblingEnabled && isEligibleLength) {
      const timestamp = Math.floor(session.startedAt.getTime() / 1000);
      await prisma.scrobbleJob.create({
        data: {
          userId,
          trackId,
          sessionId,
          artist: track.artistName,
          trackTitle: track.title,
          albumTitle: track.albumTitle || undefined,
          timestamp,
          status: 'pending',
        },
      });

      // Immediate durable queue processing
      processScrobbleQueue().catch(err => {
        console.error('Error triggering immediate scrobble queue:', err);
      });
    }
  }

  return {
    status: 'recorded',
    thresholdReached: reached,
    playCountIncremented,
    isCompleted: session ? (session.isCompleted || reached) : reached,
  };
}

export async function toggleFavorite(userId: string, trackId: string): Promise<boolean> {
  const existing = await prisma.userTrackStats.findUnique({
    where: { userId_trackId: { userId, trackId } },
  });

  const nextState = !existing?.isFavorite;

  await prisma.userTrackStats.upsert({
    where: { userId_trackId: { userId, trackId } },
    update: { isFavorite: nextState },
    create: {
      userId,
      trackId,
      isFavorite: nextState,
    },
  });

  return nextState;
}

export async function setTrackRating(userId: string, trackId: string, rating: number | null) {
  const normalizedRating = rating !== null ? Math.max(0, Math.min(100, rating)) : null;

  return await prisma.userTrackStats.upsert({
    where: { userId_trackId: { userId, trackId } },
    update: { rating: normalizedRating },
    create: {
      userId,
      trackId,
      rating: normalizedRating,
    },
  });
}
