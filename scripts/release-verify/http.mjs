// Node 22 내장 fetch만 쓴다. 비밀값·쿠키 값은 반환 객체에만 두고 어디에도 출력하지 않는다.

function setCookies(res) {
  const out = {};
  for (const raw of res.headers.getSetCookie()) {
    const pair = raw.split(";")[0];
    const eq = pair.indexOf("=");
    if (eq > 0) out[pair.slice(0, eq).trim()] = pair.slice(eq + 1);
  }
  return out;
}

function cookieHeader(jar) {
  return Object.entries(jar).map(([k, v]) => `${k}=${v}`).join("; ");
}

// FEAT-25 공개 계약: csrf → callback POST → 302 + 세션 쿠키. 실패도 302라 쿠키 존재로 판정한다.
export async function loginVerifier(base, secret, fetchImpl = fetch) {
  const csrfRes = await fetchImpl(`${base}/api/auth/csrf`, { redirect: "manual" });
  if (csrfRes.status !== 200) return { ok: false, step: "csrf", status: csrfRes.status };
  const jar = setCookies(csrfRes);
  const { csrfToken } = await csrfRes.json();
  const res = await fetchImpl(`${base}/api/auth/callback/verifier`, {
    method: "POST",
    redirect: "manual",
    headers: { "content-type": "application/x-www-form-urlencoded", cookie: cookieHeader(jar) },
    body: new URLSearchParams({ csrfToken, secret }).toString(),
  });
  Object.assign(jar, setCookies(res));
  const hasSession = Object.keys(jar).some((n) => n.endsWith("authjs.session-token"));
  if (res.status !== 302 || !hasSession) {
    return { ok: false, step: "callback", status: res.status, location: res.headers.get("location") ?? "" };
  }
  return { ok: true, cookie: cookieHeader(jar) };
}

export async function getWithSession(base, path, cookie, fetchImpl = fetch) {
  const res = await fetchImpl(`${base}${path}`, { redirect: "manual", headers: { cookie } });
  return { status: res.status, body: await res.text() };
}

export async function getText(url, fetchImpl = fetch) {
  const res = await fetchImpl(url, { redirect: "manual", headers: { "cache-control": "no-store" } });
  return res.status === 200 ? await res.text() : null;
}
