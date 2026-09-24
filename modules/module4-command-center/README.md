# Module 4 — Command Center Frontend

*Owner: Module 4 Developer*

## Responsibilities
* Interactive GIS Map Dashboard (Mapbox / Leaflet) showing real-time train movement.
* Situational awareness views, signal aspect displays, and delay heatmaps.
* Manual dispatcher override controls & optimization proposal preview.

## Data Contracts Integration
* Subscribes to live WebSocket telemetry stream from Module 1 (`ws://localhost:8000/api/v1/streams/telemetry`).
* Consumes REST API endpoints from Module 1 for station, section, and disruption metadata.
