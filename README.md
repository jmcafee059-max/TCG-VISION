# Here are your Instructions

## Production (APK) notes
The Android APK cannot bundle and run the Python FastAPI backend inside the app.
For a built APK to work, deploy the backend to a reachable HTTPS URL and configure the app to use it.

Backend required environment variables (set these in your hosting provider):
- `LLM_API_KEY` (or `OPENAI_API_KEY`) — used for OpenAI Vision
- `JUSTTCG_API_KEY` — used for JustTCG pricing
- `MONGO_URL` (optional; backend can run without DB for scanning)
- `DB_NAME` (optional)

Frontend build config:
- Set `EXPO_PUBLIC_BACKEND_URL` to your deployed backend base URL (example: `https://your-service.onrender.com`).
- For EAS builds, update `frontend/eas.json` `production.env.EXPO_PUBLIC_BACKEND_URL`.

Local dev:
- You can still run backend + Expo together via `frontend\npm run start` (starts both).
