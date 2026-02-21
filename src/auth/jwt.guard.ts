import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createRemoteJWKSet, jwtVerify } from 'jose';

@Injectable()
export class SupabaseJwtGuard implements CanActivate {
  private jwks;

  constructor(private config: ConfigService) {
    const jwksUrl = this.config.get<string>('SUPABASE_JWKS_URL');
    if (!jwksUrl) throw new Error('Missing SUPABASE_JWKS_URL');
    this.jwks = createRemoteJWKSet(new URL(jwksUrl));
  }

  async canActivate(ctx: ExecutionContext) {
    const req = ctx.switchToHttp().getRequest();
    const auth = req.headers['authorization'];

    if (!auth?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing bearer token');
    }

    const token = auth.slice(7);

    try {
      const { payload } = await jwtVerify(token, this.jwks);
      req.user = payload; // payload.sub is the Supabase user id
      return true;
    } catch {
      throw new UnauthorizedException('Invalid token');
    }
  }
}