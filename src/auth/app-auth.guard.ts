import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { jwtVerify } from 'jose';

type AppSessionPayload = {
  sub: string;
  phone?: string;
  type?: string;
};

@Injectable()
export class AppAuthGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  async canActivate(ctx: ExecutionContext) {
    const req = ctx.switchToHttp().getRequest();
    const auth = req.headers['authorization'];

    if (!auth?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing app session token');
    }

    const token = auth.slice(7);
    const secret = new TextEncoder().encode(
      this.config.get<string>('APP_AUTH_JWT_SECRET') ?? 'dev-mock-app-auth-secret',
    );

    try {
      const { payload } = await jwtVerify(token, secret);
      if (payload.type !== 'app-session' || typeof payload.sub !== 'string') {
        throw new UnauthorizedException('Invalid app session token');
      }

      req.appUser = payload as AppSessionPayload;
      return true;
    } catch {
      throw new UnauthorizedException('Invalid app session token');
    }
  }
}
