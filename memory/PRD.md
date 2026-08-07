# TCG Vision — AI Real-time Pokémon Card Price Checker

## Overview
Mobile app (Expo React Native) intended to be mounted on a stand. It uses the phone's live camera feed to continuously identify Pokémon TCG cards in view via AI vision, fetches real-time market prices from the Pokémon TCG API, and supports a hands-free voice conversation loop (push-to-talk hold) with GPT-5.2 that understands the current card in view.

## Tech Stack
- Frontend: Expo SDK 54, expo-router (file-based tabs), expo-camera, expo-audio, expo-blur, expo-haptics, expo-image, @gorhom/bottom-sheet
- Backend: FastAPI + MongoDB (motor)
- AI: emergentintegrations (Emergent Universal LLM Key)
  - Vision: GPT-5.2 (openai) for card identification
  - Chat: GPT-5.2 (openai) for voice replies
  - STT: OpenAI whisper-1
  - TTS: OpenAI tts-1 (voice: nova)
- Data: pokemontcg.io v2 API (free, no key required for public reads)

## Screens (Tabs)
1. Scanner (index) — full-bleed camera; corner reticle; auto-scan every 6s + manual scan button; frosted glass voice pill at top; bottom glassmorphic card panel with name, set, number, rarity, HP, confidence, and market/low/mid/high price grid; large hold-to-talk mic button.
2. History — reverse-chronological list of scanned cards with thumbnail, name/set/number, timestamp, and price. Pull-to-refresh, clear-all.
3. Settings — read-only tactical info about scanner cadence, voice, model, and data source.

## Backend API (all under /api)
- GET  /health — key/status
- POST /scan-card { image_base64 } → identify + fetch price → save to Mongo
- GET  /history?limit=50 → recent scans
- DELETE /history → wipe history
- POST /voice/transcribe (multipart file) → whisper transcript
- POST /voice/chat { text, card_context } → GPT-5.2 reply text + TTS mp3 base64

## Key Behaviors
- Continuous scan loop captures a low-quality frame every 6s and calls /scan-card. Manual scan button also available.
- Voice: press and hold mic → record m4a → release → transcribe → chat with card context → play back TTS via data URI.
- Card context includes the last identified card so the assistant can reference name, set, and market price.

## Business Enhancement Idea
Add a "Deal Alert" mode: when a card's live market price crosses a user-set threshold (e.g., a Charizard at $250 mid), the app plays a distinct sound and buzzes — turning the stand into a passive live-price monitor for collectors sorting bulk.
