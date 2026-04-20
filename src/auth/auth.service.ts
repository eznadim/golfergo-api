import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { SignJWT } from 'jose';
import { SupabaseService } from '../supabase/supabase.service';

type AppUserBaseRow = {
  user_id: string;
  auth_id: string | null;
  name: string | null;
  phone: string | null;
  phone_normalized: string | null;
  is_phone_verified: boolean | null;
  created_at: string | null;
  updated_at: string | null;
};

type AppUserRow = AppUserBaseRow & {
  role_id: number | null;
};

type UserRoleRow = {
  role_id: number;
};

@Injectable()
export class AuthService {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly config: ConfigService,
  ) {}

  async requestOtp(input: {
    name: string;
    phoneNumber: string;
    visitorId?: string;
  }) {
    const normalizedPhoneNumber = this.normalizePhoneNumber(input.phoneNumber);
    const existingUser = await this.findUserByPhoneNumber(normalizedPhoneNumber);
    const roleId = existingUser ? await this.getPrimaryRoleId(existingUser.user_id) : null;

    return {
      ok: true,
      mockOtpCode: this.getMockOtpCode(),
      message: 'Mock OTP generated. Use 000000 to verify.',
      name: input.name.trim(),
      phoneNumber: input.phoneNumber,
      normalizedPhoneNumber,
      roleId,
      roleName: this.getRoleName(roleId),
      visitorId: input.visitorId ?? null,
    };
  }

  async verifyOtp(input: {
    name: string;
    phoneNumber: string;
    otp: string;
    visitorId?: string;
  }) {
    const expectedOtp = this.getMockOtpCode();
    if (input.otp !== expectedOtp) {
      throw new UnauthorizedException('Invalid OTP code');
    }

    const normalizedPhoneNumber = this.normalizePhoneNumber(input.phoneNumber);
    const user = await this.findOrCreateVerifiedUser(
      input.name.trim(),
      input.phoneNumber,
      normalizedPhoneNumber,
    );

    if (input.visitorId) {
      await this.linkVisitorToUser(input.visitorId, user.user_id);
    }

    return {
      accessToken: await this.signSessionToken(user),
      user: this.mapUser(user),
      visitorId: input.visitorId ?? null,
    };
  }

  async getCurrentUser(userId: string) {
    const user = await this.findUserById(userId);
    return this.mapUser(user);
  }

  async ensureAdminAccess(userId: string) {
    const user = await this.getCurrentUser(userId);

    if (user.roleId !== 1 && user.roleId !== 2) {
      throw new ForbiddenException('Admin access is required');
    }

    return user;
  }

  private async findOrCreateVerifiedUser(
    name: string,
    rawPhoneNumber: string,
    normalizedPhoneNumber: string,
  ) {
    const existing = await this.findUserByPhoneNumber(normalizedPhoneNumber);

    const now = new Date().toISOString();

    if (existing) {
      const updated = await this.supabase.client
        .from('app_user')
        .update({
          name,
          phone: rawPhoneNumber,
          phone_normalized: normalizedPhoneNumber,
          is_phone_verified: true,
          updated_at: now,
        })
        .eq('user_id', existing.user_id)
        .select(
          'user_id, auth_id, name, phone, phone_normalized, is_phone_verified, created_at, updated_at',
        )
        .single<AppUserBaseRow>();

      if (updated.error) {
        throw new BadRequestException(updated.error.message);
      }

      return this.attachRole(updated.data);
    }

    const inserted = await this.supabase.client
      .from('app_user')
      .insert({
        user_id: randomUUID(),
        auth_id: null,
        name,
        phone: rawPhoneNumber,
        phone_normalized: normalizedPhoneNumber,
        is_phone_verified: true,
        created_at: now,
        updated_at: now,
      })
      .select(
        'user_id, auth_id, name, phone, phone_normalized, is_phone_verified, created_at, updated_at',
      )
      .single<AppUserBaseRow>();

    if (inserted.error) {
      throw new BadRequestException(inserted.error.message);
    }

    return this.attachRole(inserted.data);
  }

  private async findUserById(userId: string) {
    const result = await this.supabase.client
      .from('app_user')
      .select(
        'user_id, auth_id, name, phone, phone_normalized, is_phone_verified, created_at, updated_at',
      )
      .eq('user_id', userId)
      .maybeSingle<AppUserBaseRow>();

    if (result.error) {
      throw new BadRequestException(result.error.message);
    }

    if (!result.data) {
      throw new UnauthorizedException('App user not found');
    }

    return this.attachRole(result.data);
  }

  private async findUserByPhoneNumber(normalizedPhoneNumber: string) {
    const result = await this.supabase.client
      .from('app_user')
      .select(
        'user_id, auth_id, name, phone, phone_normalized, is_phone_verified, created_at, updated_at',
      )
      .eq('phone_normalized', normalizedPhoneNumber)
      .maybeSingle<AppUserBaseRow>();

    if (result.error) {
      throw new BadRequestException(result.error.message);
    }

    if (!result.data) {
      return null;
    }

    return this.attachRole(result.data);
  }

  private async attachRole(user: AppUserBaseRow): Promise<AppUserRow> {
    const roleId = await this.getPrimaryRoleId(user.user_id);
    return {
      ...user,
      role_id: roleId,
    };
  }

  private async getPrimaryRoleId(userId: string) {
    const result = await this.supabase.client
      .from('user_role')
      .select('role_id')
      .eq('user_id', userId)
      .order('role_id', { ascending: true })
      .limit(1)
      .maybeSingle<UserRoleRow>();

    if (result.error) {
      throw new BadRequestException(result.error.message);
    }

    return result.data?.role_id ?? null;
  }

  private async linkVisitorToUser(visitorId: string, userId: string) {
    const now = new Date().toISOString();

    const updated = await this.supabase.client
      .from('visitors')
      .update({
        linked_user_id: userId,
        last_seen_at: now,
      })
      .eq('id', visitorId)
      .select('id')
      .maybeSingle<{ id: string }>();

    if (updated.error) {
      throw new BadRequestException(updated.error.message);
    }

    if (updated.data) {
      return;
    }

    const inserted = await this.supabase.client
      .from('visitors')
      .insert({
        id: visitorId,
        platform: 'web',
        linked_user_id: userId,
        last_seen_at: now,
      });

    if (inserted.error) {
      throw new BadRequestException(inserted.error.message);
    }
  }

  private async signSessionToken(user: AppUserRow) {
    const secret = new TextEncoder().encode(
      this.config.get<string>('APP_AUTH_JWT_SECRET') ?? 'dev-mock-app-auth-secret',
    );

    return new SignJWT({
      phone: user.phone_normalized ?? user.phone ?? '',
      type: 'app-session',
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('30d')
      .setSubject(user.user_id)
      .sign(secret);
  }

  private mapUser(user: AppUserRow) {
    const roleId = user.role_id ?? null;

    return {
      userId: user.user_id,
      authId: user.auth_id,
      name: user.name ?? '',
      phoneNumber: user.phone_normalized ?? user.phone ?? '',
      roleId,
      roleName: this.getRoleName(roleId),
      isPhoneVerified: user.is_phone_verified ?? false,
      createdAt: user.created_at,
      updatedAt: user.updated_at,
    };
  }

  private getRoleName(roleId: number | null) {
    switch (roleId) {
      case 1:
        return 'superadmin';
      case 2:
        return 'club_admin';
      default:
        return 'user';
    }
  }

  private getMockOtpCode() {
    return this.config.get<string>('MOCK_OTP_CODE') ?? '000000';
  }

  private normalizePhoneNumber(phoneNumber: string) {
    const digits = phoneNumber.replace(/[^\d]/g, '');

    if (digits.startsWith('60')) {
      return `+${digits}`;
    }

    if (digits.startsWith('0')) {
      return `+60${digits.slice(1)}`;
    }

    return `+${digits}`;
  }
}
