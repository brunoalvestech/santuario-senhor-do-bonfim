const jsonHeaders = { "content-type": "application/json; charset=utf-8" };
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const imageTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]);

function response(data: unknown, status = 200, extra: HeadersInit = {}) {
  return new Response(JSON.stringify(data), { status, headers: { ...jsonHeaders, ...extra } });
}

function allowedOrigin(request: Request, env: Env) {
  const origin = request.headers.get("origin") ?? "";
  return env.ALLOWED_ORIGINS.split(",").map((value) => value.trim()).includes(origin) ? origin : "";
}

function corsHeaders(request: Request, env: Env): HeadersInit {
  const origin = allowedOrigin(request, env);
  return origin ? {
    "access-control-allow-origin": origin,
    "access-control-allow-methods": "GET,POST,DELETE,OPTIONS",
    "access-control-allow-headers": "content-type,authorization",
    "access-control-max-age": "86400",
    "vary": "Origin"
  } : {};
}

function isAdmin(request: Request, env: Env) {
  const authorization = request.headers.get("authorization") ?? "";
  if (!authorization.startsWith("Bearer ")) return false;
  const supplied = new TextEncoder().encode(authorization.slice(7));
  const expected = new TextEncoder().encode(env.ADMIN_TOKEN);
  if (supplied.byteLength !== expected.byteLength) return false;
  let difference = 0;
  for (let index = 0; index < supplied.byteLength; index += 1) difference |= supplied[index] ^ expected[index];
  return difference === 0;
}

async function readJson(request: Request) {
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > 32_768) throw new Error("payload_too_large");
  return request.json<Record<string, unknown>>();
}

async function newsletter(request: Request, env: Env) {
  const body = await readJson(request);
  const email = String(body.email ?? "").trim().toLowerCase();
  if (body.website) return response({ ok: true }, 201, corsHeaders(request, env));
  if (!emailPattern.test(email) || email.length > 254 || body.consent !== true) {
    return response({ error: "Informe um e-mail válido e autorize o contato." }, 400, corsHeaders(request, env));
  }
  const now = new Date().toISOString();
  await env.DB.prepare(`INSERT INTO newsletter_subscribers (id, email, status, consent_at, created_at, updated_at)
    VALUES (?1, ?2, 'active', ?3, ?3, ?3)
    ON CONFLICT(email) DO UPDATE SET status = 'active', consent_at = excluded.consent_at, updated_at = excluded.updated_at`)
    .bind(crypto.randomUUID(), email, now).run();
  return response({ ok: true, message: "Cadastro realizado com sucesso." }, 201, corsHeaders(request, env));
}

async function prayer(request: Request, env: Env) {
  const body = await readJson(request);
  const name = String(body.name ?? "").trim().slice(0, 120);
  const intention = String(body.intention ?? "").trim();
  if (body.website) return response({ ok: true }, 201, corsHeaders(request, env));
  if (intention.length < 3 || intention.length > 3000 || body.consent !== true) {
    return response({ error: "Escreva sua intenção e autorize o armazenamento." }, 400, corsHeaders(request, env));
  }
  const now = new Date().toISOString();
  await env.DB.prepare(`INSERT INTO prayer_requests (id, name, intention, status, consent_at, created_at, updated_at)
    VALUES (?1, ?2, ?3, 'new', ?4, ?4, ?4)`)
    .bind(crypto.randomUUID(), name || null, intention, now).run();
  return response({ ok: true, message: "Sua intenção foi recebida. A vela foi acesa." }, 201, corsHeaders(request, env));
}

async function uploadImage(request: Request, env: Env) {
  if (!isAdmin(request, env)) return response({ error: "Não autorizado." }, 401, corsHeaders(request, env));
  const form = await request.formData();
  const file = form.get("file");
  const title = String(form.get("title") ?? "").trim().slice(0, 160);
  const altText = String(form.get("alt") ?? "").trim().slice(0, 300);
  if (!(file instanceof File) || !imageTypes.has(file.type) || file.size < 1 || file.size > 8_000_000 || !title || !altText) {
    return response({ error: "Envie uma imagem válida de até 8 MB, com título e texto alternativo." }, 400, corsHeaders(request, env));
  }
  const extension = file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "bin";
  const id = crypto.randomUUID();
  const key = `images/${id}.${extension}`;
  await env.IMAGES.put(key, file.stream(), { httpMetadata: { contentType: file.type } });
  await env.DB.prepare(`INSERT INTO images (id, object_key, title, alt_text, content_type, size_bytes)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6)`)
    .bind(id, key, title, altText, file.type, file.size).run();
  return response({ ok: true, id, url: `/media/${key}` }, 201, corsHeaders(request, env));
}

async function listImages(request: Request, env: Env) {
  const { results } = await env.DB.prepare(`SELECT id, object_key, title, alt_text, content_type, size_bytes, created_at
    FROM images ORDER BY created_at DESC LIMIT 100`).all();
  const origin = new URL(request.url).origin;
  return response({ images: results.map((item) => ({ ...item, url: `${origin}/media/${item.object_key}` })) }, 200, corsHeaders(request, env));
}

async function media(pathname: string, env: Env) {
  const key = pathname.replace(/^\/media\//, "");
  if (!key.startsWith("images/")) return new Response("Not found", { status: 404 });
  const object = await env.IMAGES.get(key);
  if (!object?.body) return new Response("Not found", { status: 404 });
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  headers.set("cache-control", "public, max-age=86400");
  return new Response(object.body, { headers });
}

async function adminList(request: Request, env: Env, table: "newsletter_subscribers" | "prayer_requests") {
  if (!isAdmin(request, env)) return response({ error: "Não autorizado." }, 401, corsHeaders(request, env));
  const columns = table === "newsletter_subscribers"
    ? "id, email, status, consent_at, created_at, updated_at"
    : "id, name, intention, status, consent_at, created_at, updated_at";
  const { results } = await env.DB.prepare(`SELECT ${columns} FROM ${table} ORDER BY created_at DESC LIMIT 500`).all();
  return response({ results }, 200, corsHeaders(request, env));
}

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);
    const cors = corsHeaders(request, env);
    if (request.method === "OPTIONS") {
      return allowedOrigin(request, env) ? new Response(null, { status: 204, headers: cors }) : response({ error: "Origem não permitida." }, 403);
    }
    try {
      if (request.method === "GET" && url.pathname === "/health") return response({ ok: true });
      if (request.method === "POST" && url.pathname === "/api/newsletter") return await newsletter(request, env);
      if (request.method === "POST" && url.pathname === "/api/prayers") return await prayer(request, env);
      if (request.method === "POST" && url.pathname === "/api/images") return await uploadImage(request, env);
      if (request.method === "GET" && url.pathname === "/api/images") return await listImages(request, env);
      if (request.method === "GET" && url.pathname.startsWith("/media/")) return await media(url.pathname, env);
      if (request.method === "GET" && url.pathname === "/api/admin/newsletter") return await adminList(request, env, "newsletter_subscribers");
      if (request.method === "GET" && url.pathname === "/api/admin/prayers") return await adminList(request, env, "prayer_requests");
      return response({ error: "Rota não encontrada." }, 404, cors);
    } catch (error) {
      console.error(JSON.stringify({ event: "request_error", path: url.pathname, message: error instanceof Error ? error.message : "unknown" }));
      return response({ error: "Não foi possível concluir agora. Tente novamente." }, 500, cors);
    }
  }
} satisfies ExportedHandler<Env>;
