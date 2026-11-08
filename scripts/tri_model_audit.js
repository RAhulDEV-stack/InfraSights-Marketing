const http = require('http');
const fs = require('fs');

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
      timeout: 180000
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve(json.response);
        } catch (err) {
          reject(new Error(`Failed to parse response from ${model}: ${err.message}`));
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`Request to ${model} timed out`));
    });

    req.write(payload);
    req.end();
  });
}

async function runAudit() {
  console.log('=== Starting Tri-Model Local Audit ===');
  
  // Read key sections of codebase
  const renderYaml = fs.readFileSync('render.yaml', 'utf8');
  const indexHtml = fs.readFileSync('index.html', 'utf8');
  
  // 1. Qwen 2.5 Coder 1.5B (Model 3) - Fast Validation & Syntax Check
  console.log('\n[Model 3: Qwen 2.5 Coder 1.5B] Checking Render Blueprint & Configs...');
  const prompt15b = `Analyze this render.yaml configuration for deploying Infrasights mail-service and platform on Render:
\`\`\`yaml
${renderYaml}
\`\`\`
Verify:
1. Are health check paths correct?
2. Are environment variable linkings properly formatted for Render Blueprints?
3. Are port settings standard for Render?
Provide concise findings and any optimizations.`;

  const res15b = await queryOllama('qwen2.5-coder:1.5b', prompt15b);
  console.log('\n--- Qwen 1.5B Findings ---');
  console.log(res15b);

  // 2. Qwen 2.5 Coder 7B (Model 1) - Core Implementation & Architecture Review
  console.log('\n[Model 1: Qwen 2.5 Coder 7B] Reviewing UI & Interactive elements in index.html...');
  const prompt7b = `Review the UI structure, accessibility, and interactive controls for Infrasights marketing website.
Key HTML elements summary:
- Navigation with anchors (#hero, #capabilities, #how-it-works, #preview, #personas, #roadmap, #faq)
- Primary CTA buttons with class .trigger-deployment-cta
- 5-step deployment qualification wizard modal (#deployment-modal)
- Authentication modal (#auth-modal) with Login, Register, Forgot Password
- Canvas element #topology-canvas with fallback
- FAQ accordion with .faq-item and .faq-question
- Interactive preview tabs .mockup-tab

Audit:
1. Are all user interaction paths closed (no dead buttons or orphaned modals)?
2. What edge cases should be verified for responsiveness across desktop, tablet, and mobile?
3. Confirm if all acceptance criteria are met for Render deployment and UI polish.
Provide a clear, actionable audit summary.`;

  const res7b = await queryOllama('qwen2.5-coder:7b', prompt7b);
  console.log('\n--- Qwen 7B Findings ---');
  console.log(res7b);

  fs.writeFileSync('scripts/audit_results.json', JSON.stringify({
    timestamp: new Date().toISOString(),
    qwen1_5b: res15b,
    qwen7b: res7b
  }, null, 2));
  console.log('\nAudit complete! Saved to scripts/audit_results.json');
}

runAudit().catch(err => {
  console.error('Audit failed:', err);
});
