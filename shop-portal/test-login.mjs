import { toJSON } from 'seroval';

const payload = toJSON({ data: { login: "arpit@gmail.com", password: "Arpit" } });

const res = await fetch('http://localhost:3001/_serverFn/eyJmaWxlIjoiL3NyYy9saWIvYXV0aC5mdW5jdGlvbnMudHM_dHNzLXNlcnZlcmZuLXNwbGl0IiwiZXhwb3J0IjoibG9naW5Gbl9jcmVhdGVTZXJ2ZXJGbl9oYW5kbGVyIn0', {
  method: 'POST',
  headers: {
    'Host': 'arpit.localhost:3001',
    'Origin': 'http://arpit.localhost:3001',
    'Referer': 'http://arpit.localhost:3001/login',
    'x-tsr-serverFn': 'true',
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  },
  body: JSON.stringify(payload)
});

console.log("Status:", res.status);
console.log("Set-Cookie:", res.headers.get('set-cookie'));
const body = await res.text();
console.log("Body:", body.slice(0, 800));
