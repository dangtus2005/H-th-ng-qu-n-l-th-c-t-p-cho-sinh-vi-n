import type { Request, Response } from 'express';
import { createHash, randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { pool } from '../config/db';
import { createSsoSession } from './auth.controller';
import { fail, text } from '../utils/validation';
import { audit } from '../utils/audit';

type Provider = 'google' | 'microsoft';
type Flow = {
  provider: Provider;
  verifier: string;
  nonce: string;
  binding: string;
  expires: number;
  userId?: string;
  sessionId?: string;
};
// shortcut: luồng OAuth lưu trong một tiến trình; dùng kho chung trước khi chạy nhiều instance.
const flows = new Map<string, Flow>();
const tickets = new Map<string, { userId: string; binding: string; expires: number }>();
const random = () => randomBytes(32).toString('base64url');
const digest = (v: string) => createHash('sha256').update(v).digest('hex');
const origin = () => {
  const url = new URL(process.env.APP_URL || 'http://localhost:8000');
  if (url.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(url.hostname)) {
    fail('APP_URL cần HTTPS');
  }
  return url.origin;
};

function settings(value: unknown) {
  if (value !== 'google' && value !== 'microsoft') {
    fail('Nhà cung cấp không hợp lệ');
  }
  const provider = value as Provider;
  const prefix = provider.toUpperCase();
  const clientId = process.env[`${prefix}_CLIENT_ID`];
  const secret = process.env[`${prefix}_CLIENT_SECRET`];
  const tenant = process.env.MICROSOFT_TENANT_ID;
  if (
    !clientId ||
    !secret ||
    (provider === 'microsoft' && !tenant) ||
    (provider === 'google' && !process.env.GOOGLE_HOSTED_DOMAIN)
  ) {
    fail('SSO chưa được cấu hình');
  }
  if (provider === 'microsoft' && !/^[a-f0-9-]{36}$/i.test(tenant!)) {
    fail('Microsoft cần Tenant ID cụ thể của trường');
  }
  return {
    provider,
    clientId,
    secret,
    issuer:
      provider === 'google'
        ? 'https://accounts.google.com'
        : `https://login.microsoftonline.com/${tenant}/v2.0`,
    redirect: `${origin()}/api/v1/auth/sso/${provider}/callback`,
  };
}

async function configuration(provider: Provider) {
  const value = settings(provider);
  const oidc = await import('openid-client');
  const config = await oidc.discovery(new URL(value.issuer), value.clientId, value.secret);
  return { oidc, config, ...value };
}

function binding(req: Request) {
  const value = req.headers.cookie
    ?.split(';')
    .map((v) => v.trim())
    .find((v) => v.startsWith('qlth_sso='))
    ?.slice(9);
  if (!value || !/^[A-Za-z0-9_-]{43}$/.test(value)) {
    fail('Phiên SSO không hợp lệ');
  }
  return digest(value);
}

function prune() {
  for (const map of [flows, tickets])
    for (const [key, v] of map)
      if (v.expires < Date.now()) {
        map.delete(key);
      }
  if (flows.size + tickets.size > 1000) {
    fail('Quá nhiều yêu cầu SSO; thử lại sau');
  }
}

export const providers = (_req: Request, res: Response) => {
  res.json(
    ['google', 'microsoft'].filter((p) => {
      try {
        settings(p);
        return true;
      } catch {
        return false;
      }
    }),
  );
};

async function startFlow(req: Request, res: Response, provider: Provider, userId?: string) {
  prune();
  const { oidc, config, redirect } = await configuration(provider);
  const state = random();
  const nonce = random();
  const cookie = random();
  const verifier = oidc.randomPKCECodeVerifier();
  flows.set(digest(state), {
    provider,
    verifier,
    nonce,
    binding: digest(cookie),
    expires: Date.now() + 5 * 60 * 1000,
    userId,
    sessionId: req.user?.jti,
  });
  res.cookie('qlth_sso', cookie, {
    httpOnly: true,
    sameSite: 'lax',
    secure: origin().startsWith('https:'),
    path: '/api/v1/auth/sso',
    maxAge: 5 * 60 * 1000,
  });
  const url = oidc.buildAuthorizationUrl(config, {
    redirect_uri: redirect,
    scope: 'openid profile email',
    state,
    nonce,
    ...(provider === 'google' ? { hd: process.env.GOOGLE_HOSTED_DOMAIN! } : {}),
    code_challenge: await oidc.calculatePKCECodeChallenge(verifier),
    code_challenge_method: 'S256',
  });
  if (userId) {
    res.json({ url: url.href });
  } else {
    res.redirect(url.href);
  }
}

export const begin = async (req: Request, res: Response) => {
  await startFlow(req, res, settings(req.params.provider).provider);
};

export const callback = async (req: Request, res: Response) => {
  try {
    const state = text(req.query.state, 'State', 100);
    const key = digest(state);
    const flow = flows.get(key);
    flows.delete(key);
    if (
      !flow ||
      flow.expires < Date.now() ||
      flow.provider !== req.params.provider ||
      flow.binding !== binding(req)
    ) {
      fail('Phiên SSO hết hạn');
    }
    const { oidc, config, redirect } = await configuration(flow.provider);
    const url = new URL(redirect);
    url.search = new URL(req.originalUrl, origin()).search;
    const result = await oidc.authorizationCodeGrant(config, url, {
      pkceCodeVerifier: flow.verifier,
      expectedState: state,
      expectedNonce: flow.nonce,
      idTokenExpected: true,
    });
    const claims = result.claims();
    if (!claims?.sub) {
      fail('Danh tính không hợp lệ');
    }
    if (
      flow.provider === 'google' &&
      (claims.hd !== process.env.GOOGLE_HOSTED_DOMAIN || claims.email_verified !== true)
    ) {
      fail('Cần email Google Workspace của trường đã xác minh');
    }
    if (flow.userId) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const user = (
          await client.query(
            'SELECT sso_provider,sso_id FROM users WHERE id=$1 AND is_active=TRUE FOR UPDATE',
            [flow.userId],
          )
        ).rows[0];
        if (
          !user ||
          !(
            await client.query(
              'SELECT 1 FROM auth_sessions WHERE id=$1 AND user_id=$2 AND expires_at>NOW()',
              [flow.sessionId, flow.userId],
            )
          ).rowCount
        ) {
          fail('Phiên liên kết đã bị thu hồi');
        }
        await client.query(
          'UPDATE users SET sso_provider=$1,sso_id=$2,updated_at=NOW() WHERE id=$3',
          [flow.provider, claims.sub, flow.userId],
        );
        await audit(
          client,
          req,
          'LINK_SSO',
          'users',
          flow.userId,
          user,
          { sso_provider: flow.provider },
          flow.userId,
        );
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
      res.clearCookie('qlth_sso', { path: '/api/v1/auth/sso' });
      res.redirect(`${origin()}/#sso-linked`);
      return;
    }
    const user = (
      await pool.query(
        'SELECT id FROM users WHERE sso_provider=$1 AND sso_id=$2 AND is_active=TRUE',
        [flow.provider, claims.sub],
      )
    ).rows[0];
    // Không tự ghép tài khoản theo email: người dùng phải liên kết khi đã đăng nhập bằng mật khẩu.
    if (!user) {
      fail('Tài khoản SSO chưa được liên kết');
    }
    const ticket = random();
    prune();
    tickets.set(digest(ticket), {
      userId: user.id,
      binding: flow.binding,
      expires: Date.now() + 60 * 1000,
    });
    res.redirect(`${origin()}/#sso=${ticket}`);
  } catch {
    res.redirect(`${origin()}/#sso-error`);
  }
};

export const exchange = async (req: Request, res: Response) => {
  const ticket = text(req.body?.ticket, 'Ticket', 100);
  const key = digest(ticket);
  const value = tickets.get(key);
  if (!value || value.expires < Date.now() || value.binding !== binding(req)) {
    fail('Phiên SSO không hợp lệ');
  }
  tickets.delete(key);
  res.clearCookie('qlth_sso', { path: '/api/v1/auth/sso' });
  res.json(await createSsoSession(value.userId));
};

export const link = async (req: Request, res: Response) => {
  const provider = settings(req.body?.provider).provider;
  const user = (
    await pool.query('SELECT password_hash FROM users WHERE id=$1 AND is_active=TRUE', [
      req.user!.sub,
    ])
  ).rows[0];
  if (
    !user ||
    typeof req.body?.password !== 'string' ||
    !(await bcrypt.compare(req.body.password, user.password_hash || ''))
  ) {
    fail('Mật khẩu hiện tại không đúng');
  }
  await startFlow(req, res, provider, req.user!.sub);
};
