# Woolwich — Vision

*A north-star document, not a buildable spec. Captured 2026-08-19 from design
discussion. Each sub-project below gets its own spec → plan → implementation
cycle when its time comes.*

## The game

A two-layer Cold War → modern era war game:

- **Strategic layer (HoI4-style):** factories, production lines, equipment
  pools, research, division templates, and frontlines that grind as a
  numbers engine. This is *the* game — playable end to end with every battle
  auto-resolved.
- **Instanced operational battles (Total War-style jump-in):** when a
  frontline confrontation matters, the player can drop into a real-time
  operational battle fought with the woolwich physics simulation. The
  strategic clock pauses; every other sector keeps auto-resolving. The AI
  opponent never jumps in — it always plays the numbers game; in an
  instanced battle it is the opposing battle commander.

The player advantage from fighting battles personally is a **feature**: let
quiet sectors grind, personally command the breakthrough. The rhythm is the
reward.

## Why woolwich

Most RTS combat is hitscan with a damage roll. Woolwich's projectiles
actually fly, and that single property generates the distinctive gameplay:

- **Time-of-flight is gameplay.** A shell at 20 km takes ~40 s to arrive:
  leading targets, firing at predicted positions, shoot-and-scoot before
  counter-battery fire lands on your old position.
- **Counter-battery radar is real math.** The physics is deterministic, so a
  radar observing points of an incoming arc can genuinely back-solve the
  launch position — the game mechanic is the real-world mechanism.
- **The era arc is an information war, not a damage war.** The gun barely
  changed after 1960; what changed is finding targets and hitting them
  precisely. Research progression: better spotters → drones → guided shells
  → loitering munitions. In physics terms, guidance is an extra acceleration
  term — dumb shell, rocket-assisted, and guided rounds are three force
  models sharing one integrator.

## Combat model: two tiers

**Rule of thumb: if time-of-flight is long enough for a counter-decision,
simulate it; otherwise roll it.**

- **Rolled (instant):** rifles, machine guns, autocannons, short-range tank
  guns. Range/line-of-sight checks and DPS with modifiers (cover,
  suppression, era optics). Cheap at any unit count.
- **Simulated (a real `ProjectileState` in flight):** howitzers, mortars,
  MLRS, ATGMs, cruise missiles, SAMs, interceptors. Dozens in the air at
  once, each a tactical object — spottable, dodgeable, interceptable,
  back-solvable.
- Boundary cases are opportunities: long-range tank shots simulated so lead
  matters (fire-control computers as era tech); ATGMs as the crossover star
  (wire-guided needs line-of-sight held, fire-and-forget doesn't).
- The tiers meet at damage/suppression application: a simulated shell
  landing applies rolled-tier suppression in a radius.

## Operational battle layer

- **Abstracted stands:** one entity = a platoon/section (3-4 vehicles or
  ~30 men). Battlegroup ≈ 15-20 stands; a large engagement ≈ 50-100 stands
  per side. Maps 10-30 km across.
- **Stand state vector, not hit points:** strength (degrades rolls),
  cohesion/suppression (artillery's real job — breaking units without
  destroying them), ammo/fuel (a battery that fired 200 rounds needs a
  resupply truck, and that truck is a target).
- **Contact-based fog of war:** you don't see units, you see aging contact
  reports ("armor, company strength, grid 4512"). Firing a 30-second shell
  at a 2-minute-stale contact is the game's core tension. Recon is the
  resource being fought over.
- **No in-battle base building or economy.** Deployment from the strategic
  layer's order of battle.

## Strategic layer

- HoI4-style: civilian/military industry, production lines with efficiency,
  equipment variants and stockpiles, research/doctrine trees, division
  (battlegroup) template designer.
- **Losses are real:** equipment destroyed in battles comes out of pools
  that took factory-months to fill. Old equipment lingers in reserve
  divisions — 1960s tanks meeting 1980s ATGMs because that's what the pool
  holds.
- Frontline combat is a coarse **statistical version of the same
  stand-vs-stand math** the real battles use — one combat model, two
  resolutions — so auto-resolve and instanced outcomes stay on the same
  scale and the player advantage stays bounded.

## The bridge

- **Battle generation from strategic state:** terrain from the map region,
  weather from the campaign, engaged divisions' stands from their templates
  and their *actual* current equipment and strength.
- **Results flow back:** equipment losses to pools, cohesion damage to
  divisions, progress on the frontline combat; battle time maps to hours of
  strategic time.
- The layers share **data, not code**: equipment definitions, stand
  templates, order of battle. Define this schema early; both layers grow
  toward it.

## Build order

1. **Operational battle layer** — playable standalone as skirmish; the novel
   part; woolwich's direct growth path (terrain, stands, contacts, the
   fire → spot → counter-battery loop first).
2. **Strategic layer** — playable standalone as a HoI4-lite auto-resolve
   game.
3. **Bridge** — smallest, built last, touches both.

## Open questions

- Strategic map: fictional theater (two invented blocs, far less content to
  author) vs. real-world nations.
- Multiplayer ambitions — if ever wanted, deterministic lockstep should be
  baked into the battle sim from the start (the fixed-timestep deterministic
  core already points this way).
- Exact era bounds and whether the campaign spans decades of research time.

## Current state

v1 is an interactive artillery physics playground: deterministic 3D
ballistics core (gravity, quadratic drag, wind; semi-implicit Euler at
1/120 s) shared between live simulation and prediction, side + top-down
canvas views, slider controls and time controls. The physics core is
renderer-independent and becomes the simulated tier of the battle layer
unchanged; guidance and terrain-aware impact (`z <= terrain(x, y)`) are its
next growth steps.
