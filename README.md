<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/drive/1KTgNMgBm1fL2bpAV83f4gZceON7B1FDQ

## Run Locally

**Prerequisites:** Node.js

1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Recent Admin Enhancements

### Analytics
- Added **Most Clicked Links** leaderboard in Site Performance.
- Added **Total Visitors** and **Traffic Counter** cards.
- Added 30-second live refresh for continuously updating analytics counters.

### Journalists
- Added **API Health Checks** panel in the Agent calibration modal.
- Added per-provider **Test API** buttons and **Test All APIs** button.
- Provider checks report online/offline status + detailed response snippets.

## End-to-End Test Checklist

1. Start the app with `npm run dev`.
2. Log in and open `#/admin/journalists`.
3. Click **New Agent**.
4. In **API Health Checks**, run **Test All APIs**.
5. Confirm each provider reports status and timestamp.
6. Open `#/admin/analytics` -> **Site Performance** and verify visitors, traffic counter, and top clicked links render.

## Documentation

- Agent diagnostics and provider troubleshooting:
  - [`docs/AGENT_OPERATIONS.md`](docs/AGENT_OPERATIONS.md)
