import { t, SenderError } from "spacetimedb/server";
import { GOOGLE_ISSUERS, GOOGLE_CLIENT_ID } from "./constants";
import { normaliseEmail } from "./auth";
import spacetimedb from "./schema";

// ──────────────────────────────────────────────────────────────────────────
// Lifecycle
// ──────────────────────────────────────────────────────────────────────────
export const init = spacetimedb.init((ctx) => {
  // ── Catalogue authoring helpers ──────────────────────────────────────────
  const inert = (defId: string, name: string, category: string) =>
    ctx.db.cardDef.insert({
      defId,
      name,
      category,
      isVerb: false,
      reusable: false,
      outputCap: 0,
    });
  const verb = (
    defId: string,
    name: string,
    category: string,
    outputCap: number,
    reusable = true,
  ) =>
    ctx.db.cardDef.insert({
      defId,
      name,
      category,
      isVerb: true,
      reusable,
      outputCap,
    });
  const slot = (
    defId: string,
    slotIndex: number,
    accepts: string[],
    required: boolean,
  ) => ctx.db.slotDef.insert({ id: 0n, slotIndex, defId, accepts, required });
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
  inert("effort", "Effort", "effort"); // your hands (Survivor)
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

  // Catalyst drones — inert cards that slot into a gatherer to make it self-run.
  inert("mining_drone", "Mining Drone", "drone");
  inert("survey_drone", "Survey Drone", "drone");

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
  blueprint("mining_drone", "Mining Drone");
  blueprint("survey_drone", "Survey Drone");
  blueprint("hauler", "Hauler Drone");
  blueprint("feeder", "Feeder Drone");
  blueprint("fitter", "Fitter Drone");
  blueprint("tanker", "Tanker Drone");
  blueprint("cargo", "Cargo Drone");

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

  // Couriers — hole-less, outputCap 0 (they carry in transit, never tray).
  verb("hauler", "Hauler Drone", "courier", 0);
  verb("feeder", "Feeder Drone", "courier", 0);
  verb("fitter", "Fitter Drone", "courier", 0);
  verb("tanker", "Tanker Drone", "courier", 0);
  verb("cargo", "Cargo Drone", "courier", 0);

  // ── Holes (slot_defs) ────────────────────────────────────────────────────
  // Gatherers: one required hole taking Effort OR the matching catalyst drone.
  slot("regolith_field", 0, ["effort", "mining_drone"], true);
  slot("wreck", 0, ["effort", "survey_drone"], true);

  // Printer: a raw inbox queue, no power.
  inbox("printer", 0, 3, ["raw"]);

  // Workshop: a Blueprint + Effort (both required) + a Component inbox.
  slot("workshop", 0, ["blueprint"], true);
  slot("workshop", 1, ["effort"], true);
  inbox("workshop", 2, 3, ["component"]);

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

  // Assembler: Power + roomy inboxes for every subsystem ingredient.
  slot("assembler", 0, ["power"], true);
  inbox("assembler", 1, 6, ["component"]);
  inbox("assembler", 7, 3, ["circuit"]);
  inbox("assembler", 10, 2, ["glass"]);
  slot("assembler", 12, ["water"], false);

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
