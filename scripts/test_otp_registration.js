const http = require('http');

function post(path, body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const req = http.request({
      hostname: 'localhost',
      port: 8086,
      path: path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, data: JSON.parse(data) }));
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

function get(path) {
  return new Promise((resolve, reject) => {
    http.get('http://localhost:8086' + path, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch(e) {
          resolve({ status: res.statusCode, raw: data });
        }
      });
    }).on('error', reject);
  });
}

async function run() {
  console.log('1. Testing health...');
  const health = await get('/api/health');
  console.log('Health:', health.status, health.data.status);

  console.log('2. Requesting OTP for +91 98765 12345...');
  const otpRes = await post('/api/auth/send-otp', {
    phoneNumber: '+91 98765 12345',
    email: 'testuser@infrasights.in'
  });
  console.log('OTP response status:', otpRes.status);
  console.log('OTP details:', otpRes.data);
  const debugOtp = otpRes.data.debugOtp;

  console.log('3. Verifying OTP code:', debugOtp);
  const verifyRes = await post('/api/auth/verify-otp', {
    phoneNumber: '+91 98765 12345',
    otp: debugOtp
  });
  console.log('Verify response status:', verifyRes.status);
  console.log('Verify details:', verifyRes.data);
  const token = verifyRes.data.verificationToken;

  console.log('4. Registering user with verified phone...');
  const regRes = await post('/api/auth/register', {
    fullName: 'Rahul Infrastructure Lead',
    email: 'rahul.test@infrasights.in',
    organization: 'Infrasights Core Tech',
    departmentRole: 'Chief Infrastructure Architect',
    password: 'Password2026!',
    phoneNumber: '+91 98765 12345',
    verificationToken: token
  });
  console.log('Registration status:', regRes.status);
  console.log('Registration user profile:', regRes.data.data.user);

  console.log('5. Checking Mail Service Outbox for Welcome Email from admin@infrasights.in...');
  const mailHistory = await get('/api/mail/history');
  console.log('Total dispatched emails in outbox:', mailHistory.data.total);
  mailHistory.data.data.slice(0, 5).forEach((item, idx) => {
    console.log(`Email #${idx + 1}: Type=${item.type} | From=${item.from} | To=${item.to} | Subject="${item.subject}"`);
  });
}

run().catch(console.error);
