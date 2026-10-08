// Netlify Function: POST /api/roast
// Keeps the Gemini API key on the server (set GEMINI_API_KEY in Netlify's
// environment variables) so it is never shipped to the browser.
// The prompt lives here too, so this endpoint can only produce chef roasts
// and can't be used as a free general-purpose Gemini proxy.

const GEMINI_MODEL = 'gemini-flash-latest';
// A 1024px JPEG from the app is well under this; reject anything bigger
const MAX_IMAGE_BASE64_LENGTH = 2_000_000;

const PROMPT = "You are a dramatic, snooty, Gordon Ramsay-esque food critic. Look at this image. If it is a hot dog, critique its plating, bun quality, and toppings (be tough), then suggest a fancy beverage pairing. If it is NOT a hot dog, identify what it is and sarcastically roast the user for trying to pass it off as a hot dog. Keep it short (max 2 sentences) and funny.";

const json = (body, status = 200) => new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
});

export default async (req) => {
    if (req.method !== 'POST') {
        return json({ error: 'Method not allowed' }, 405);
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        console.error('GEMINI_API_KEY is not set');
        return json({ error: 'Server is missing its Gemini API key' }, 500);
    }

    let image;
    try {
        ({ image } = await req.json());
    } catch {
        return json({ error: 'Invalid JSON' }, 400);
    }
    if (typeof image !== 'string' || !image || image.length > MAX_IMAGE_BASE64_LENGTH) {
        return json({ error: 'Expected a base64 JPEG in "image"' }, 400);
    }

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify({
            contents: [{
                parts: [
                    { text: PROMPT },
                    { inlineData: { mimeType: 'image/jpeg', data: image } }
                ]
            }]
        })
    });

    if (!response.ok) {
        // Log Gemini's details server-side; don't echo them to the browser
        console.error(`Gemini error ${response.status}: ${await response.text()}`);
        return json({ error: 'Gemini request failed' }, 502);
    }

    const data = await response.json();
    // Missing when the response was blocked by safety filters
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
        return json({ error: 'Empty response from Gemini' }, 502);
    }

    return json({ text });
};

export const config = { path: '/api/roast' };
