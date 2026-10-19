# NBA JAM Predictions

Season prediction scoreboard for the NBA 2026-27 season. Players enter their name and rank all 15 teams in each conference; the leaderboard scores everyone against live ESPN standings once the regular season starts.

- `index.html`: the whole front end (static page)
- `api/predictions.js`: Vercel serverless function that reads and saves predictions
- Predictions are stored in a private Vercel Blob store (`predictions.json`), connected to the Vercel project via `BLOB_READ_WRITE_TOKEN`

Scoring: for each team, accuracy = (14 − |predicted seed − actual seed|) / 14. A player's score is the average across all teams, East and West weighted equally.
