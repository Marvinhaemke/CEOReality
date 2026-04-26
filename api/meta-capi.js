const crypto = require('node:crypto');

const META_GRAPH_VERSION = 'v21.0';
const PIXEL_ID = process.env.META_PIXEL_ID || '26542472978694567';
const ACCESS_TOKEN = process.env.META_CAPI_ACCESS_TOKEN;
const TEST_EVENT_CODE = process.env.META_TEST_EVENT_CODE || '';

function hash(value) {
    return crypto.createHash('sha256').update(String(value)).digest('hex');
}

// Meta requires SHA256 of normalized values. Most fields: trim + lowercase.
function hashNormalized(value) {
    if (value === undefined || value === null) return undefined;
    const s = String(value).trim().toLowerCase();
    if (!s) return undefined;
    return hash(s);
}

// Phone numbers: digits only, no leading "+", no spaces or punctuation.
function hashPhone(value) {
    if (!value) return undefined;
    const digits = String(value).replace(/\D/g, '');
    if (!digits) return undefined;
    return hash(digits);
}

// Country must be 2-letter ISO code, lowercase.
function hashCountry(value) {
    if (!value) return undefined;
    const c = String(value).trim().toLowerCase().slice(0, 2);
    if (!c) return undefined;
    return hash(c);
}

function getClientIp(req) {
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) {
        return String(forwarded).split(',')[0].trim();
    }
    if (req.headers['x-real-ip']) return String(req.headers['x-real-ip']);
    return (req.socket && req.socket.remoteAddress) || '';
}

module.exports = async function handler(req, res) {
    if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST');
        return res.status(405).json({ error: 'Method not allowed' });
    }

    if (!ACCESS_TOKEN) {
        console.error('[meta-capi] META_CAPI_ACCESS_TOKEN is not set');
        return res.status(500).json({ error: 'Server not configured' });
    }

    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});

    const {
        event_name,
        event_id,
        event_time,
        event_source_url,
        action_source = 'website',
        firstName,
        lastName,
        email,
        phone,
        city,
        state,
        country,
        zip,
        fbc,
        fbp,
        fbclid,
        custom_data
    } = body;

    if (!event_name || !event_id) {
        return res.status(400).json({ error: 'event_name and event_id are required' });
    }

    // If only fbclid is present (no fbc cookie yet), construct an fbc value per Meta's spec:
    // fb.<subdomain_index>.<creation_time_ms>.<fbclid>
    let fbcValue = fbc || undefined;
    if (!fbcValue && fbclid) {
        fbcValue = `fb.1.${Date.now()}.${fbclid}`;
    }

    const userData = {
        em: email ? [hashNormalized(email)] : undefined,
        ph: phone ? [hashPhone(phone)] : undefined,
        fn: firstName ? [hashNormalized(firstName)] : undefined,
        ln: lastName ? [hashNormalized(lastName)] : undefined,
        ct: city ? [hashNormalized(city)] : undefined,
        st: state ? [hashNormalized(state)] : undefined,
        zp: zip ? [hashNormalized(zip)] : undefined,
        country: country ? [hashCountry(country)] : undefined,
        client_ip_address: getClientIp(req) || undefined,
        client_user_agent: req.headers['user-agent'] || undefined,
        fbc: fbcValue,
        fbp: fbp || undefined
    };
    Object.keys(userData).forEach(k => {
        if (userData[k] === undefined) delete userData[k];
    });

    const event = {
        event_name,
        event_id, // must match the browser Pixel eventID for deduplication
        event_time: Number(event_time) || Math.floor(Date.now() / 1000),
        event_source_url: event_source_url || req.headers.referer || '',
        action_source,
        user_data: userData
    };
    if (custom_data && typeof custom_data === 'object') {
        event.custom_data = custom_data;
    }

    const payload = { data: [event] };
    if (TEST_EVENT_CODE) {
        payload.test_event_code = TEST_EVENT_CODE;
    }

    const url = `https://graph.facebook.com/${META_GRAPH_VERSION}/${PIXEL_ID}/events?access_token=${encodeURIComponent(ACCESS_TOKEN)}`;

    try {
        const fbRes = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await fbRes.json().catch(() => ({}));
        if (!fbRes.ok) {
            console.error('[meta-capi] Graph API error:', fbRes.status, data);
            return res.status(502).json({ error: 'CAPI rejected event', status: fbRes.status, details: data });
        }
        return res.status(200).json({ ok: true, event_id, fb: data });
    } catch (err) {
        console.error('[meta-capi] Request failed:', err);
        return res.status(500).json({ error: 'CAPI request failed' });
    }
};
