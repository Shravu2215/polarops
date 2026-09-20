# PolarOps: Digital Twin of Expedition

## What we are building (in plain words)
A mobile app for teams going on Antarctic research expeditions (Indian stations Maitri and Bharati). It helps them plan the trip, track cargo and supplies, know where people are, and respond to emergencies. The big problem: there is almost no internet in Antarctica, so the app must work offline and sync later.

This is for Smart India Hackathon, problem SIH26062 (Ministry of Earth Sciences). We have 3 days, so keep everything simple, working and demo-able. A working demo beats a fancy half-built one.

## Users (4 roles)
- Expedition Leader: sees everything, approves plans, handles emergencies
- Logistics Officer: updates cargo and inventory
- Base Admin: manages stock at a station
- Team Member: checks in, sends SOS

## Tech stack
- Mobile app: Expo (React Native, TypeScript), Expo Router. Use a development build if a native module needs it.
- Backend: Python FastAPI
- Database: PostgreSQL (run with Docker Compose). Use a simple lat/long distance formula for "nearest", no PostGIS for now.
- Messaging: MQTT (Mosquitto). SOS uses QoS 2, cargo updates QoS 1, everything else QoS 0. This is our "priority sync".
- Optimization: Google OR-Tools (loading optimizer and dispatch)
- Simulation: NumPy Monte Carlo (1000 runs)
- Weather: Open-Meteo API (fallback to mock data if it fails)
- Audit log: SHA-256 hash chain. Every entry stores its hash and the previous hash. Signing with Ed25519 only if time is left.
- Stretch goals (only after everything else works): CRDT merge (Yjs), offline map tiles (MapLibre)

## Features
Core: login with roles, expedition planner, inventory, cargo tracking, team list, SOS alert.

Unique features (this is what makes us different):
1. Cold-adjusted forecast: fuel and ration needed = team size x days x base rate x cold factor. The colder the temperature, the bigger the factor. A temperature slider in the app changes the numbers live.
2. Survival days: how many days the current stock lasts for the current team size.
3. What-if simulator: "ship is 5 days late" or "blizzard lasts 3 days". Run 1000 random simulations and show the probability of running out of stock, before vs after.
4. Priority sync: app shows link status (Online / Low / Offline). Offline actions go into a local queue. When the link returns, sync in this order: SOS, then cargo, then the rest.
5. Skill-based dispatch: on SOS, find the nearest person with the needed skill (doctor, mechanic, pilot) and a suitable vehicle. Use OR-Tools or a simple scoring function.
6. Loading optimizer: given ship weight and volume limits, choose which items to pack first (critical items first). Use OR-Tools knapsack.
7. Tamper-proof audit log: every important action is logged in a hash chain. A "Verify" button checks the chain. If any entry is edited, show it in red.
8. Lighter features (basic version is fine): environmental compliance tracker (items in vs waste returned), cold-chain alerts, smart item substitution, duty-hours tracker, season-window planner.

Future scope (do NOT build, only mention in docs): predictive maintenance, peer-to-peer sync, lessons-learned engine.

## Screens
Login, Home, Inventory + Forecast, SOS/Emergency, Team, More (menu), Planner, Cargo, Simulator, Compliance + Audit.
Bottom tab bar: Home, Inventory, big red SOS button in the center, Team, More.
Top bar on every screen: title, sync status chip, notification bell.
Design screenshots are in /docs/design. Match them.

## Design rules
Light, bright, polar theme. Not dark mode.
- Background #F4F8FB, cards #FFFFFF with 1px border #DCE6EE
- Primary glacier blue #2B6F9E, ice blue #DCEEF6
- Text #12263A, secondary text #5B7083
- Accent orange #F26B21, danger red #D64545 (only SOS and alerts), ok green #2E9E7A, warning amber #E8A317
- Font DM Sans, corner radius 12, flat design, no gradients, no glow, no emojis
- Buttons at least 48px tall (usable with gloves)
- All colors live in one file, mobile/theme.ts. Never hardcode colors.

## Folder structure
/mobile   Expo app
/backend  FastAPI app (routers, services, models)
/docs     design screenshots, PPT, diagrams
docker-compose.yml  (postgres + mosquitto + backend)

## Rules for you (the coding agent)
- Keep code simple, readable, well named. No over-engineering.
- One feature at a time. After each one, tell me how to run and test it.
- Formulas and rules only. No machine learning.
- Use realistic seed data (Maitri, Bharati, diesel drums, ration packs, generators, Sno-Cat vehicles, a doctor, a mechanic, a pilot).
- If something is unclear or too big for 3 days, ask me or suggest a simpler version instead of guessing.
- Small, frequent git commits.
