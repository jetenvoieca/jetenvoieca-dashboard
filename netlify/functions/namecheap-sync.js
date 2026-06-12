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

    // Return raw XML for debugging
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ debug: firstPage.substring(0, 2000) })
    };

  } catch(err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
