# PULSAR — 100 Features

Living checklist. `[x]` = implemented & verified, `[~]` = in progress.

## Core engine & netcode (1–20)
1. [x] 3D arena rendering (Three.js)
2. [x] Real-time multiplayer over WebSockets
3. [x] Authoritative server simulation @30Hz fixed tick
4. [x] Client-side prediction for own orb
5. [x] Entity interpolation (~100ms) for others
6. [x] Reliable dash/blast input latching
7. [x] Auto-reconnect client
8. [x] Ping measurement + display
9. [x] Bot back-fill to a full lobby
10. [x] Single-command server (serves client + WS)
11. [x] Offline-ready (Three.js + bloom vendored locally)
12. [x] LAN play (share IP)
13. [x] Pure ES modules, zero build step
14. [x] Shared physics module (server + client agree)
15. [x] Graceful spectator for mid-round joiners
16. [x] Round/countdown/intermission match loop
17. [x] Server env config (PORT, TARGET_PLAYERS, ROUND_TIME)
18. [x] /health endpoint + JSON status
19. [x] Graceful shutdown (SIGINT/SIGTERM)
20. [x] Server-side input rate limiting

## Movement & combat (21–32)
21. [x] WASD camera-relative movement
22. [x] Momentum + friction physics
23. [x] Dash with cooldown + aim
24. [x] Knockback collisions with restitution
25. [x] Dash-charged bonus knockback
26. [x] Shockwave blast ability (radial knockback)
27. [x] Mouse-aimed dash
28. [x] Self-knockout risk (dash off the edge)
29. [x] Kill credit + assist window
30. [x] Multi-KO combos (Double/Triple/Mega)
31. [x] Revive tokens (extra lives)
32. [x] Per-orb buff stacking

## Power-ups (33–42)
33. [x] BOLT — speed + instant dash recharge
34. [x] SHIELD — knockback immunity
35. [x] GIANT — bigger, heavier, harder hits
36. [x] FEATHER — personal low-gravity (recover off edges)
37. [x] PHANTOM — phase through + speed burst
38. [x] TRIDENT — tripled dash knockback
39. [x] TURBO — drastically reduced dash cooldown
40. [x] MAGNET — pulls rivals toward you
41. [x] LIFE — grants a revive token
42. [x] Per-type pickup colors, meshes & sounds

## Round mutators (43–54)
43. [x] STANDARD
44. [x] LOW GRAVITY
45. [x] GIANT BRAWL
46. [x] OVERDRIVE (everyone fast)
47. [x] SUDDEN DEATH (tiny ring, fast)
48. [x] PINBALL (hyper-bouncy)
49. [x] ICE RINK (slippery)
50. [x] SWARM (power-up frenzy)
51. [x] NINE LIVES (everyone revives once)
52. [x] TINY TITANS (small + fast)
53. [x] BUMPER CITY (bumpers active)
54. [x] BLACK HOLE (gravity well pulls center)

## Hazards & arena (55–60)
55. [x] Bumper pillars (bouncy obstacles)
56. [x] Gravity well (center attractor)
57. [x] Arena theme tinting per mutator
58. [x] Shrinking void ring
59. [x] Death-ring danger glow
60. [x] Procedural starfield + nebula fog

## Visual juice (61–76)
61. [x] UnrealBloom neon glow
62. [x] Screen shake (scalable)
63. [x] Camera punch-zoom on impact
64. [x] Full-screen impact flash
65. [x] Floor shockwave ripples
66. [x] Orb trails
67. [x] Confetti burst on victory
68. [x] Winner spotlight beam
69. [x] Orb squash/stretch on impact
70. [x] Dash aim arrow on the floor
71. [x] In-world floating KO/combo popups
72. [x] Power-up idle bob + spin + glow
73. [x] Reduced-motion mode
74. [x] Quality presets (pixel ratio/bloom)
75. [x] Adjustable FOV
76. [x] Colorblind-friendly palette

## Audio (77–84)
77. [x] Procedural synthwave soundtrack
78. [x] Dynamic music intensity (void heat)
79. [x] Synthesized SFX (dash/hit/KO/etc.)
80. [x] Stereo panning by arena position
81. [x] Countdown beeps + GO sting
82. [x] UI click/hover sounds
83. [x] Per-power-up pickup tones
84. [x] Master/music/sfx volume sliders

## HUD & UX (85–96)
85. [x] Leaderboard with live wins
86. [x] Dash + shockwave ability meters
87. [x] Buff status pills
88. [x] Kill feed
89. [x] Mutator intro splash + tag
90. [x] Minimap
91. [x] Settings panel (audio/visual/gameplay)
92. [x] FPS counter
93. [x] In-game help / controls overlay
94. [x] End-of-round MVP highlight
95. [x] Spectate-next on knockout
96. [x] Fullscreen toggle

## Meta & social (97–100)
97. [x] Persistent stats (KOs/wins/games)
98. [x] XP, levels & rank titles
99. [x] Lobby profile banner
100. [x] Emote / ping wheel (networked)

---
*Verified via headless-browser captures + server simulation tests as features land.*
</content>
