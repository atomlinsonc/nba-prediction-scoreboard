// Vercel Serverless Function — GET and POST predictions
// Stores all predictions in one private Vercel Blob file (predictions.json)

import { get, put, BlobPreconditionFailedError } from '@vercel/blob';

const BLOB_PATH = 'predictions.json';
const TEAMS_PER_CONF = 15;
const MAX_WRITE_ATTEMPTS = 8;

const EAST_TEAMS = [
    "Atlanta Hawks", "Boston Celtics", "Brooklyn Nets", "Charlotte Hornets",
    "Chicago Bulls", "Cleveland Cavaliers", "Detroit Pistons", "Indiana Pacers",
    "Miami Heat", "Milwaukee Bucks", "New York Knicks", "Orlando Magic",
    "Philadelphia 76ers", "Toronto Raptors", "Washington Wizards"
];

const WEST_TEAMS = [
    "Dallas Mavericks", "Denver Nuggets", "Golden State Warriors", "Houston Rockets",
    "LA Clippers", "Los Angeles Lakers", "Memphis Grizzlies", "Minnesota Timberwolves",
    "New Orleans Pelicans", "Oklahoma City Thunder", "Phoenix Suns", "Portland Trail Blazers",
    "Sacramento Kings", "San Antonio Spurs", "Utah Jazz"
];

// Read current predictions (bypassing the CDN cache so writes show up immediately)
async function readPredictions() {
    const result = await get(BLOB_PATH, { access: 'private', useCache: false });
    if (!result || !result.stream) return { data: {}, etag: null };

    const text = await new Response(result.stream).text();
    // get() can hand back a weak ETag (W/"..."), but put's ifMatch compares against the strong form
    const etag = result.blob.etag ? result.blob.etag.replace(/^W\//, '') : null;
    return { data: text ? JSON.parse(text) : {}, etag };
}

// Write predictions back; ifMatch makes concurrent submissions retry instead of clobbering each other
async function writePredictions(data, etag) {
    await put(BLOB_PATH, JSON.stringify(data, null, 2), {
        access: 'private',
        contentType: 'application/json',
        addRandomSuffix: false,
        allowOverwrite: true,
        ...(etag ? { ifMatch: etag } : {})
    });
}

// Must be a full ranking: every team in the conference exactly once
function isValidRanking(list, teams) {
    return Array.isArray(list)
        && list.length === TEAMS_PER_CONF
        && new Set(list).size === TEAMS_PER_CONF
        && list.every(t => teams.includes(t));
}

export default async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');

    try {
        if (req.method === 'GET') {
            const { data } = await readPredictions();
            return res.status(200).json(data);
        }

        if (req.method === 'POST') {
            const { name, east, west } = req.body || {};

            if (!name || typeof name !== 'string' || name.trim().length === 0 || name.trim().length > 30) {
                return res.status(400).json({ error: 'Name is required (max 30 chars).' });
            }
            if (!isValidRanking(east, EAST_TEAMS) || !isValidRanking(west, WEST_TEAMS)) {
                return res.status(400).json({ error: 'Must rank all 15 East and all 15 West teams.' });
            }

            for (let attempt = 1; ; attempt++) {
                const { data, etag } = await readPredictions();
                data[name.trim()] = { east, west, submittedAt: new Date().toISOString() };
                try {
                    await writePredictions(data, etag);
                    return res.status(200).json({ ok: true, total: Object.keys(data).length });
                } catch (err) {
                    // Someone else saved first — wait a random beat, re-read, and try again
                    const isConflict = err instanceof BlobPreconditionFailedError || /conflict/i.test(err.message);
                    if (!isConflict || attempt >= MAX_WRITE_ATTEMPTS) throw err;
                    await new Promise(r => setTimeout(r, 150 * attempt + Math.random() * 400));
                }
            }
        }

        return res.status(405).json({ error: 'Method not allowed' });
    } catch (err) {
        console.error('API error:', err);
        return res.status(500).json({ error: 'Server error. Please try again.' });
    }
}
