exports.handler = async function(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  let body;
  try { body = JSON.parse(event.body); } catch(e) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid request body' }) };
  }

  const { username, apiKey, clientIp } = body;
  if (!username || !apiKey || !clientIp) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing required fields' }) };
  }

  const https = require('https');

  function fetchPage(page) {
    return new Promise((resolve, reject) => {
      const url = `https://api.namecheap.com/xml.response?ApiUser=${encodeURIComponent(username)}&ApiKey=${encodeURIComponent(apiKey)}&UserName=${encodeURIComponent(username)}&ClientIp=${encodeURIComponent(clientIp)}&Command=namecheap.domains.getList&PageSize=100&Page=${page}`;
      https.get(url, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => resolve(data));
      }).on('error', reject);
    });
  }

  try {
    const firstPage = await fetchPage(1);

    if (firstPage.includes('ERROR')) {
      return { statusCode: 200, body: JSON.stringify({ error: 'API error', raw: firstPage.substring(0, 1000) }) };
    }

    // Try both regex patterns as Namecheap XML format varies
    const pattern1 = [...firstPage.matchAll(/<Domain\s([^/]+)\/>/g)];
    const pattern2 = [...firstPage.matchAll(/Name="([^"]+)"[^>]*Expires="([^"]+)"/g)];
    const pattern3 = [...firstPage.matchAll(/Name="([^"]+)"/g)];

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        raw: firstPage.substring(0, 1500),
        pattern1count: pattern1.length,
        pattern2count: pattern2.length,
        pattern3count: pattern3.length,
        domains: [],
        total: 0
      })
    };
  } catch(err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
