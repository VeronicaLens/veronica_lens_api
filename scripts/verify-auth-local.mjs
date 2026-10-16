import { createClient } from '@supabase/supabase-js';

import { createApp } from '../dist/app.js';

const supabaseUrl = process.env.SUPABASE_URL;
const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
const secretKey = process.env.SUPABASE_SECRET_KEY;

if (!supabaseUrl || !publishableKey || !secretKey) {
  throw new Error('Local Supabase environment variables are required');
}

const hostname = new URL(supabaseUrl).hostname;
if (hostname !== '127.0.0.1' && hostname !== 'localhost') {
  throw new Error('This verification script only runs against a local Supabase instance');
}

const admin = createClient(supabaseUrl, secretKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const suffix = crypto.randomUUID();
const email = `vrlens21-${suffix}@example.test`;
const signupEmail = `vrlens21-signup-${suffix}@example.test`;
const password = 'StrongPass-21!';
let confirmedUserId;
let signupUserId;

const app = createApp({ enableLogger: false });
const server = app.listen(0, '127.0.0.1');
await new Promise((resolve, reject) => {
  server.once('listening', resolve);
  server.once('error', reject);
});

const address = server.address();
if (!address || typeof address === 'string') throw new Error('Could not determine API port');
const baseUrl = `http://127.0.0.1:${address.port}/api/v1/auth`;

async function post(path, body, expectedStatus, accessToken) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (!expectedStatus.includes(response.status)) {
    throw new Error(`${path} returned ${response.status}`);
  }
  return response.status === 204 ? undefined : response.json();
}

try {
  const signup = await post(
    '/sign-up',
    { email: signupEmail, password, displayName: 'Signup verification' },
    [201, 202],
  );
  signupUserId = signup.data.user.id;

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (createError) throw createError;
  confirmedUserId = created.user.id;

  const signedIn = await post('/sign-in', { email, password }, [200]);
  const refreshed = await post('/refresh', { refreshToken: signedIn.data.refreshToken }, [200]);
  await post('/password/recovery', { email }, [202]);
  await post(
    '/password/update',
    { password: 'UpdatedPass-21!' },
    [204],
    refreshed.data.accessToken,
  );
  const passwordUpdatedSession = await post(
    '/sign-in',
    { email, password: 'UpdatedPass-21!' },
    [200],
  );
  await post('/sign-out', undefined, [204], passwordUpdatedSession.data.accessToken);
  await post('/refresh', { refreshToken: passwordUpdatedSession.data.refreshToken }, [401]);

  console.log('Local authentication flow verified successfully.');
} finally {
  await new Promise((resolve) => server.close(resolve));
  if (confirmedUserId) await admin.auth.admin.deleteUser(confirmedUserId);
  if (signupUserId) await admin.auth.admin.deleteUser(signupUserId);
}
