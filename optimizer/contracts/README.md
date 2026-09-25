# Temporary Contracts (Module 3)

> **TEMP. This directory is provisional.**

These Pydantic schemas are the agreed data contracts between the Optimization
Engine (Module 3), the AI Priority model (Module 2) and the Frontend (Module 4).

## Why does this exist?

The repository has no top-level `/contracts` directory yet and no shared schema
package from Module 1 / Module 2. To keep Module 3 self-contained and testable
now, the contracts live under `optimizer/contracts/`.

## Migration plan

When the shared `/contracts` directory is created at the repository root:

1. Move every `.py` module in this folder (except this README) to `/contracts`.
2. Update imports in `optimizer/app/**` and `optimizer/tests/**` from
   `from contracts import ...` to `from shared.contracts import ...`.
3. Convert this folder into a thin re-export shim so nothing breaks, then
   delete it once Modules 1 and 2 adopt the shared location.

Every consumer of these contracts should import from the top level
(`from contracts import MaintenanceTask`) so that the migration only touches
this package internals.