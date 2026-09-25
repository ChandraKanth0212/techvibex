# Demo data (Phase 7B)

Deterministic synthetic demo data for the optimisation engine.

> **SYNTHETIC_DEMO ONLY** — every object in this package is fabricated,
> deterministic demo data shaped like railway maintenance planning inputs. It is
> **never** claimed to be live Indian Railways data.

## Modules

| Module | Purpose |
| --- | --- |
| `generator.py` | Pure, seed-deterministic factories for corridors, assets, defects, tasks, resources, block requests, train movements, goods forecasts, existing blocks and Module 2 priorities. |
| `datasets.py` | `DemoDataset.build(seed)` facade + `create_demo_context(seed)` / `demo_generate_payload(seed)` convenience helpers. |
| `scenarios.py` | Self-contained worlds A–J that train specific pipeline properties. |
| `constants.py` | Departments, horizon, dataset scale and disclaimer strings. |

## Determinism

Every catalogue is a pure function of the public `seed` argument; the inner
generators derive per-family sub-seeds from fixed salts
(`deterministic_rng(seed)` / `_child_seed(seed, salt)`). Identical input + seed
produces byte-identical output — including ids, order, timestamps and JSON.

## Dataset scale (`DATASET_SCALE`, seed 0)

| Catalogue | Count |
| --- | --- |
| Corridors | 20 |
| Assets | 50 |
| Tasks | 100 |
| Defects | 50 |
| Train movements | 100 |
| Goods forecasts | 50 |
| Resources | 30 |
| Block requests | 100 (one per task) |

Tasks span the required departments ("Engineering", "Traction Distribution",
"Signal & Telecommunication"). Tasks on corridors 11–20 may require shared
resources; trains run on corridors 11–20 and goods forecasts on corridors 13–20,
so corridors 1–10 stay feasibly clear. Each data mode is `SYNTHETIC_DEMO`.

## Scenarios A–J

- **A** 3-department integrated block (needs `slot_consolidation` boost to select).
- **B** 2-department consolidation.
- **C** goods forecast advisory (WARNING) vs peak (ERROR).
- **D** protected train movement → `TRAIN_CONFLICT`.
- **E** existing approved block → `EXISTING_BLOCK_CONFLICT`.
- **F** no common integrated window + `DURATION_CONFLICT` demonstration.
- **G** shared capacity-1 resource → `RESOURCE_CONFLICT` + capacity enforcement.
- **H** `depends_on` metadata; `DEPENDENCY_CONFLICT` documented, never emitted.
- **I** replanning world-delta fixtures (documentation only; replanning out of scope).
- **J** mixed-feasibility full-pipeline smoke world.

Scenarios are data + documentation. Pipeline execution lives in
`../scripts/` and `../tests/demo/`.