// PULSAR — shared tunables. Imported by BOTH the Node server and the browser
// client so prediction and authority agree. Tweak these to rebalance the game.

export const C = {
  // ---- world ----
  ARENA_RADIUS: 24,        // full platform radius
  ARENA_MIN_RADIUS: 6,     // void never shrinks past this
  ORB_RADIUS: 1.05,        // base player radius
  FALL_DEATH_Y: -10,       // below this y, you're gone
  GRAVITY: 38,             // how fast you plunge once over the edge

  // ---- movement ----
  ACCEL: 95,               // steering acceleration
  MAX_SPEED: 16,           // normal top speed
  FRICTION: 0.86,          // per-frame velocity retention (@60fps ref)

  // ---- dash ----
  DASH_IMPULSE: 30,        // instant velocity kick
  DASH_MAX_SPEED: 46,      // speed cap while dash window is active
  DASH_DURATION: 0.28,     // seconds the "charged" hit window lasts
  DASH_COOLDOWN: 1.15,     // seconds between dashes

  // ---- collisions ----
  RESTITUTION: 0.72,       // bounciness of orb-vs-orb
  DASH_KNOCKBACK: 26,      // bonus shove applied when a dasher connects

  // ---- shockwave ability (secondary weapon) ----
  BLAST_RADIUS: 7.5,       // how far the radial shove reaches
  BLAST_FORCE: 34,         // peak shove at point-blank (falls off with distance)
  BLAST_COOLDOWN: 6.0,     // seconds between blasts
  COMBO_WINDOW: 3.0,       // seconds to chain KOs into a combo

  // ---- void ring ----
  SHRINK_GRACE: 6,         // seconds before the void starts closing
  SHRINK_RATE: 0.85,       // radius units lost per second

  // ---- buffs (seconds) ----
  BUFF_TIME: 7,
  BUFF_SPEED_MULT: 1.6,
  BUFF_GIANT_RADIUS: 1.7,  // radius multiplier
  BUFF_GIANT_KNOCK: 1.8,   // knockback multiplier dealt
  BUFF_PHANTOM_MULT: 1.45, // phantom speed multiplier (and pass-through)
  BUFF_FEATHER_GRAV: 0.3,  // gravity multiplier while feather is active
  BUFF_TRIDENT_KNOCK: 3.0, // dash knockback multiplier while trident is active
  BUFF_TURBO_CD: 0.32,     // dash-cooldown multiplier while turbo is active

  // ---- magnet ----
  MAGNET_RADIUS: 11,
  MAGNET_FORCE: 30,

  // ---- hazards ----
  WELL_FORCE: 26,          // gravity-well pull strength (BLACK HOLE mutator)
  WELL_RADIUS: 22,         // pull reaches this far
  BUMPER_RESTITUTION: 1.35,// how bouncy bumper pillars are
  ICE_FRICTION: 0.965,     // slippery friction (ICE RINK mutator)

  // ---- power-ups ----
  POWERUP_INTERVAL: 5.5,   // seconds between spawns
  POWERUP_MAX: 4,
  POWERUP_RADIUS: 0.9,

  // ---- match flow ----
  TICK_RATE: 30,           // server simulation Hz
  TARGET_PLAYERS: 6,       // bots fill up to this many
  COUNTDOWN: 3,            // seconds before a round goes live
  INTERMISSION: 5,         // seconds on the win screen
  ROUND_TIME: 75,          // hard cap; sudden-death handled by shrink
};

export const POWERUP_TYPES = ['bolt', 'shield', 'giant', 'feather', 'phantom', 'trident', 'turbo', 'magnet', 'life'];

// Phases of the match loop.
export const PHASE = {
  COUNTDOWN: 'countdown',
  PLAYING: 'playing',
  ROUND_END: 'round_end',
};
