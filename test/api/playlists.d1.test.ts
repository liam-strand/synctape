import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { env, SELF } from "cloudflare:test";

describe("Playlists API (Integration)", () => {
  let authToken: string;
  let testUserId: string;

  beforeAll(async () => {
    const user = await env.DB.prepare("SELECT id FROM users WHERE email = ?")
      .bind("alice@example.com")
      .first<{ id: string }>();
    testUserId = user!.id;

    const loginRes = await SELF.fetch("https://synctape.ltrs.xyz/api/users", {
      method: "POST",
      body: JSON.stringify({ email: "alice@example.com", username: "alice" }),
      headers: { "Content-Type": "application/json" },
    });
    const { accessToken } = await loginRes.json();
    authToken = accessToken;
  });

  beforeEach(async () => {
    // Reset the database to a known state before each test
    await env.DB.exec("DELETE FROM playlist_tracks");
    await env.DB.exec("DELETE FROM playlists");
    await env.DB.exec("DELETE FROM tracks WHERE id > 10");

    // Seed playlists for the test user (Alice, user_id=1)
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO playlists (id, name, description, owner_id) VALUES (1, 'Vulfpeck', 'The fourth-best funk band from Ann Arbor', 1)",
      ),
      env.DB.prepare(
        "INSERT INTO playlists (id, name, description, owner_id) VALUES (2, 'Instrumental', 'No words needed', 1)",
      ),
    ]);
    // Seed tracks for playlist 1, letting the DB handle the primary key `id`
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO playlist_tracks (playlist_id, track_id, position) VALUES (1, 1, 0)",
      ),
      env.DB.prepare(
        "INSERT INTO playlist_tracks (playlist_id, track_id, position) VALUES (1, 2, 1)",
      ),
    ]);
  });

  it("should list only the user's playlists", async () => {
    const res = await SELF.fetch("https://synctape.ltrs.xyz/api/playlists", {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    expect(res.status).toBe(200);
    const playlists = (await res.json()) as any[];
    expect(playlists).toHaveLength(2);
    expect(playlists[0].name).toBe("Vulfpeck");
  });

  it("should get a specific playlist with its tracks in the correct order", async () => {
    const res = await SELF.fetch("https://synctape.ltrs.xyz/api/playlists/1", {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    expect(res.status).toBe(200);
    const playlist = (await res.json()) as any;
    expect(playlist.name).toBe("Vulfpeck");
    expect(playlist.tracks).toBeDefined();
    expect(playlist.tracks.length).toBe(2);
    // The query is ordered by position. From the seed data, track_id 1 ("Back Pocket") is at position 0.
    expect(playlist.tracks[0].name).toBe("Back Pocket");
  });

  it("should not get a playlist owned by another user", async () => {
    const bob = await env.DB.prepare("SELECT id FROM users WHERE email = ?")
      .bind("bob@example.com")
      .first<{ id: string }>();
    const {
      meta: { last_row_id: bobsPlaylistId },
    } = await env.DB.prepare(
      "INSERT INTO playlists (name, description, owner_id) VALUES (?, ?, ?)",
    )
      .bind("Bob's Playlist", "Not for Alice", bob!.id)
      .run();

    const res = await SELF.fetch(
      `https://synctape.ltrs.xyz/api/playlists/${bobsPlaylistId}`,
      {
        headers: { Authorization: `Bearer ${authToken}` },
      },
    );
    expect(res.status).toBe(404);
  });

  it("should update a playlist", async () => {
    const patchRes = await SELF.fetch(
      "https://synctape.ltrs.xyz/api/playlists/1",
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${authToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: "VULFPECK",
          description: "All caps.",
        }),
      },
    );
    expect(patchRes.status).toBe(200);

    const updatedPlaylist = await env.DB.prepare(
      "SELECT * FROM playlists WHERE id = 1",
    ).first();
    expect(updatedPlaylist?.name).toBe("VULFPECK");
    expect(updatedPlaylist?.description).toBe("All caps.");
  });

  it("should delete a playlist", async () => {
    const deleteRes = await SELF.fetch(
      "https://synctape.ltrs.xyz/api/playlists/1",
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${authToken}` },
      },
    );
    expect(deleteRes.status).toBe(200);

    const deletedPlaylist = await env.DB.prepare(
      "SELECT * FROM playlists WHERE id = 1",
    ).first();
    expect(deletedPlaylist).toBeNull();
  });

  it("should add and remove tracks from a playlist", async () => {
    const tracksToAdd = [
      { name: "New Track 1", artist: "Artist", album: "Album", isrc: "NEW01" },
      { name: "New Track 2", artist: "Artist", album: "Album", isrc: "NEW02" },
    ];
    const addTracksRes = await SELF.fetch(
      "https://synctape.ltrs.xyz/api/playlists/2/tracks",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${authToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ tracks: tracksToAdd }),
      },
    );
    expect(addTracksRes.status).toBe(200);

    const newTracks = await env.DB.prepare(
      "SELECT * FROM tracks WHERE isrc IN ('NEW01', 'NEW02')",
    ).all();
    expect(newTracks.results).toHaveLength(2);

    const trackIdsToRemove = newTracks.results.map((t: any) => t.id);

    const removeTracksRes = await SELF.fetch(
      "https://synctape.ltrs.xyz/api/playlists/2/tracks",
      {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${authToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ trackIds: [trackIdsToRemove[0]] }),
      },
    );
    expect(removeTracksRes.status).toBe(200);

    const remainingLinks = await env.DB.prepare(
      "SELECT * FROM playlist_tracks WHERE playlist_id = 2 AND track_id IN (?, ?)",
    )
      .bind(...trackIdsToRemove)
      .all();
    expect(remainingLinks.results).toHaveLength(1);
    expect(remainingLinks.results[0].track_id).toBe(trackIdsToRemove[1]);
  });
});
