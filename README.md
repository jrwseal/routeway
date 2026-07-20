<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/8b6d252f-a99f-4f04-b999-b60e8c3ffe22

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Default login

On first run, an admin account is seeded automatically: username `admin`, password `admin123`. Change this password (or create a new admin and delete this one) before using the app with real data — see the "จัดการคนขับ" panel is for driver accounts only; there's currently no in-app way to change the admin's own password, so do it directly against the `users` table if needed.
