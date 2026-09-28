import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, resolve } from "node:path";
import app from "./dist/server/server.js";

const port = Number.parseInt(process.env.PORT || "3001", 10);
const host = process.env.HOST || "0.0.0.0";
const clientDir = resolve("dist/client");

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

function getStaticPath(url) {
  const pathname = decodeURIComponent(new URL(url, "http://localhost").pathname);
  const filePath = normalize(join(clientDir, pathname));
  if (!filePath.startsWith(clientDir)) {
    return null;
  }
  if (existsSync(filePath) && statSync(filePath).isFile()) {
    return filePath;
  }
  return null;
}

function sendStatic(filePath, res, method) {
  const stat = statSync(filePath);
  res.writeHead(200, {
    "content-length": stat.size,
    "content-type": mimeTypes[extname(filePath)] || "application/octet-stream",
  });
  if (method === "HEAD") {
    res.end();
    return;
  }
  createReadStream(filePath).pipe(res);
}

function toWebRequest(req) {
  const protocol = req.headers["x-forwarded-proto"] || "http";
  const hostHeader = req.headers.host || `localhost:${port}`;
  const url = `${protocol}://${hostHeader}${req.url || "/"}`;
  const init = {
    method: req.method,
    headers: req.headers,
  };
  if (req.method !== "GET" && req.method !== "HEAD") {
    init.body = req;
    init.duplex = "half";
  }
  return new Request(url, init);
}

async function sendWebResponse(webResponse, res) {
  res.statusCode = webResponse.status;
  res.statusMessage = webResponse.statusText;
  webResponse.headers.forEach((value, key) => {
    res.setHeader(key, value);
  });
  if (!webResponse.body) {
    res.end();
    return;
  }
  const reader = webResponse.body.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    res.write(value);
  }
  res.end();
}

createServer(async (req, res) => {
  try {
    const staticPath = getStaticPath(req.url || "/");
    if (staticPath) {
      sendStatic(staticPath, res, req.method);
      return;
    }
    await sendWebResponse(await app.fetch(toWebRequest(req)), res);
  } catch (error) {
    console.error(error);
    res.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
    res.end("Internal Server Error");
  }
}).listen(port, host, () => {
  console.log(`Shop portal listening on http://${host}:${port}`);
});
