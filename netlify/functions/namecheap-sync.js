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

    if (firstPage.includes('<Status>ERROR</Status>')) {
      const errMatch = firstPage.match(/<Error Number[^>]*>([^<]+)<\/Error>/);
      const errMsg = errMatch ? errMatch[1] : 'Namecheap API error';
      return { statusCode: 200, body: JSON.stringify({ error: errMsg }) };
    }

    const totalMatch = firstPage.match(/<TotalItems>(\d+)<\/TotalItems>/);
    const total = totalMatch ? parseInt(totalMatch[1]) : 0;
    const totalPages = Math.ceil(total / 100) || 1;

    let allXml = firstPage;
    for (let p = 2; p <= totalPages; p++) {
      allXml += await fetchPage(p);
    }

    const domainMatches = [...allXml.matchAll(/<Domain\s([^/]+)\/>/g)];
    const domains = domainMatches.map(m => {
      const attrs = m[1];
      const getName = attrs.match(/Name="([^"]+)"/);
      const getExpiry = attrs.match(/Expires="([^"]+)"/);
      return {
        name: getName ? getName[1] : '',
        expiry: getExpiry ? getExpiry[1] : ''
      };
    }).filter(d => d.name);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ domains: domains, total: domains.length })
    };
  } catch(err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
