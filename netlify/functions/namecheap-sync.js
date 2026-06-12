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

  function extractAttr(str, attr) {
    const m = str.match(new RegExp(attr + '="([^"]+)"'));
    return m ? m[1] : '';
  }

  try {
    const firstPage = await fetchPage(1);

    if (firstPage.includes('<Status>ERROR</Status>')) {
      const errMatch = firstPage.match(/<Error Number[^>]*>([^<]+)<\/Error>/);
      return { statusCode: 200, body: JSON.stringify({ error: errMatch ? errMatch[1] : 'Namecheap API error', raw: firstPage.substring(0, 500) }) };
    }

    const totalMatch = firstPage.match(/<TotalItems>(\d+)<\/TotalItems>/);
    const total = totalMatch ? parseInt(totalMatch[1]) : 0;
    const totalPages = Math.ceil(total / 100) || 1;

    let allXml = firstPage;
    for (let p = 2; p <= totalPages; p++) {
      allXml += await fetchPage(p);
    }

    const parts = allXml.split('<Domain ');
    const domains = [];
    for (let i = 1; i < parts.length; i++) {
      const block = parts[i];
      const name = extractAttr(block, 'Name');
      const expiry = extractAttr(block, 'Expires');
      if (name) domains.push({ name, expiry });
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        domains, 
        total: domains.length,
        partsCount: parts.length,
        debug: domains.length === 0 ? allXml.substring(0, 2000) : null
      })
    };

  } catch(err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
