# SIH26062 Presentation & Pitch Guide

## Problem Statement
**Problem ID**: SIH26062  
**Title**: Digital Twin Engine for Antarctic Operations & Emergency Dispatch (Maitri & Bharati Stations)  
**Domain**: Defense & Extreme Environment Logistics

## Key Innovation Highlights

1. **Zero Mock Data Architecture**:
   - Every metric (Survival Days, Personnel on Field, Cargo Manifests, live Open-Meteo Antarctic Weather) is dynamically computed from live DB state & real APIs.
2. **Autonomous Emergency SOS Dispatch**:
   - Computes Haversine distance to dispatch nearest available responder with required skill (`doctor`, `mechanic`, `pilot`) and vehicle.
   - Enforces 10-minute location freshness filter to prevent dispatching inactive/stale personnel.
3. **Cryptographic Audit Chain**:
   - Every critical event (user registration, inventory add, SOS dispatch) generates a SHA-256 hash linked to previous audit entry. Verified via `GET /audit/verify`.
4. **Role Security**:
   - Self-registration is strictly hardcoded to `Team Member`. Only Expedition Leaders can provision administrative/officer accounts or change roles.
5. **Offline-First Resilience**:
   - Mobile client caches station summary with `AsyncStorage` and displays a non-intrusive offline state indicator during network dropouts.
