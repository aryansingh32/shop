const { serialize } = require('seroval');

const payload = serialize({ login: "arpit@gmail.com", password: "password" });
console.log("Seroval payload:", payload);

fetch('http://localhost:3001/_serverFn/eyJmaWxlIjoiL3NyYy9saWIvYXV0aC5mdW5jdGlvbnMudHM_dHNzLXNlcnZlcmZuLXNwbGl0IiwiZXhwb3J0IjoibG9naW5Gbl9jcmVhdGVTZXJ2ZXJGbl9oYW5kbGVyIn0', {
  method: 'POST',
  headers: {
    'Host': 'arpit.localhost:3001',
    'Origin': 'http://arpit.localhost:3001',
    'x-tsr-serverfn': 'true',
    'Content-Type': 'application/json',
    'Accept': 'application/json'
  },
  body: payload
}).then(async r => {
  console.log("Status:", r.status);
  console.log("Headers:", Array.from(r.headers.entries()));
  console.log("Body:", await r.text());
}).catch(console.error);
