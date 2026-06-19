import { t, SenderError } from "spacetimedb/server";
import { GOOGLE_ISSUERS, GOOGLE_CLIENT_ID } from "./constants";
import { normaliseEmail, requireCaller } from "./auth";
import spacetimedb from "./schema";
import type { Ctx } from "./types";

// ──────────────────────────────────────────────────────────────────────────
// Lifecycle
// ──────────────────────────────────────────────────────────────────────────
// Seed (or re-seed) the catalogue idempotently: wipe card_def + slot_def and
// rebuild from scratch. Safe to re-run on a LIVE database — cards reference
// card_defs by their string `defId` (not a row id) and a slotted card stores a
// `slotIndex` (not a slot_def id), so a full catalogue refresh inside one
// transaction never disturbs boards, cards or situations. This is the migration
// path for any catalogue change after first publish: `init` runs only once, so
// `reseed_catalogue` (below) re-applies this to an already-initialised DB.
function seedCatalogue(ctx: Ctx) {
  for (const s of [...ctx.db.slotDef.iter()]) ctx.db.slotDef.id.delete(s.id);
  for (const d of [...ctx.db.cardDef.iter()])
    ctx.db.cardDef.defId.delete(d.defId);
  for (const a of [...ctx.db.achievementDef.iter()])
    ctx.db.achievementDef.achId.delete(a.achId);

  // ── Catalogue authoring helpers ──────────────────────────────────────────
  const inert = (
    defId: string,
    name: string,
    category: string,
    droneLevel = 0,
  ) =>
    ctx.db.cardDef.insert({
      defId,
      name,
      category,
      isVerb: false,
      reusable: false,
      outputCap: 0,
      droneLevel,
    });
  const verb = (
    defId: string,
    name: string,
    category: string,
    outputCap: number,
    reusable = true,
    droneLevel = 0,
  ) =>
    ctx.db.cardDef.insert({
      defId,
      name,
      category,
      isVerb: true,
      reusable,
      outputCap,
      droneLevel,
    });
  const slot = (
    defId: string,
    slotIndex: number,
    accepts: string[],
    required: boolean,
    droneLevel = 0,
  ) =>
    ctx.db.slotDef.insert({
      id: 0n,
      slotIndex,
      defId,
      accepts,
      required,
      droneLevel,
    });
  // A drone slot (rendered top-right of the card): takes any drone of >= minLevel.
  // It is optional and is NOT an input the verb consumes — the slotted drone's job
  // is to feed the verb's OTHER (input) holes. Choice machines (Workshop,
  // Assembler) deliberately get no drone slot, so a drone can never force a recipe.
  const droneSlot = (defId: string, slotIndex: number, minLevel: number) =>
    slot(defId, slotIndex, ["drone"], false, minLevel);
  // A run of optional inbox holes accepting one category (a drainable queue).
  const inbox = (
    defId: string,
    start: number,
    n: number,
    accepts: string[],
  ) => {
    for (let i = 0; i < n; i++) slot(defId, start + i, accepts, false);
  };
  // A blueprint card (a "salvaged manual") — the selector the Workshop reads.
  const blueprint = (target: string, name: string) =>
    inert(`blueprint_${target}`, `Blueprint: ${name}`, "blueprint");

  // ── Resources ────────────────────────────────────────────────────────────
  // Effort IS a drone — the universal worker. It's the labour every non-emitter
  // machine needs in its bay to run: an inert worker spent one cycle at a time
  // (you, by hand), the manual counterpart to a reusable mechanical drone. Its
  // WORKER-level fits any bay (it's >= every machine's required Mk), and the two
  // choice machines use a WORKER-only bay so only Effort — never a mechanical
  // drone — can crank them. See WORKER below.
  inert("effort", "Effort", "drone", 99); // your hands; universal bay worker
  inert("power", "Power", "power"); // machine fuel (Solar Array)
  inert("regolith", "Regolith", "raw");
  inert("scrap", "Scrap", "raw");
  inert("salvage", "Salvage", "component"); // a ready-made part from the wreck
  inert("metal", "Metal", "metal");
  inert("silicon", "Silicon", "silicon");
  inert("glass", "Glass", "glass");
  inert("circuit", "Circuit", "circuit");
  inert("component", "Component", "component");
  inert("water", "Water", "water");
  inert("hydrogen", "Hydrogen", "hydrogen");
  inert("oxygen", "Oxygen", "oxygen");
  inert("fuel", "Fuel", "fuel");

  // Rocket subsystems (inert; the Assembler's outputs, the Rocket's inputs).
  inert("engine", "Engine", "subsystem");
  inert("hull", "Hull", "subsystem");
  inert("avionics", "Avionics", "subsystem");
  inert("life_support", "Life Support", "subsystem");
  inert("heat_shield", "Heat Shield", "subsystem");

  inert("escape", "Escape", "endgame"); // the win token

  // Blueprints — one per buildable machine/drone. Seeded as cards in newGame.
  blueprint("solar", "Solar Array");
  blueprint("refinery", "Refinery");
  blueprint("fabricator", "Fabricator");
  blueprint("kiln", "Kiln");
  blueprint("electronics_fab", "Electronics Fab");
  blueprint("ice_mine", "Ice Mine");
  blueprint("electrolysis", "Electrolysis");
  blueprint("chem_reactor", "Chem Reactor");
  blueprint("assembler", "Assembler");
  blueprint("rocket", "Rocket");
  blueprint("drone_1", "Drone Mk I");
  blueprint("drone_2", "Drone Mk II");
  blueprint("drone_3", "Drone Mk III");
  blueprint("drone_4", "Drone Mk IV");

  // ── Verbs (machines) ─────────────────────────────────────────────────────
  // Tier 0 — the crash site, hand-cranked (no Power):
  verb("survivor", "Survivor", "avatar", 5); // emits Effort
  verb("regolith_field", "Regolith Field", "station", 5);
  verb("wreck", "Wreck", "station", 5);
  verb("printer", "Printer", "station", 5); // crude raw → Component
  verb("workshop", "Workshop", "station", 5); // blueprint → machine/drone

  // Power, then the power-gated production line:
  verb("solar_array", "Solar Array", "station", 5); // emits Power
  verb("refinery", "Refinery", "station", 5);
  verb("fabricator", "Fabricator", "station", 5);
  verb("kiln", "Kiln", "station", 5);
  verb("electronics_fab", "Electronics Fab", "station", 5);
  verb("ice_mine", "Ice Mine", "station", 5);
  verb("electrolysis", "Electrolysis", "station", 6);
  verb("chem_reactor", "Chem Reactor", "station", 5);
  verb("assembler", "Assembler", "station", 4);

  // The Rocket: one-shot — it metamorphoses into Escape, it doesn't recycle.
  verb("rocket", "Rocket", "launchpad", 0, false);

  // Drones — hole-less verbs (outputCap 0). Slotted into a machine's drone slot,
  // a drone services that one machine: every tick it pulls a card the machine can
  // use (from the table or any output tray) into one of its empty input holes.
  // Level is a pure access gate — a higher-tier machine's slot demands a higher
  // Mk. One generic drone does any feeding job; binding to a host is what stops
  // two drones fighting over a card (each only feeds its own machine).
  verb("drone_1", "Drone Mk I", "drone", 0, true, 1);
  verb("drone_2", "Drone Mk II", "drone", 0, true, 2);
  verb("drone_3", "Drone Mk III", "drone", 0, true, 3);
  verb("drone_4", "Drone Mk IV", "drone", 0, true, 4);

  // ── Holes (slot_defs) ────────────────────────────────────────────────────
  // The drone-slot index, kept clear of every machine's input range so it never
  // collides and the client can always find "the drone bay" by its droneLevel.
  const DRONE = 90;
  // Every non-emitter machine has a bay and needs a WORKER in it to run — Effort
  // (manual, one cycle) or a mechanical drone of sufficient Mk (continuous + it
  // fetches the machine's material inputs). Emitters (Survivor, Solar) need no
  // worker; they self-run. The two CHOICE machines (Workshop, Assembler) use a
  // WORKER-level bay: Effort (level 99) fits, but no buildable Mk does, so a drone
  // can never auto-crank them and force a build/recipe choice.
  const WORKER = 99;

  // Gatherers (Mk I bay): no material input — the worker IS the input. Effort →
  // one gather; a drone → continuous.
  droneSlot("regolith_field", DRONE, 1);
  droneSlot("wreck", DRONE, 1);

  // Printer (Mk I bay): a raw inbox queue, no power.
  inbox("printer", 0, 3, ["raw"]);
  droneSlot("printer", DRONE, 1);

  // Workshop: a Blueprint (required) + a Component inbox deep enough for the
  // costliest build (the Rocket needs 6) + a WORKER-only bay (Effort cranks it).
  slot("workshop", 0, ["blueprint"], true);
  inbox("workshop", 2, 6, ["component"]);
  droneSlot("workshop", DRONE, WORKER);

  // Power-gated machines: slot 0 is the required Power hole; the rest is the
  // input inbox. Consuming the Power each cycle is what idles them when the
  // grid runs dry (the Power gate). Emitters (Solar, Survivor) have no holes.
  const powered = (defId: string, inputs: string[]) => {
    slot(defId, 0, ["power"], true);
    inbox(defId, 1, 3, inputs);
  };
  powered("refinery", ["raw"]);
  powered("fabricator", ["metal"]);
  powered("kiln", ["raw"]);
  powered("electronics_fab", ["silicon"]);
  powered("electrolysis", ["water"]);
  slot("ice_mine", 0, ["power"], true); // emitter: Power in, Water out

  // Chem Reactor: Power + a Hydrogen inbox + an Oxygen inbox.
  slot("chem_reactor", 0, ["power"], true);
  inbox("chem_reactor", 1, 2, ["hydrogen"]);
  inbox("chem_reactor", 3, 2, ["oxygen"]);

  // Drone bays on the power line. Mk II for the first powered tier, Mk III for the
  // electronics + chemistry tier. The Assembler gets a WORKER-only bay (below) —
  // it's a choice machine, so only Effort cranks it.
  droneSlot("refinery", DRONE, 2);
  droneSlot("fabricator", DRONE, 2);
  droneSlot("kiln", DRONE, 2);
  droneSlot("ice_mine", DRONE, 2);
  droneSlot("electronics_fab", DRONE, 3);
  droneSlot("electrolysis", DRONE, 3);
  droneSlot("chem_reactor", DRONE, 3);

  // Assembler: Power + roomy inboxes for every subsystem ingredient. Sized to
  // the hungriest recipe per category: Hull wants 5 Components, Avionics 4
  // Circuits, Heat Shield 2 Glass, Life Support 1 Water.
  slot("assembler", 0, ["power"], true);
  inbox("assembler", 1, 6, ["component"]);
  inbox("assembler", 7, 4, ["circuit"]);
  inbox("assembler", 11, 2, ["glass"]);
  slot("assembler", 13, ["water"], false);
  droneSlot("assembler", DRONE, WORKER); // WORKER-only: you crank each assembly

  // Rocket: all five subsystems plus three Fuel, every hole required — it only
  // fires when the whole craft is complete.
  slot("rocket", 0, ["engine"], true);
  slot("rocket", 1, ["hull"], true);
  slot("rocket", 2, ["avionics"], true);
  slot("rocket", 3, ["life_support"], true);
  slot("rocket", 4, ["heat_shield"], true);
  slot("rocket", 5, ["fuel"], true);
  slot("rocket", 6, ["fuel"], true);
  slot("rocket", 7, ["fuel"], true);
  // The capstone bay (Mk IV): a top-tier drone flies finished subsystems + fuel
  // into the launchpad so the final assembly runs itself.
  droneSlot("rocket", DRONE, 4);

  // ── Achievements ───────────────────────────────────────────────────────
  // The display content of each milestone. The condition that earns it is code
  // (achievements.ts), keyed by the same achId; `sort` orders the trophy shelf
  // roughly along the gather → refine → fabricate → automate → escape arc.
  const achievement = (
    achId: string,
    title: string,
    description: string,
    sort: number,
  ) => ctx.db.achievementDef.insert({ achId, title, description, sort });

  achievement("prospector", "Prospector", "Gather your first Regolith.", 0);
  achievement(
    "power_up",
    "Let There Be Light",
    "Generate your first Power.",
    1,
  );
  achievement("industrialist", "Industrialist", "Build your first machine.", 2);
  achievement(
    "automation",
    "Hands Off",
    "Build your first drone and let it work for you.",
    3,
  );
  achievement("chemist", "Rocket Fuel", "Refine your first Fuel.", 4);
  achievement(
    "launch_ready",
    "All Systems Go",
    "Fabricate all five rocket subsystems.",
    5,
  );
  achievement(
    "escape",
    "Escape the Moon",
    "Launch the rocket and escape. You win.",
    6,
  );
}

export const init = spacetimedb.init((ctx) => seedCatalogue(ctx));

// Admin-only catalogue migration. `init` runs only on first publish, so after a
// catalogue change a plain (data-preserving) republish leaves the old card_def /
// slot_def rows in place. Calling this re-applies seedCatalogue idempotently —
// the fix path for a live database without wiping anyone's game.
export const reseedCatalogue = spacetimedb.reducer((ctx) => {
  const { user: me } = requireCaller(ctx);
  if (!me.isAdmin) throw new SenderError("admin only");
  seedCatalogue(ctx);
});

// Auto-link trusted (Google) logins on connect. Connecting is permissive — any
// principal may open a socket — but the `identity` table is the gate: only a
// linked principal can do anything (see reducers below). Untrusted providers
// (e.g. SpacetimeAuth CLI tokens) are NOT auto-linked; they link explicitly via
// `bootstrap_first_admin` / a future "link account" reducer. See doc §11.
export const onConnect = spacetimedb.clientConnected((ctx) => {
  const jwt = ctx.senderAuth.jwt;

  // Trust check: BOTH issuer and audience (issuer alone would accept a token
  // minted for a different app by the same IdP).
  const isGoogle =
    jwt !== null &&
    GOOGLE_ISSUERS.includes(jwt.issuer) &&
    jwt.audience.includes(GOOGLE_CLIENT_ID);

  const payload = jwt?.fullPayload ?? null;
  const email = normaliseEmail(payload?.["email"]);
  const pictureClaim = payload?.["picture"];
  const pictureUrl =
    typeof pictureClaim === "string" ? pictureClaim : undefined;
  const nameClaim = payload?.["name"];
  const displayName =
    typeof nameClaim === "string" && nameClaim.trim().length > 0
      ? nameClaim.trim()
      : (email?.split("@")[0] ?? "Player");

  const existing = ctx.db.identity.id.find(ctx.sender);

  // Known principal → refresh ONLY provider-owned fields (email, picture).
  // Never re-sync displayName: the human owns that once they've edited it.
  if (existing !== null) {
    if (!isGoogle || email === null) return;
    const u = ctx.db.user.id.find(existing.userId);
    if (u === null) return;
    // Email rotation: skip the email change if that address now belongs to a
    // DIFFERENT user (would violate the unique constraint); still refresh picture.
    const collision = ctx.db.user.primaryEmail.find(email);
    const nextEmail =
      collision !== null && collision.id !== u.id ? u.primaryEmail : email;
    ctx.db.user.id.update({
      ...u,
      primaryEmail: nextEmail,
      pictureUrl: pictureUrl ?? u.pictureUrl,
    });
    return;
  }

  // New principal. Only auto-link providers we trust to assert a verified email.
  if (!isGoogle || email === null) return;

  // Find-or-create the user by email, then attach this principal. This is what
  // merges providers: an existing user with that email (CLI bootstrap, prior
  // login) gets a second identity rather than forking a second human.
  const existingUser = ctx.db.user.primaryEmail.find(email);
  const userId =
    existingUser?.id ??
    ctx.db.user.insert({
      id: 0n,
      primaryEmail: email,
      displayName,
      pictureUrl,
      isAdmin: false,
      createdAt: ctx.timestamp,
    }).id;

  ctx.db.identity.insert({
    id: ctx.sender,
    userId,
    provider: { tag: "Google" },
    linkedAt: ctx.timestamp,
  });
});

export const onDisconnect = spacetimedb.clientDisconnected((_ctx) => {});

// Explicit linking for non-auto providers (the CLI / SpacetimeAuth path), which
// also bootstraps the first admin. Find-or-create the same user the web login
// resolves to (by email), link THIS principal, and flip isAdmin. One-shot: it
// refuses once any admin exists, so it closes itself. See doc §5.
export const bootstrapFirstAdmin = spacetimedb.reducer(
  { email: t.string() },
  (ctx, { email }) => {
    for (const u of ctx.db.user.iter()) {
      if (u.isAdmin)
        throw new SenderError("An admin already exists; bootstrap is closed.");
    }
    const trimmed = normaliseEmail(email);
    if (trimmed === null)
      throw new SenderError("requires the human's primary email.");

    const target =
      ctx.db.user.primaryEmail.find(trimmed) ??
      ctx.db.user.insert({
        id: 0n,
        primaryEmail: trimmed,
        displayName: trimmed.split("@")[0] ?? trimmed,
        pictureUrl: undefined,
        isAdmin: false,
        createdAt: ctx.timestamp,
      });

    const existing = ctx.db.identity.id.find(ctx.sender);
    if (existing === null) {
      ctx.db.identity.insert({
        id: ctx.sender,
        userId: target.id,
        provider: { tag: "Spacetime" },
        linkedAt: ctx.timestamp,
      });
    } else if (existing.userId !== target.id) {
      throw new SenderError(
        "This identity is already linked to a different user.",
      );
    }

    ctx.db.user.id.update({ ...target, isAdmin: true });
  },
);
