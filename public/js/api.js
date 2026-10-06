export const session = { adultToken: null };

export async function api(path, { method = 'GET', body, adult = false } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (adult && session.adultToken) headers['x-adult-token'] = session.adultToken;
  let res;
  try {
    res = await fetch(path, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  } catch {
    throw new Error('No puedo conectarme con el tutor. ¿Está encendido el servidor?');
  }
  const data = res.headers.get('content-type')?.includes('json') ? await res.json() : await res.text();
  if (!res.ok) {
    const err = new Error(data?.error || 'Algo salió mal.');
    err.status = res.status;
    throw err;
  }
  return data;
}
