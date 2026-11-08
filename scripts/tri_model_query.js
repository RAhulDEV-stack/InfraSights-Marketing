const http = require('http');

async function queryOllama(model, prompt) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      model: model,
      prompt: prompt,
      stream: false
    });

    const options = {
      hostname: 'localhost',
      port: 11434,
      path: '/api/generate',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      },
      timeout: 60000
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve(json.response);
        } catch (err) {
          reject(new Error(`Failed to parse response: ${err.message}. Raw: ${data}`));
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timed out'));
    });

    req.write(payload);
    req.end();
  });
}

async function main() {
  console.log('Testing connection to local Ollama...');
  try {
    const res1 = await queryOllama('qwen2.5-coder:1.5b', 'Respond with one short sentence: confirming local Ollama is ready for Infrasights audit.');
    console.log('Qwen 1.5B:', res1.trim());

    const res2 = await queryOllama('qwen2.5-coder:7b', 'Respond with one short sentence: confirming 7B model is ready for Infrasights audit.');
    console.log('Qwen 7B:', res2.trim());
  } catch (err) {
    console.error('Ollama error:', err.message);
  }
}

main();
