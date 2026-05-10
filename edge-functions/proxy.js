const TARGET_BASE = (Netlify.env.get("TARGET_DOMAIN") || "").replace(/\/$/, "");

const STRIP_HEADERS = new Set([
  "host",
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "forwarded",
  "x-forwarded-host",
  "x-forwarded-proto",
  "x-forwarded-port",
]);

function getUpstreamPath(pathname) {
  if (pathname === "/MAteam") return "/";
  if (pathname.startsWith("/MAteam/")) {
    return pathname.slice("/MAteam".length);
  }
  return pathname;
}

export default async function handler(request) {
  if (!TARGET_BASE) {
    return new Response("Misconfigured: TARGET_DOMAIN is not set", { status: 500 });
  }

  try {
    const url = new URL(request.url);

    const upstreamPath = getUpstreamPath(url.pathname);

    const targetUrl =
      `${TARGET_BASE}${upstreamPath}${url.search}`;

    const headers = new Headers();
    let clientIp = null;

    for (const [key, value] of request.headers) {
      const k = key.toLowerCase();

      if (
        STRIP_HEADERS.has(k) ||
        k.startsWith("x-nf-") ||
        k.startsWith("x-netlify-")
      ) {
        continue;
      }

      if (k === "x-real-ip") {
        clientIp = value;
        continue;
      }

      if (k === "x-forwarded-for") {
        if (clientIp === null) clientIp = value;
        continue;
      }

      headers.set(k, value);
    }

    if (clientIp !== null) {
      headers.set("x-forwarded-for", clientIp);
    }

    const method = request.method;

    const fetchOptions = {
      method,
      headers,
      redirect: "manual",
    };

    if (method !== "GET" && method !== "HEAD") {
      fetchOptions.body = request.body;
    }

    const upstream = await fetch(targetUrl, fetchOptions);

    const responseHeaders = new Headers();

    for (const [key, value] of upstream.headers) {
      if (key.toLowerCase() === "transfer-encoding") continue;
      responseHeaders.set(key, value);
    }

    return new Response(upstream.body, {
      status: upstream.status,
      headers: responseHeaders,
    });
  } catch {
    return new Response("Bad Gateway: Relay Failed", {
      status: 502,
    });
  }
}
