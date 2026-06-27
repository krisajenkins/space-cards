import type { CardModule } from "./_types";
import type { Resolver } from "../../engine/verb-api";
import { registerCards } from "../recipes";

// ──────────────────────────────────────────────────────────────────────────
// The card registry — every card the game knows, one import per file.
//
// CARDS is the single array the rest of the content layer projects from:
// seedCatalogue (catalogue.ts) walks it for the card_def / slot_def /
// achievement_def rows; recipes.ts derives BUILDS / RESEARCH_TREE / SUBSYSTEMS /
// the Wreck manifest / the produces+becomes relations from it; achievements.ts
// derives the milestone predicates; opening.ts the turn-zero deal; and RESOLVERS
// (below) the per-verb behaviour the engine runs. To add a card: write one file
// here and add it to the array.
// ──────────────────────────────────────────────────────────────────────────

// ── Resources (inert) ──────────────────────────────────────────────────────
import { effort } from "./effort";
import { power } from "./power";
import { regolith } from "./regolith";
import { scrap } from "./scrap";
import { salvage } from "./salvage";
import { metal } from "./metal";
import { silicon } from "./silicon";
import { glass } from "./glass";
import { circuit } from "./circuit";
import { component } from "./component";
import { water } from "./water";
import { hydrogen } from "./hydrogen";
import { oxygen } from "./oxygen";
import { fuel_tank } from "./fuel_tank";
import { fuel } from "./fuel";
import { engine } from "./engine";
import { hull } from "./hull";
import { avionics } from "./avionics";
import { life_support } from "./life_support";
import { heat_shield } from "./heat_shield";
import { escape } from "./escape";
import { warehouse } from "./warehouse";
import { exhausted_wreck } from "./exhausted_wreck";

// ── Blueprints ─────────────────────────────────────────────────────────────
import { blueprint_solar } from "./blueprint_solar";
import { blueprint_refinery } from "./blueprint_refinery";
import { blueprint_fabricator } from "./blueprint_fabricator";
import { blueprint_kiln } from "./blueprint_kiln";
import { blueprint_electronics_fab } from "./blueprint_electronics_fab";
import { blueprint_ice_mine } from "./blueprint_ice_mine";
import { blueprint_electrolysis } from "./blueprint_electrolysis";
import { blueprint_chem_reactor } from "./blueprint_chem_reactor";
import { blueprint_assembler } from "./blueprint_assembler";
import { blueprint_rocket } from "./blueprint_rocket";
import { blueprint_warehouse } from "./blueprint_warehouse";
import { blueprint_drone_1 } from "./blueprint_drone_1";
import { blueprint_drone_2 } from "./blueprint_drone_2";
import { blueprint_drone_3 } from "./blueprint_drone_3";
import { blueprint_drone_4 } from "./blueprint_drone_4";

// ── Verbs (machines) ───────────────────────────────────────────────────────
import { survivor } from "./survivor";
import { regolith_field } from "./regolith_field";
import { wreck } from "./wreck";
import { printer } from "./printer";
import { workbench } from "./workbench";
import { research } from "./research";
import { solar_array } from "./solar_array";
import { refinery } from "./refinery";
import { fabricator } from "./fabricator";
import { kiln } from "./kiln";
import { electronics_fab } from "./electronics_fab";
import { ice_mine } from "./ice_mine";
import { electrolysis } from "./electrolysis";
import { chem_reactor } from "./chem_reactor";
import { assembler } from "./assembler";
import { rocket } from "./rocket";

// ── Drones ─────────────────────────────────────────────────────────────────
import { drone_1 } from "./drone_1";
import { drone_2 } from "./drone_2";
import { drone_3 } from "./drone_3";
import { drone_4 } from "./drone_4";

export const CARDS: CardModule[] = [
  // Resources
  effort,
  power,
  regolith,
  scrap,
  salvage,
  metal,
  silicon,
  glass,
  circuit,
  component,
  water,
  hydrogen,
  oxygen,
  fuel_tank,
  fuel,
  engine,
  hull,
  avionics,
  life_support,
  heat_shield,
  escape,
  warehouse,
  exhausted_wreck,
  // Blueprints
  blueprint_solar,
  blueprint_refinery,
  blueprint_fabricator,
  blueprint_kiln,
  blueprint_electronics_fab,
  blueprint_ice_mine,
  blueprint_electrolysis,
  blueprint_chem_reactor,
  blueprint_assembler,
  blueprint_rocket,
  blueprint_warehouse,
  blueprint_drone_1,
  blueprint_drone_2,
  blueprint_drone_3,
  blueprint_drone_4,
  // Verbs
  survivor,
  regolith_field,
  wreck,
  printer,
  workbench,
  research,
  solar_array,
  refinery,
  fabricator,
  kiln,
  electronics_fab,
  ice_mine,
  electrolysis,
  chem_reactor,
  assembler,
  rocket,
  // Drones
  drone_1,
  drone_2,
  drone_3,
  drone_4,
];

// The resolver table — one entry per verb defId, projected from each card's own
// `resolver`. Read by the engine (engine.ts) and completeSituation (schema.ts).
export const RESOLVERS: Record<string, Resolver> = Object.fromEntries(
  CARDS.filter((c) => c.resolver).map((c) => [c.defId, c.resolver!]),
);

// Hand the registry to recipes.ts (which derives BUILDS / RESEARCH_TREE / … from
// it). Injected rather than imported THERE so recipes.ts stays a runtime sink and
// the cards ↔ verb-api ↔ recipes import cycle never forms. Runs at module load,
// before any reducer reads a recipe getter.
registerCards(CARDS);
