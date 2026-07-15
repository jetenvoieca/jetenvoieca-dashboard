const https = require('https');

function githubRequest(method, path, token, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const options = {
      hostname: 'api.github.com',
      path: path,
      method: method,
      headers: {
        'User-Agent': 'jetenvoieca-bureau',
        'Authorization': `token ${token}`,
        'Accept': 'application/vnd.github+json',
        'Content-Type': 'application/json'
      }
    };
    const req = https.request(options, (res) => {
      let raw = '';
      res.on('data', chunk => raw += chunk);
      res.on('end', () => {
        let json;
        try { json = JSON.parse(raw); } catch (e) { json = {}; }
        resolve({ status: res.statusCode, json });
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

exports.handler = async function (event) {
  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPO;       // e.g. "jetenvoieca/jetenvoieca-dashboard" — set in Netlify, never sent by the client
  const branch = process.env.GITHUB_BRANCH || 'main';

  // GET — lightweight status check for the "Test Connection" button. Reveals
  // only whether env vars are set and which repo, never the token itself.
  if (event.httpMethod === 'GET') {
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ configured: !!(token && repo), repo: repo || null, branch })
    };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  if (!token || !repo) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Server missing GITHUB_TOKEN or GITHUB_REPO environment variables' }) };
  }

  let body;
  try { body = JSON.parse(event.body); } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid request body' }) };
  }

  // The filename is picked from a fixed allowlist, never taken directly from
  // the client — otherwise a client could ask this token to overwrite any
  // file in the repo (including this function itself).
  const ALLOWED_TARGETS = {
    content: 'content.json',
    sites: 'sites.json',
    domains: 'domains.json',
    contacts: 'contacts.json'
  };
  const target = body.target || 'content';
  const filename = ALLOWED_TARGETS[target];
  if (!filename) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Unknown target "' + target + '"' }) };
  }

  const content = body.content;
  const message = body.message || ('Update ' + filename + ' via Bureau');
  if (!content) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing content' }) };
  }

  const filePath = `/repos/${repo}/contents/${filename}`;

  try {
    const getResult = await githubRequest('GET', `${filePath}?ref=${branch}`, token);
    let sha = null;
    if (getResult.status === 200) {
      sha = getResult.json.sha;
    } else if (getResult.status !== 404) {
      return { statusCode: getResult.status, body: JSON.stringify({ error: getResult.json.message || 'GitHub error fetching file' }) };
    }

    const putBody = {
      message: message,
      content: Buffer.from(content, 'utf8').toString('base64'),
      branch: branch
    };
    if (sha) putBody.sha = sha;

    const putResult = await githubRequest('PUT', filePath, token, putBody);
    if (putResult.status !== 200 && putResult.status !== 201) {
      return { statusCode: putResult.status, body: JSON.stringify({ error: putResult.json.message || 'GitHub error publishing' }) };
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: true, file: filename, sha: putResult.json.content && putResult.json.content.sha })
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
