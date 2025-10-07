import { Env, Playlist, Track } from "./types";

// A more realistic representation of a track from a music service API
interface MusicServiceTrack {
  id: string;
  title: string;
  artist: string;
  album?: string;
}

// Mock functions to simulate fetching data from Spotify and Apple Music APIs
const getSpotifyTracks = async (playlistId: string): Promise<MusicServiceTrack[]> => {
  console.log(`Fetching tracks from Spotify for playlist ${playlistId}`);
  return [
    { id: 'spotify:track:1', title: 'Song A', artist: 'Artist 1' },
    { id: 'spotify:track:2', title: 'Song B', artist: 'Artist 2' },
    { id: 'spotify:track:4', title: 'Song D', artist: 'Artist 4' },
  ];
};

const getAppleMusicTracks = async (playlistId: string): Promise<MusicServiceTrack[]> => {
  console.log(`Fetching tracks from Apple Music for playlist ${playlistId}`);
  return [
    { id: 'apple:track:3', title: 'Song C', artist: 'Artist 3' },
    { id: 'apple:track:1', title: 'Song A', artist: 'Artist 1' }, // Same song, different ID
    { id: 'apple:track:5', title: 'Song E', artist: 'Artist 5' },
  ];
};

// Mock functions to simulate adding tracks to Spotify and Apple Music
const addTrackToSpotify = async (playlistId: string, track: MusicServiceTrack) => {
  console.log(`Adding track "${track.title}" by ${track.artist} to Spotify playlist ${playlistId}`);
};

const addTrackToAppleMusic = async (playlistId: string, track: MusicServiceTrack) => {
  console.log(`Adding track "${track.title}" by ${track.artist} to Apple Music playlist ${playlistId}`);
};

// Helper function to create a unique key for a track based on title and artist
const getTrackKey = (track: MusicServiceTrack) => `${track.title.toLowerCase()}|${track.artist.toLowerCase()}`;

export const synchronizePlaylist = async (playlistId: string, env: Env) => {
  // 1. Get the playlist from the database
  const playlistStmt = env.DB.prepare('SELECT * FROM playlists WHERE id = ?').bind(playlistId);
  const playlist = await playlistStmt.first<Playlist>();

  if (!playlist) {
    throw new Error('Playlist not found');
  }

  if (!playlist.spotify_id || !playlist.apple_music_id) {
    throw new Error('Playlist is not configured for both Spotify and Apple Music');
  }

  // 2. Fetch tracks from both services
  const spotifyTracks = await getSpotifyTracks(playlist.spotify_id);
  const appleMusicTracks = await getAppleMusicTracks(playlist.apple_music_id);

  // 3. Identify missing tracks using a combination of title and artist
  const spotifyTrackKeys = new Set(spotifyTracks.map(getTrackKey));
  const appleMusicTrackKeys = new Set(appleMusicTracks.map(getTrackKey));

  const missingInAppleMusic = spotifyTracks.filter(t => !appleMusicTrackKeys.has(getTrackKey(t)));
  const missingInSpotify = appleMusicTracks.filter(t => !spotifyTrackKeys.has(getTrackKey(t)));

  // 4. Add missing tracks
  for (const track of missingInAppleMusic) {
    await addTrackToAppleMusic(playlist.apple_music_id, track);
  }

  for (const track of missingInSpotify) {
    await addTrackToSpotify(playlist.spotify_id, track);
  }

  console.log('Synchronization complete');
};