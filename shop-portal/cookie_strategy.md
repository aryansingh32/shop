# Cookie Strategy & Session Management

## The `httpOnly` Tradeoff in TanStack Start

In this project, session cookies (`kiranaSession`) are currently set with `httpOnly: false`. Normally, security best practices dictate that session cookies should be `httpOnly: true` to prevent JavaScript access and mitigate XSS attacks.

### Why `httpOnly: false` is used

The `shop-portal` application is built on TanStack Start (currently in beta). There is a known bug in the `mergeEventResponseHeaders` function within the beta framework where cookies are entirely dropped if the server response is treated as successful (`response.ok === true`):

```javascript
// Inside TanStack Start beta internals:
function mergeEventResponseHeaders(response, event) {
  if (response.ok) { return }  // <-- BAILS OUT FOR 2xx, dropping all Set-Cookie headers!
}
```

Because of this bug, any attempt to set an `httpOnly` cookie during a successful login (a 2xx response) results in the browser never receiving the `Set-Cookie` header.

### The Workaround

To ensure sessions persist correctly, the server instead returns the session token directly in the JSON response body. The client-side code (in `login.tsx`) takes this token and explicitly sets it via `document.cookie`.

Since `document.cookie` cannot set `httpOnly` cookies (by definition, it is JS-accessible), the cookie must be `httpOnly: false`.

### Security Mitigations

While `httpOnly: false` is less ideal, the following strict mitigations are in place:

1. **`SameSite=Lax` (or Strict)**: The cookie is restricted to first-party contexts, protecting against CSRF attacks.
2. **HMAC Signing**: The session token is cryptographically signed using an HMAC secret on the server. Even if a malicious script accesses the token or an attacker attempts to forge one, they cannot manipulate the session payload without the server-side secret.
3. **No Cross-Origin Abuse**: Since the cookie is scoped strictly, it can only be passed back to the `shop-portal` domain.

### Future Resolution

Once TanStack Start reaches a stable `1.0` release and the `mergeEventResponseHeaders` bug is resolved in the underlying HTTP event handler (`h3`), we should:

1. Remove the JSON payload token from the `loginFn` response.
2. Ensure `setCookie` is called with `httpOnly: true`.
3. Remove the client-side `document.cookie` assignment in `login.tsx`.
