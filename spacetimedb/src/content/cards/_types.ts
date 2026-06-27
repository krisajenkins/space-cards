import type { Resolver } from "../../engine/verb-api";

// ──────────────────────────────────────────────────────────────────────────
// The per-card module — "everything about ONE card in one place".
//
// Each file under content/cards/ exports a single CardModule. It is the whole
// truth for that card: its catalogue entry, its holes, the recipe/research data
// that concerns it, its runtime resolver, and the achievement its first
// appearance earns. The aggregate structures the rest of the engine consumes
// (the seeded card_def/slot_def/achievement_def rows, RESOLVERS, BUILDS,
// RESEARCH_TREE, …) are PROJECTIONS over the array of these modules — see
// cards/index.ts and the derivations in catalogue.ts / recipes.ts /
// achievements.ts / opening.ts.
//
// Only the core card_def fields are required; everything else is optional and
// present only on the cards it applies to (a blueprint has `build` + `research`;
// a machine has `slots` + `resolver` + `produces`; a resource has neither).
// ──────────────────────────────────────────────────────────────────────────

// One hole on a verb card. The card supplies these without a defId; seedCatalogue
// stamps the owning card's defId on each when it inserts the slot_def rows.
export type SlotSpec = {
  slotIndex: number;
  accepts: string[];
  required: boolean;
  droneLevel: number;
};

// The Workbench build recipe a BLUEPRINT card selects: what it builds and the
// Component cost. `keep` marks a blueprint the Workbench hands back (a permanent
// manual — drones, the Solar Array) instead of consuming. Projected into BUILDS.
export type BuildSpec = { output: string; cost: number; keep?: boolean };

// The Research-bench unlock for a BLUEPRINT card. `order` is its priority in the
// research tree (the bench hands over the first qualified, undiscovered entry);
// exactly one of `need` (machine: ≥1 of each input category) / `chore` (drone:
// the tier's output categories summed ≥ count) is set. `requires` lists blueprint
// defIds that must already be discovered first. Projected into RESEARCH_TREE.
export type ResearchSpec = {
  order: number;
  need?: Record<string, number>;
  chore?: { of: string[]; count: number };
  requires?: string[];
};

// The Assembler recipe a SUBSYSTEM card is built from. `order` preserves the
// most-specific-first match order the Assembler relies on. Projected into
// SUBSYSTEMS.
export type SubsystemSpec = { order: number; need: Record<string, number> };

// How a card appears in the turn-zero deal. `station` is its left-to-right order
// among the dealt tier-0 stations; `outputs` are cards seeded into THIS card's
// own output tray at the start (each expanded `count` times). Projected into
// OPENING_STATIONS / OPENING_OUTPUTS.
export type OpeningSpec = {
  station?: number;
  outputs?: { def: string; count: number }[];
};

// A milestone earned by this card's first appearance (or, for the cross-card
// ones, owned by the card it thematically belongs to — see research/rocket).
// `earned` is the predicate over the board's lifetime card-history counts.
export type AchievementSpec = {
  achId: string;
  title: string;
  description: string;
  sort: number;
  earned: (counts: Map<string, bigint>) => boolean;
};

export type CardModule = {
  // card_def
  defId: string;
  name: string;
  category: string;
  isVerb?: boolean; // default false
  reusable?: boolean; // default = isVerb
  outputCap?: number; // default 0
  droneLevel?: number; // default 0

  slots?: SlotSpec[];

  build?: BuildSpec; // blueprint cards
  research?: ResearchSpec; // blueprint cards
  produces?: string[]; // verb cards (VERB_OUTPUTS)
  becomes?: string; // verb cards (VERB_BECOMES)
  subsystem?: SubsystemSpec; // rocket-subsystem inert cards
  wreckManifest?: string[]; // the Wreck card only (WRECK_CONTENTS)
  opening?: OpeningSpec;

  resolver?: Resolver; // verb cards

  achievement?: AchievementSpec;
};

// ──────────────────────────────────────────────────────────────────────────
// Slot-builder helpers — pure, returning SlotSpec[] for a card's `slots` field.
// These are the data-only descendants of the old seedCatalogue authoring helpers
// (verb/inert/slot/inbox/powered/droneSlot): they describe holes, they don't
// insert rows. seedCatalogue (catalogue.ts) interprets them.
// ──────────────────────────────────────────────────────────────────────────

// The drone-bay slot index, kept clear of every machine's input range so it never
// collides and the client can always find "the drone bay" by its droneLevel.
export const DRONE = 90;
// A WORKER-level bay: Effort (level 99) fits, but no buildable mechanical Mk
// does, so only manual labour can crank it (the Research bench).
export const WORKER = 99;

export const slot = (
  slotIndex: number,
  accepts: string[],
  required: boolean,
  droneLevel = 0,
): SlotSpec => ({ slotIndex, accepts, required, droneLevel });

// A drone slot (rendered top-right): takes any drone of >= minLevel. Optional,
// and NOT an input the verb consumes — the slotted drone feeds the verb's OTHER
// holes.
export const droneSlot = (minLevel: number, slotIndex = DRONE): SlotSpec =>
  slot(slotIndex, ["drone"], false, minLevel);

// A run of optional inbox holes accepting one category (a drainable queue).
export const inbox = (
  start: number,
  n: number,
  accepts: string[],
): SlotSpec[] =>
  Array.from({ length: n }, (_, i) => slot(start + i, accepts, false));

// A power-gated machine: slot 0 is the required Power hole; slots 1–3 the input
// inbox. Consuming the Power each cycle is what idles the machine when the grid
// runs dry (the Power gate).
export const powered = (inputs: string[]): SlotSpec[] => [
  slot(0, ["power"], true),
  ...inbox(1, 3, inputs),
];

// ──────────────────────────────────────────────────────────────────────────
// Achievement predicate helper — `has(counts, defId)` is "the board has ever
// created at least one of this card". Lives here (a leaf with no card imports)
// so both the per-card `earned` predicates and awardAchievements can use it
// without a content/cards ↔ content/achievements import cycle.
// ──────────────────────────────────────────────────────────────────────────
export const has = (counts: Map<string, bigint>, defId: string): boolean =>
  (counts.get(defId) ?? 0n) > 0n;
