// FLOTSAM — shared game configuration & data (v2 "Overkill").
// Imported by BOTH the Node server and the browser client.
// Single source of truth. Add items/recipes/buildables/debris here and they
// light up across the whole game automatically.

export const GAME = {
  TICK_RATE: 15,
  GRID: 4,
  PLAYER_SPEED: 7,
  SPRINT_MULT: 1.6,
  SWIM_SPEED: 4,
  DIVE_SPEED: 3.2,
  JUMP_V: 7.5,
  GRAVITY: 20,
  WATER_Y: 0,
  RAFT_Y: 0.35,
  REACH: 5,
  DAY_LENGTH: 360,
  SEABED_Y: -14,            // ocean floor depth
};

export const WORLD = {
  DEBRIS_MAX: 80,
  DEBRIS_SPAWN_RADIUS: 130,
  DEBRIS_DESPAWN: 180,
  CURRENT: { x: -1, z: 0.25 },
  CURRENT_SPEED: 2.2,
  SAIL_SPEED: 5.5,          // current speed boost while a Sail is up
};

export const SURVIVAL = {
  HUNGER_DRAIN: 0.42,
  THIRST_DRAIN: 0.55,
  STARVE_DMG: 1.2,
  DEHYDRATE_DMG: 1.6,
  REGEN: 0.9,
  MAX: 100,
  // new vitals
  OXYGEN_MAX: 100,
  OXYGEN_DRAIN: 12,         // per sec underwater (without tank)
  OXYGEN_REGEN: 30,
  DROWN_DMG: 5,
  STAMINA_MAX: 100,
  STAMINA_DRAIN: 18,        // per sec sprinting/swimming hard
  STAMINA_REGEN: 16,
  TEMP_MAX: 100,
  TEMP_COMFORT: 60,
  TEMP_NIGHT_DROP: 2.2,     // per sec at night, away from heat
  TEMP_WARM: 9,             // per sec near fire
  TEMP_DAY_WARM: 1.2,
  COLD_DMG: 0.8,            // per sec at 0 temp
  DOWN_TIME: 30,            // seconds downed before death
  REVIVE_TIME: 3,          // seconds to revive a teammate
};

// ---------------------------------------------------------------------------
// ITEMS
// kinds: resource | material | food | drink | tool | tech | ammo | misc
// tools: slot, tier (1 wood/2 stone/3 metal), power (harvest/dmg), dur (durability), light
// ---------------------------------------------------------------------------
export const ITEMS = {
  // resources
  wood:       { name: 'Wood',        kind: 'resource', icon: '🪵', color: 0x8a5a2b },
  plastic:    { name: 'Plastic',     kind: 'resource', icon: '🧴', color: 0x3aa7d8 },
  fiber:      { name: 'Fiber',       kind: 'resource', icon: '🌿', color: 0x4caf50 },
  scrap:      { name: 'Scrap',       kind: 'resource', icon: '🔩', color: 0x9e9e9e },
  metal:      { name: 'Metal Ingot', kind: 'resource', icon: '⛓️', color: 0xcfd8dc },
  stone:      { name: 'Stone',       kind: 'resource', icon: '🪨', color: 0x808a90 },
  sand:       { name: 'Sand',        kind: 'resource', icon: '🏖️', color: 0xe8d8a0 },
  clay:       { name: 'Clay',        kind: 'resource', icon: '🧱', color: 0xb5651d },
  oil:        { name: 'Oil',         kind: 'resource', icon: '🛢️', color: 0x222222 },
  sharkskin:  { name: 'Sharkskin',   kind: 'resource', icon: '🦈', color: 0x556 },
  bone:       { name: 'Bone',        kind: 'resource', icon: '🦴', color: 0xeee8d0 },
  pearl:      { name: 'Pearl',       kind: 'resource', icon: '🦪', color: 0xf8f0ff },

  // materials
  rope:       { name: 'Rope',        kind: 'material', icon: '🪢' },
  plank:      { name: 'Plank',       kind: 'material', icon: '🟫' },
  circuit:    { name: 'Circuit',     kind: 'material', icon: '🔌' },
  glass:      { name: 'Glass',       kind: 'material', icon: '🪟', req: 'furnace' },
  nail:       { name: 'Nails',       kind: 'material', icon: '📌', req: 'anvil' },
  cloth:      { name: 'Cloth',       kind: 'material', icon: '🧵' },
  canvas:     { name: 'Sail Canvas', kind: 'material', icon: '⛵' },

  // food
  rawfish:    { name: 'Raw Fish',    kind: 'food',  icon: '🐟', hunger: 10, health: -4 },
  cookedfish: { name: 'Cooked Fish', kind: 'food',  icon: '🍤', hunger: 34, health: 8 },
  rawmeat:    { name: 'Shark Meat',  kind: 'food',  icon: '🥩', hunger: 14, health: -6 },
  steak:      { name: 'Shark Steak', kind: 'food',  icon: '🍖', hunger: 46, health: 14 },
  soup:       { name: 'Fish Soup',   kind: 'food',  icon: '🍲', hunger: 40, thirst: 18, health: 10, req: 'cookpot' },
  seaweedsnack:{name: 'Seaweed Snack',kind:'food',  icon: '🍙', hunger: 16 },
  crabmeat:   { name: 'Crab Meat',   kind: 'food',  icon: '🦀', hunger: 22, health: 4 },
  grilledcrab:{ name: 'Grilled Crab',kind: 'food',  icon: '🦐', hunger: 38, health: 10 },
  jerky:      { name: 'Dried Fish',  kind: 'food',  icon: '🐠', hunger: 28 },
  sushi:      { name: 'Sushi',       kind: 'food',  icon: '🍣', hunger: 50, health: 16, req: 'cookpot' },
  rations:    { name: 'Rations',     kind: 'food',  icon: '🥫', hunger: 26 },
  coconut:    { name: 'Coconut',     kind: 'food',  icon: '🥥', hunger: 14, thirst: 12 },
  fruit:      { name: 'Fruit',       kind: 'food',  icon: '🍍', hunger: 18, thirst: 10 },
  berries:    { name: 'Berries',     kind: 'food',  icon: '🫐', hunger: 10, thirst: 6 },
  potato:     { name: 'Potato',      kind: 'food',  icon: '🥔', hunger: 24 },

  // drink
  saltwater:  { name: 'Salt Water',  kind: 'drink', icon: '💧', thirst: -12, health: -6 },
  freshwater: { name: 'Fresh Water', kind: 'drink', icon: '🧊', thirst: 40 },
  coconutwater:{name:'Coconut Water',kind: 'drink', icon: '🥥', thirst: 26 },
  juice:      { name: 'Fruit Juice', kind: 'drink', icon: '🧃', thirst: 34, health: 4 },

  // seeds
  potato_seed:{ name: 'Potato Seed', kind: 'misc',  icon: '🌱' },

  // tools
  hook:       { name: 'Hook',        kind: 'tool', icon: '🪝', slot: 'hook',   tier: 1, power: 1, dur: 999 },
  hammer:     { name: 'Hammer',      kind: 'tool', icon: '🔨', slot: 'hammer', tier: 1, power: 1, dur: 999 },
  spear:      { name: 'Spear',       kind: 'tool', icon: '🔱', slot: 'spear',  tier: 1, power: 18, dur: 60 },
  metalspear: { name: 'Metal Spear', kind: 'tool', icon: '🗡️', slot: 'spear',  tier: 3, power: 32, dur: 150, req: 'anvil' },
  rod:        { name: 'Fishing Rod', kind: 'tool', icon: '🎣', slot: 'rod',    tier: 1, power: 1, dur: 120 },
  fishnet:    { name: 'Fishing Net', kind: 'tool', icon: '🥅', slot: 'rod',    tier: 2, power: 2, dur: 100 },
  axe:        { name: 'Stone Axe',   kind: 'tool', icon: '🪓', slot: 'axe',    tier: 2, power: 3, dur: 120 },
  machete:    { name: 'Machete',     kind: 'tool', icon: '🔪', slot: 'axe',    tier: 2, power: 2, dur: 110 },
  bow:        { name: 'Bow',         kind: 'tool', icon: '🏹', slot: 'bow',    tier: 2, power: 14, dur: 140 },
  arrow:      { name: 'Arrow',       kind: 'ammo', icon: '➶' },
  bucket:     { name: 'Bucket',      kind: 'tool', icon: '🪣', slot: 'bucket', tier: 1, power: 1, dur: 999 },
  torch:      { name: 'Torch',       kind: 'tool', icon: '🔦', slot: 'torch',  tier: 1, power: 1, dur: 999, light: 1 },
  flippers:   { name: 'Flippers',    kind: 'tool', icon: '🐸', slot: 'feet',   gear: 'swim' },
  oxytank:    { name: 'Oxygen Tank', kind: 'tool', icon: '🫧', slot: 'back',   gear: 'oxygen' },
  mask:       { name: 'Diving Mask', kind: 'tool', icon: '🥽', slot: 'face',   gear: 'mask' },
  binoculars: { name: 'Binoculars',  kind: 'tool', icon: '🔭', slot: 'optic',  gear: 'scope' },

  // tech
  battery:    { name: 'Battery',     kind: 'tech', icon: '🔋', req: 'workbench' },
  beacon_core:{ name: 'Beacon Core', kind: 'tech', icon: '📡', req: 'research' },
};

// ---------------------------------------------------------------------------
// CRAFTING  — in: {item:qty}, out: {item:qty}, req: station type needed (optional)
// ---------------------------------------------------------------------------
export const RECIPES = {
  rope:        { out: { rope: 1 },        in: { fiber: 2 } },
  plank:       { out: { plank: 1 },        in: { wood: 2 } },
  cloth:       { out: { cloth: 1 },        in: { fiber: 4 } },
  canvas:      { out: { canvas: 1 },       in: { cloth: 3, rope: 1 } },
  metal:       { out: { metal: 1 },        in: { scrap: 3 }, req: 'furnace' },
  glass:       { out: { glass: 1 },        in: { sand: 2 }, req: 'furnace' },
  nail:        { out: { nail: 4 },         in: { metal: 1 }, req: 'anvil' },
  circuit:     { out: { circuit: 1 },      in: { scrap: 2, plastic: 1 }, req: 'workbench' },

  axe:         { out: { axe: 1 },          in: { wood: 3, stone: 2, rope: 1 } },
  machete:     { out: { machete: 1 },      in: { metal: 1, wood: 2 }, req: 'anvil' },
  spear:       { out: { spear: 1 },        in: { wood: 3, rope: 1 } },
  metalspear:  { out: { metalspear: 1 },   in: { metal: 2, wood: 2 }, req: 'anvil' },
  rod:         { out: { rod: 1 },          in: { wood: 2, rope: 2 } },
  fishnet:     { out: { fishnet: 1 },      in: { rope: 4, fiber: 4 }, req: 'workbench' },
  bow:         { out: { bow: 1 },          in: { wood: 3, rope: 2 }, req: 'workbench' },
  arrow:       { out: { arrow: 5 },        in: { wood: 1, scrap: 1 } },
  bucket:      { out: { bucket: 1 },       in: { plastic: 2 } },
  torch:       { out: { torch: 1 },        in: { wood: 1, cloth: 1, oil: 1 } },
  flippers:    { out: { flippers: 1 },     in: { plastic: 3, cloth: 1 }, req: 'workbench' },
  oxytank:     { out: { oxytank: 1 },      in: { metal: 2, plastic: 2 }, req: 'anvil' },
  mask:        { out: { mask: 1 },         in: { glass: 1, plastic: 1 }, req: 'workbench' },
  binoculars:  { out: { binoculars: 1 },   in: { glass: 2, plastic: 1 }, req: 'workbench' },
  hammer:      { out: { hammer: 1 },       in: { wood: 2, scrap: 1 } },

  battery:     { out: { battery: 1 },      in: { metal: 2, plastic: 2, circuit: 1 }, req: 'workbench' },
  beacon_core: { out: { beacon_core: 1 },  in: { metal: 3, circuit: 3, glass: 2 }, req: 'research' },
  potato_seed: { out: { potato_seed: 1 },  in: { potato: 1 } },
};

// ---------------------------------------------------------------------------
// BUILDABLES — shape: tile | prop ; req: tech station gate ; light: emits light
// ---------------------------------------------------------------------------
export const BUILDABLES = {
  foundation: { name: 'Foundation', icon: '⬛', shape: 'tile', hp: 120, in: { wood: 4 }, desc: 'Expand the raft. Must touch an existing tile.' },
  reinforced: { name: 'Reinforced', icon: '🟦', shape: 'tile', hp: 360, in: { wood: 4, metal: 2 }, req: 'anvil', desc: 'Tough metal-plated foundation.' },
  floor:      { name: 'Floor',      icon: '⬜', shape: 'prop', hp: 60,  in: { plank: 2 }, desc: 'Upper-deck flooring / pathways.' },
  wall:       { name: 'Wall',       icon: '🧱', shape: 'prop', hp: 80,  in: { wood: 2, plank: 1 }, desc: 'Blocks the shark from the deck edge.' },
  railing:    { name: 'Railing',    icon: '〽️', shape: 'prop', hp: 40,  in: { wood: 2 }, desc: 'Keeps you from falling off.' },
  door:       { name: 'Door',       icon: '🚪', shape: 'prop', hp: 60,  in: { plank: 2, nail: 2 }, req: 'anvil', desc: 'A doorway in your walls.' },
  ramp:       { name: 'Ramp',       icon: '📐', shape: 'prop', hp: 60,  in: { wood: 3 }, desc: 'Climb to upper decks / back aboard.' },
  ladder:     { name: 'Ladder',     icon: '🪜', shape: 'prop', hp: 40,  in: { wood: 2, rope: 1 }, desc: 'Climb out of the water.' },

  storage:    { name: 'Storage',    icon: '📦', shape: 'prop', hp: 60,  in: { wood: 4, rope: 1 }, station: 'storage', desc: 'Shared crew storage.' },
  bigstorage: { name: 'Large Storage', icon: '🗄️', shape: 'prop', hp: 90, in: { wood: 8, plank: 4 }, station: 'storage', req: 'workbench', desc: 'More crew storage.' },
  grill:      { name: 'Grill',      icon: '🔥', shape: 'prop', hp: 60,  in: { scrap: 2, wood: 3 }, station: 'grill', desc: 'Cook raw fish & meat.' },
  campfire:   { name: 'Campfire',   icon: '🏕️', shape: 'prop', hp: 50,  in: { wood: 4, stone: 2 }, station: 'grill', light: 1.2, warm: 1, desc: 'Cook + warmth + light.' },
  cookpot:    { name: 'Cooking Pot',icon: '🍲', shape: 'prop', hp: 60,  in: { metal: 2, stone: 2 }, station: 'cookpot', req: 'workbench', desc: 'Brew soups & sushi.' },
  furnace:    { name: 'Furnace',    icon: '🏭', shape: 'prop', hp: 90,  in: { stone: 6, clay: 2 }, station: 'furnace', light: 0.8, warm: 1, desc: 'Smelt metal & glass.' },
  anvil:      { name: 'Anvil',      icon: '🛠️', shape: 'prop', hp: 120, in: { metal: 4, stone: 4 }, station: 'anvil', req: 'furnace', desc: 'Forge metal tools & nails.' },
  workbench:  { name: 'Workbench',  icon: '🪚', shape: 'prop', hp: 70,  in: { wood: 6, scrap: 2 }, station: 'workbench', desc: 'Unlocks tier-2 crafting.' },
  research:   { name: 'Research Table', icon: '🔬', shape: 'prop', hp: 80, in: { plank: 6, circuit: 2, glass: 1 }, station: 'research', req: 'workbench', desc: 'Unlocks end-game tech.' },
  purifier:   { name: 'Purifier',   icon: '⚗️', shape: 'prop', hp: 60,  in: { plastic: 3, scrap: 2 }, station: 'purifier', desc: 'Salt water → fresh water over time.' },
  raincatcher:{ name: 'Rain Collector', icon: '🛟', shape: 'prop', hp: 50, in: { plastic: 4, cloth: 1 }, station: 'raincatcher', desc: 'Collects fresh water when it rains.' },
  net:        { name: 'Catch Net',  icon: '🕸️', shape: 'prop', hp: 50,  in: { fiber: 4, rope: 2 }, station: 'net', desc: 'Auto-snags drifting debris.' },
  planter:    { name: 'Planter',    icon: '🪴', shape: 'prop', hp: 40,  in: { wood: 3, clay: 2 }, station: 'planter', desc: 'Grow crops from seeds.' },
  bed:        { name: 'Bed',        icon: '🛏️', shape: 'prop', hp: 50,  in: { wood: 4, cloth: 3 }, station: 'bed', desc: 'Sleep to skip the night & set spawn.' },
  torchpost:  { name: 'Torch Post', icon: '🕯️', shape: 'prop', hp: 30,  in: { wood: 2, oil: 1 }, light: 1, desc: 'Lights the deck at night.' },
  lantern:    { name: 'Lantern',    icon: '🏮', shape: 'prop', hp: 30,  in: { metal: 1, glass: 1, oil: 1 }, light: 1.4, req: 'anvil', desc: 'Bright, lasting light.' },
  spikes:     { name: 'Shark Spikes', icon: '🛡️', shape: 'prop', hp: 70, in: { wood: 3, scrap: 3 }, req: 'workbench', desc: 'Damages sharks that bite this tile.' },

  sail:       { name: 'Sail',       icon: '⛵', shape: 'prop', hp: 70,  in: { wood: 4, canvas: 2 }, station: 'sail', req: 'workbench', desc: 'Catch the wind — speeds the sea past you.' },
  wheel:      { name: 'Steering Wheel', icon: '🛞', shape: 'prop', hp: 60, in: { wood: 4, metal: 1 }, station: 'wheel', req: 'workbench', desc: 'Steer toward islands.' },
  anchor:     { name: 'Anchor',     icon: '⚓', shape: 'prop', hp: 80,  in: { metal: 3, rope: 2 }, station: 'anchor', req: 'anvil', desc: 'Hold position; stop drifting.' },

  flag:       { name: 'Flag',       icon: '🚩', shape: 'prop', hp: 20,  in: { wood: 2, cloth: 1 }, desc: 'Stake your claim.' },
  chair:      { name: 'Chair',      icon: '🪑', shape: 'prop', hp: 20,  in: { wood: 2 }, station: 'chair', desc: 'Sit and watch the waves.' },
  sign:       { name: 'Sign',       icon: '🪧', shape: 'prop', hp: 20,  in: { plank: 1 }, station: 'sign', desc: 'Leave a message.' },

  beacon:     { name: 'Rescue Beacon', icon: '📡', shape: 'prop', hp: 240, in: { metal: 6, plank: 4, beacon_core: 1, battery: 2 }, station: 'beacon', req: 'research', desc: 'THE GOAL — activate it & survive the final hunt.' },
};

// ---------------------------------------------------------------------------
// DEBRIS — floats by; loot rolled from the table.
// ---------------------------------------------------------------------------
export const DEBRIS = {
  plank_bundle: { name: 'Planks',  weight: 26, color: 0x8a5a2b, size: [1.6, 0.4, 0.6], loot: [['wood', 2, 4]] },
  driftwood:    { name: 'Driftwood', weight: 22, color: 0x9b6b3a, size: [2.0, 0.3, 0.4], loot: [['wood', 1, 3], ['fiber', 0, 1]] },
  barrel:       { name: 'Barrel',  weight: 16, color: 0x2e7d32, size: [0.9, 1.1, 0.9], loot: [['plastic', 1, 2], ['rations', 0, 1], ['freshwater', 0, 1]] },
  fuelbarrel:   { name: 'Fuel Barrel', weight: 9, color: 0x111111, size: [0.9, 1.1, 0.9], loot: [['oil', 1, 3], ['scrap', 0, 1]] },
  crate:        { name: 'Crate',   weight: 14, color: 0xb08d57, size: [1.0, 1.0, 1.0], loot: [['wood', 1, 2], ['scrap', 1, 2]] },
  cargo:        { name: 'Cargo Container', weight: 5, color: 0xc0392b, size: [2.2, 1.4, 1.4], loot: [['scrap', 2, 4], ['plastic', 2, 3], ['metal', 0, 1], ['rations', 0, 2]] },
  buoy:         { name: 'Buoy',    weight: 11, color: 0xe53935, size: [0.8, 0.8, 0.8], loot: [['plastic', 2, 3], ['fiber', 1, 2]] },
  scrap_pile:   { name: 'Scrap',   weight: 11, color: 0x9e9e9e, size: [1.2, 0.5, 1.0], loot: [['scrap', 2, 4], ['metal', 0, 1]] },
  anchordebris: { name: 'Scrap Anchor', weight: 5, color: 0x6b7378, size: [1.0, 1.0, 0.6], loot: [['scrap', 3, 5], ['metal', 0, 1]] },
  seaweed:      { name: 'Seaweed', weight: 14, color: 0x33691e, size: [1.0, 0.3, 1.0], loot: [['fiber', 2, 3], ['seaweedsnack', 0, 1]] },
  palm:         { name: 'Palm Raft', weight: 6, color: 0x5d4037, size: [1.8, 0.3, 0.8], loot: [['wood', 1, 2], ['coconut', 1, 2], ['fiber', 1, 1]] },
  bottle:       { name: 'Message Bottle', weight: 4, color: 0x88ccaa, size: [0.4, 0.7, 0.4], loot: [['plastic', 1, 1]], special: 'bottle' },
  treasure:     { name: 'Treasure Crate', weight: 3, color: 0xffd54f, size: [1.0, 0.8, 0.8], loot: [['metal', 1, 2], ['pearl', 1, 2], ['circuit', 0, 1], ['rations', 1, 2]], special: 'treasure' },
};

// ---------------------------------------------------------------------------
// FISHING — results depend on tool tier (rod=1, net=2). [item, lo, hi, weight]
// ---------------------------------------------------------------------------
export const FISH = [
  { item: 'rawfish', w: 40, name: 'Fish' },
  { item: 'rawfish', w: 18, name: 'Tuna', qty: 2 },
  { item: 'rawfish', w: 12, name: 'Cod' },
  { item: 'rawfish', w: 10, name: 'Salmon', qty: 2 },
  { item: 'crabmeat', w: 9, name: 'Crab' },
  { item: 'crabmeat', w: 5, name: 'Lobster', qty: 2 },
  { item: 'rawmeat', w: 3, name: 'Pufferfish', dmg: 8 },
  { item: 'fiber', w: 6, name: 'Seaweed' },
  { item: 'plastic', w: 6, name: 'Junk' },
  { item: 'pearl', w: 2, name: 'Oyster (Pearl!)' },
];

// ---------------------------------------------------------------------------
// SEABED dive nodes — mine by diving deep with an Axe/Machete near a node.
// ---------------------------------------------------------------------------
export const SEABED = {
  NODE_COUNT: 14,
  RADIUS: 90,
  nodes: [
    { type: 'rock',  color: 0x808a90, loot: [['stone', 2, 4], ['clay', 0, 1]] },
    { type: 'coral', color: 0xff7f7f, loot: [['sand', 1, 3], ['fiber', 0, 2]] },
    { type: 'wreck', color: 0x6b7378, loot: [['scrap', 2, 4], ['metal', 0, 1]] },
    { type: 'oyster',color: 0xf8f0ff, loot: [['pearl', 1, 2], ['sand', 1, 2]] },
    { type: 'seep',  color: 0x222222, loot: [['oil', 1, 2]] },
  ],
};

// ---------------------------------------------------------------------------
// ISLANDS — drift in on the current; dock to harvest.
// ---------------------------------------------------------------------------
export const ISLANDS = {
  MAX: 2,
  SPAWN_EVERY: 70,          // seconds between attempts
  harvest: [
    { type: 'palm',  loot: [['wood', 2, 3], ['coconut', 1, 2]] },
    { type: 'rock',  loot: [['stone', 2, 4]] },
    { type: 'bush',  loot: [['fruit', 1, 2], ['berries', 1, 3], ['fiber', 1, 2]] },
    { type: 'chest', loot: [['metal', 1, 2], ['pearl', 1, 2], ['rations', 1, 3], ['circuit', 0, 1]] },
  ],
};

// ---------------------------------------------------------------------------
// WEATHER — cycles over time. fog/wave/light tune visuals & gameplay.
// ---------------------------------------------------------------------------
export const WEATHER = {
  clear:  { name: 'Clear',  fog: 0.0040, wave: 1.0, rain: 0, light: 1.0,  next: { clear: 0.5, cloudy: 0.5 } },
  cloudy: { name: 'Cloudy', fog: 0.0060, wave: 1.2, rain: 0, light: 0.8,  next: { clear: 0.4, cloudy: 0.3, rain: 0.3 } },
  rain:   { name: 'Rain',   fog: 0.0090, wave: 1.5, rain: 1, light: 0.6,  next: { cloudy: 0.5, rain: 0.3, storm: 0.2 } },
  storm:  { name: 'Storm',  fog: 0.0140, wave: 2.4, rain: 2, light: 0.4, lightning: 1, next: { rain: 0.6, cloudy: 0.4 } },
  MIN_DURATION: 40, MAX_DURATION: 90,
};

export const WILDLIFE = { GULLS: 10, DOLPHINS: 4, WHALES: 1, JELLYFISH: 8 };

// ---------------------------------------------------------------------------
// SHARKS — multiple species; megalodon is the boss.
// ---------------------------------------------------------------------------
export const SHARK = {
  HP: 140, SPEED: 6, CHARGE_SPEED: 13,
  BITE_DMG_TILE: 22, BITE_DMG_PLAYER: 18, SPEAR_DMG: 18,
  CIRCLE_RADIUS: 22, AGGRO_NIGHT: 1.8, FLEE_HP: 0.25,
};
export const SHARK_TYPES = {
  reef:      { name: 'Reef Shark',  hp: 80,  speed: 8,  charge: 15, biteTile: 14, bitePlayer: 12, scale: 0.8, color: 0x6688aa, loot: [['rawmeat', 1, 2], ['sharkskin', 0, 1]] },
  great:     { name: 'Great White', hp: 140, speed: 6,  charge: 13, biteTile: 22, bitePlayer: 18, scale: 1.0, color: 0x4a5a66, loot: [['rawmeat', 2, 3], ['sharkskin', 1, 2], ['bone', 0, 1]] },
  hammerhead:{ name: 'Hammerhead',  hp: 180, speed: 7,  charge: 12, biteTile: 26, bitePlayer: 16, scale: 1.1, color: 0x5b6b55, loot: [['rawmeat', 2, 4], ['sharkskin', 1, 2], ['bone', 1, 2]] },
  megalodon: { name: 'MEGALODON',   hp: 600, speed: 7,  charge: 16, biteTile: 60, bitePlayer: 45, scale: 2.6, color: 0x2b3a44, boss: true, loot: [['metal', 4, 6], ['sharkskin', 4, 6], ['bone', 3, 5], ['pearl', 2, 3]] },
};

export const EMOTES = ['👋', '👍', '😂', '❤️', '🎉', '😱', '🆘', '🍖'];

export const STARTER = {
  inventory: { wood: 6, fiber: 2, hook: 1, hammer: 1 },
  hotbar: ['hook', 'hammer', 'spear', 'rod'],
};

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
