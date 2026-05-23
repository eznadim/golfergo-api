import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createHash,
  randomBytes,
  randomInt,
  randomUUID,
  scrypt as scryptCallback,
  timingSafeEqual,
} from 'crypto';
import { jwtVerify, SignJWT } from 'jose';
import * as bcrypt from 'bcryptjs';
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type RegistrationResponseJSON,
  type WebAuthnCredential,
} from '@simplewebauthn/server';
import { promisify } from 'util';
import { SupabaseService } from '../supabase/supabase.service';

const scrypt = promisify(scryptCallback);
const OTP_TTL_SECONDS = 300;
const OTP_RESEND_COOLDOWN_SECONDS = 60;
const OTP_MAX_ATTEMPTS = 5;
const PIN_MAX_ATTEMPTS = 5;
const PIN_LOCK_MINUTES = 15;
const PIN_HISTORY_LIMIT = 5;
const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
const REFRESH_TOKEN_TTL_DAYS = 30;

type OtpPurpose = 'register' | 'login_fallback' | 'pin_reset';

type AppUserBaseRow = {
  user_id: string;
  auth_id: string | null;
  name: string | null;
  username: string | null;
  password_hash: string | null;
  pin_hash: string | null;
  phone: string | null;
  phone_normalized: string | null;
  is_phone_verified: boolean | null;
  phone_verified_at: string | null;
  account_status: string | null;
  preferred_auth_method: string | null;
  last_login_at: string | null;
  pin_failed_attempts: number | null;
  pin_locked_until: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type AppUserRow = AppUserBaseRow & {
  role_id: number | null;
  passkey_count?: number;
};

type OtpRequestRow = {
  otp_request_id: string;
  purpose: OtpPurpose;
  phone: string;
  phone_normalized: string;
  user_id: string | null;
  visitor_id: string | null;
  channel: string;
  otp_hash: string;
  expires_at: string;
  attempts: number;
  max_attempts: number;
  consumed_at: string | null;
  created_at: string;
  metadata: Record<string, unknown> | null;
};

type UserRoleRow = {
  role_id: number;
};

type AuthContext = {
  ipAddress?: string | null;
  userAgent?: string | null;
};

type AuthSessionRow = {
  session_id: string;
  user_id: string;
  refresh_token_hash: string | null;
  expires_at: string;
  revoked_at: string | null;
};

type PasskeyChallengeRow = {
  challenge_id: string;
  user_id: string | null;
  purpose: 'register' | 'authenticate';
  challenge: string;
  rp_id: string;
  origin: string | null;
  expires_at: string;
  consumed_at: string | null;
  metadata: Record<string, unknown> | null;
};

type PasskeyCredentialRow = {
  passkey_id: string;
  user_id: string;
  credential_id: string;
  public_key: string;
  sign_count: number;
  transports: string[] | null;
  device_label: string | null;
  platform: string | null;
  revoked_at: string | null;
};

@Injectable()
export class AuthService {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly config: ConfigService,
  ) {}

  async sendOtp(input: {
    name?: string;
    phoneNumber: string;
    purpose: OtpPurpose;
    visitorId?: string;
    channel?: 'whatsapp';
    captchaToken?: string;
  }, context: AuthContext = {}) {
    const normalizedPhoneNumber = this.normalizePhoneNumber(input.phoneNumber);
    const existingUser = await this.findUserByPhoneNumber(normalizedPhoneNumber);

    if (input.purpose === 'register' && existingUser?.pin_hash) {
      throw new ConflictException(
        this.errorPayload(
          'PHONE_ALREADY_REGISTERED',
          'This phone number is already registered. Please log in or use OTP recovery.',
        ),
      );
    }

    if (input.purpose !== 'register' && !existingUser) {
      throw new UnauthorizedException(
        this.errorPayload(
          'ACCOUNT_NOT_FOUND',
          'No active account found for this phone number.',
        ),
      );
    }

    await this.ensureOtpCooldown(normalizedPhoneNumber, input.purpose);
    if (input.purpose === 'register') {
      await this.verifyCaptcha(input.captchaToken, context.ipAddress);
    }

    const otp = this.generateOtpCode();
    const now = new Date();
    const expiresAt = new Date(
      now.getTime() + OTP_TTL_SECONDS * 1000,
    ).toISOString();

    const inserted = await this.supabase.client
      .from('auth_otp_request')
      .insert({
        otp_request_id: randomUUID(),
        purpose: input.purpose,
        phone: input.phoneNumber,
        phone_normalized: normalizedPhoneNumber,
        user_id: existingUser?.user_id ?? null,
        visitor_id: input.visitorId ?? null,
        channel: input.channel ?? 'whatsapp',
        otp_hash: this.hashOtp(otp),
        expires_at: expiresAt,
        attempts: 0,
        max_attempts: OTP_MAX_ATTEMPTS,
        created_at: now.toISOString(),
        metadata: {
          name: input.name?.trim() ?? null,
          captchaProvided: Boolean(input.captchaToken),
          ipAddress: context.ipAddress ?? null,
          userAgent: context.userAgent ?? null,
        },
      })
      .select(this.otpSelect())
      .single<OtpRequestRow>();

    if (inserted.error) {
      throw new BadRequestException(inserted.error.message);
    }

    await this.sendWhatsappOtp(normalizedPhoneNumber, otp);

    return {
      success: true,
      code: 'OTP_SENT',
      message: 'OTP sent through WhatsApp.',
      data: {
        requestId: inserted.data.otp_request_id,
        otpExpiresInSeconds: OTP_TTL_SECONDS,
        retryAfterSeconds: OTP_RESEND_COOLDOWN_SECONDS,
        maskedDestination: this.maskPhoneNumber(normalizedPhoneNumber),
      },
    };
  }

  async verifyOtp(input: {
    name?: string;
    phoneNumber: string;
    purpose: OtpPurpose;
    otpCode: string;
    visitorId?: string;
  }, context: AuthContext = {}) {
    const normalizedPhoneNumber = this.normalizePhoneNumber(input.phoneNumber);
    const otpRequest = await this.getLatestOtpRequest(
      normalizedPhoneNumber,
      input.purpose,
    );

    this.assertOtpRequestCanBeVerified(otpRequest);

    if (this.hashOtp(input.otpCode.trim()) !== otpRequest.otp_hash) {
      await this.incrementOtpAttempts(otpRequest);
    }

    await this.consumeOtpRequest(otpRequest.otp_request_id);

    if (input.purpose === 'register') {
      const user = await this.findOrCreatePhoneVerifiedUser({
        name:
          input.name?.trim() ||
          (typeof otpRequest.metadata?.name === 'string'
            ? otpRequest.metadata.name
            : ''),
        phone: input.phoneNumber,
        phoneNormalized: normalizedPhoneNumber,
      });

      if (input.visitorId ?? otpRequest.visitor_id) {
        await this.linkVisitorToUser(
          input.visitorId ?? otpRequest.visitor_id ?? '',
          user.user_id,
        );
      }

      await this.writeAuditLog(user.user_id, 'otp_register_verified', context, {
        phone: normalizedPhoneNumber,
      });

      return {
        success: true,
        code: 'PHONE_VERIFIED_PIN_REQUIRED',
        message: 'Phone verified. Create a 6-digit app PIN.',
        data: {
          user: this.mapUser(user),
          nextAction: 'PIN_SETUP_REQUIRED',
          pinSetupToken: await this.signPinSetupToken(user),
        },
      };
    }

    const user = await this.findUserByPhoneNumber(normalizedPhoneNumber);
    if (!user) {
      throw new UnauthorizedException('Account not found');
    }

    if (input.purpose === 'pin_reset') {
      await this.updateUserAccountStatus(user.user_id, 'RECOVERY_PENDING');
      await this.revokeUserSessions(user.user_id);
      await this.writeAuditLog(user.user_id, 'pin_reset_otp_verified', context);
      return {
        success: true,
        code: 'PIN_RESET_VERIFIED',
        message: 'OTP verified. Create a new 6-digit app PIN.',
        data: {
          user: this.mapUser(user),
          nextAction: 'PIN_RESET_REQUIRED',
          pinSetupToken: await this.signPinSetupToken(user),
        },
      };
    }

    const activeUser = await this.markLoginSuccess(user.user_id);
    const session = await this.createSession(activeUser, context);
    await this.writeAuditLog(activeUser.user_id, 'otp_login_success', context);
    return {
      success: true,
      code: 'OTP_LOGIN_SUCCESS',
      message: 'Login successful.',
      data: {
        accessToken: session.accessToken,
        refreshToken: session.refreshToken,
        session,
        user: this.mapUser(activeUser),
        nextAction: 'OPTIONAL_PASSKEY_ENROLL',
      },
    };
  }

  async setupPin(input: {
    pinSetupToken: string;
    pin: string;
    confirmPin: string;
  }, context: AuthContext = {}) {
    if (input.pin !== input.confirmPin) {
      throw new BadRequestException(
        this.errorPayload('PIN_CONFIRMATION_MISMATCH', 'PIN confirmation does not match.'),
      );
    }

    if (this.isWeakPin(input.pin)) {
      throw new BadRequestException(
        this.errorPayload('WEAK_PIN', 'Choose a less obvious 6-digit PIN.'),
      );
    }

    const userId = await this.verifyPinSetupToken(input.pinSetupToken);
    const user = await this.findUserById(userId);

    const phoneSuffix = (user.phone_normalized ?? user.phone ?? '').replace(
      /[^\d]/g,
      '',
    ).slice(-6);
    if (phoneSuffix && input.pin === phoneSuffix) {
      throw new BadRequestException(
        this.errorPayload(
          'PIN_MATCHES_PHONE',
          'PIN cannot match your phone number suffix.',
        ),
      );
    }

    await this.ensurePinWasNotRecentlyUsed(user.user_id, input.pin);
    const nextPinHash = await this.hashSecret(input.pin);

    const updated = await this.supabase.client
      .from('app_user')
      .update({
        pin_hash: nextPinHash,
        account_status: 'ACTIVE',
        preferred_auth_method: 'pin',
        pin_failed_attempts: 0,
        pin_locked_until: null,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', user.user_id)
      .select(this.appUserSelect())
      .single<AppUserBaseRow>();

    if (updated.error) {
      throw new BadRequestException(updated.error.message);
    }

    const activeUser = await this.attachRole(updated.data);
    await this.savePinHistory(activeUser.user_id, nextPinHash);
    await this.revokeUserSessions(activeUser.user_id);
    const session = await this.createSession(activeUser, context);
    await this.writeAuditLog(activeUser.user_id, 'pin_setup_success', context);
    return {
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
      session,
      user: this.mapUser(activeUser),
      nextAction: 'OPTIONAL_PASSKEY_ENROLL',
    };
  }

  async getLoginOptions(input: { phoneNumber: string }) {
    const user = await this.findUserByPhoneNumber(
      this.normalizePhoneNumber(input.phoneNumber),
    );

    if (!user) {
      return {
        success: true,
        code: 'ACCOUNT_NOT_FOUND',
        message: 'No active account found for this phone number.',
        data: {
          accountState: 'VISITOR',
          methods: ['otp_register'],
        },
      };
    }

    return {
      success: true,
      code: 'LOGIN_OPTIONS',
      message: 'Login options loaded.',
      data: {
        accountState: user.account_status ?? 'ACTIVE',
        methods: [
          ...(user.pin_hash ? ['pin'] : []),
          ...((user.passkey_count ?? 0) > 0 ? ['passkey'] : []),
          'otp_fallback',
        ],
      },
    };
  }

  async loginWithPin(input: { phoneNumber: string; pin: string }, context: AuthContext = {}) {
    const normalizedPhoneNumber = this.normalizePhoneNumber(input.phoneNumber);
    const user = await this.findUserByPhoneNumber(normalizedPhoneNumber);

    if (!user?.pin_hash) {
      throw new UnauthorizedException(
        this.errorPayload('INVALID_PIN_LOGIN', 'Invalid phone number or PIN.'),
      );
    }

    if (
      user.pin_locked_until &&
      new Date(user.pin_locked_until).getTime() > Date.now()
    ) {
      throw new UnauthorizedException(
        this.errorPayload('PIN_LOCKED', 'Too many failed attempts. Try again later.', {
          lockedUntil: user.pin_locked_until,
          retryAfterSeconds: Math.max(
            1,
            Math.ceil(
              (new Date(user.pin_locked_until).getTime() - Date.now()) / 1000,
            ),
          ),
        }),
      );
    }

    if (
      user.account_status !== 'ACTIVE' &&
      user.account_status !== 'LOCKED_TEMPORARILY'
    ) {
      throw new UnauthorizedException(
        this.errorPayload(
          'ACCOUNT_NOT_ACTIVE',
          'This account is not ready for PIN login. Use OTP recovery or complete registration.',
        ),
      );
    }

    const isValidPin = await this.verifySecret(input.pin, user.pin_hash);
    if (!isValidPin) {
      const failedAttempt = await this.recordFailedPinAttempt(user);
      await this.writeAuditLog(user.user_id, 'pin_login_failed', context, {
        attemptsRemaining: failedAttempt.attemptsRemaining,
      });
      throw new UnauthorizedException(
        this.errorPayload('INVALID_PIN_LOGIN', 'Invalid phone number or PIN.', {
          attemptsRemaining: failedAttempt.attemptsRemaining,
          lockedUntil: failedAttempt.lockedUntil,
          retryAfterSeconds: failedAttempt.retryAfterSeconds,
        }),
      );
    }

    const activeUser = await this.markLoginSuccess(user.user_id);
    const session = await this.createSession(activeUser, context);
    await this.writeAuditLog(activeUser.user_id, 'pin_login_success', context);
    return {
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
      session,
      user: this.mapUser(activeUser),
    };
  }

  async getPasskeyRegistrationOptions(
    userId: string,
    input: { deviceLabel?: string; platform?: string },
  ) {
    const user = await this.findUserById(userId);
    const existingCredentials = await this.getUserPasskeys(user.user_id);
    const publicKey = await generateRegistrationOptions({
      rpName: 'GolfKakis',
      rpID: this.getWebAuthnRpId(),
      userName: user.phone_normalized ?? user.phone ?? user.user_id,
      userID: Buffer.from(user.user_id),
      userDisplayName: user.name ?? 'GolfKakis user',
      timeout: 60000,
      attestationType: 'none',
      excludeCredentials: existingCredentials.map((credential) => ({
        id: credential.credential_id,
        transports: (credential.transports ?? undefined) as never,
      })),
      authenticatorSelection: {
        residentKey: 'preferred',
        userVerification: 'preferred',
      },
    });
    const challengeId = await this.createPasskeyChallenge({
      userId: user.user_id,
      purpose: 'register',
      challenge: publicKey.challenge,
      metadata: input,
    });

    return {
      success: true,
      code: 'PASSKEY_REGISTER_OPTIONS',
      message: 'Passkey registration challenge created.',
      data: {
        challengeId,
        publicKey,
      },
    };
  }

  async getPasskeyLoginOptions(input: { phoneNumber?: string | null }) {
    const user = input.phoneNumber
      ? await this.findUserByPhoneNumber(this.normalizePhoneNumber(input.phoneNumber))
      : null;
    const credentials = user ? await this.getUserPasskeys(user.user_id) : [];
    const publicKey = await generateAuthenticationOptions({
      rpID: this.getWebAuthnRpId(),
      timeout: 60000,
      userVerification: 'preferred',
      allowCredentials: credentials.length
        ? credentials.map((credential) => ({
            id: credential.credential_id,
            transports: (credential.transports ?? undefined) as never,
          }))
        : undefined,
    });
    const challengeId = await this.createPasskeyChallenge({
      userId: user?.user_id ?? null,
      purpose: 'authenticate',
      challenge: publicKey.challenge,
      metadata: {},
    });

    return {
      success: true,
      code: 'PASSKEY_LOGIN_OPTIONS',
      message: 'Passkey login challenge created.',
      data: {
        challengeId,
        publicKey,
      },
    };
  }

  async verifyPasskeyRegistration(
    userId: string,
    input: {
      challengeId: string;
      credential: RegistrationResponseJSON;
      deviceLabel?: string;
      platform?: string;
    },
    context: AuthContext = {},
  ) {
    const user = await this.findUserById(userId);
    const challenge = await this.getPasskeyChallenge(
      input.challengeId,
      'register',
      user.user_id,
    );

    let verification: Awaited<ReturnType<typeof verifyRegistrationResponse>>;
    try {
      verification = await verifyRegistrationResponse({
        response: input.credential,
        expectedChallenge: challenge.challenge,
        expectedOrigin: this.getWebAuthnOrigins(),
        expectedRPID: challenge.rp_id,
        requireUserVerification: true,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Passkey registration verification failed.';
      console.warn('Passkey registration verification failed', {
        message,
        expectedRPID: challenge.rp_id,
        expectedOrigins: this.getWebAuthnOrigins(),
      });
      throw new UnauthorizedException(
        this.errorPayload(
          'PASSKEY_REGISTRATION_FAILED',
          'Passkey registration failed.',
          { verificationMessage: message },
        ),
      );
    }

    if (!verification.verified || !verification.registrationInfo) {
      throw new UnauthorizedException(
        this.errorPayload('PASSKEY_REGISTRATION_FAILED', 'Passkey registration failed.'),
      );
    }

    const { registrationInfo } = verification;
    const inserted = await this.supabase.client
      .from('user_passkey_credential')
      .insert({
        passkey_id: randomUUID(),
        user_id: user.user_id,
        credential_id: registrationInfo.credential.id,
        public_key: this.base64Url(Buffer.from(registrationInfo.credential.publicKey)),
        sign_count: registrationInfo.credential.counter,
        transports: input.credential.response.transports ?? null,
        device_label: input.deviceLabel ?? null,
        platform: input.platform ?? null,
        aaguid: registrationInfo.aaguid,
        is_discoverable: true,
        is_backup_eligible: registrationInfo.credentialDeviceType === 'multiDevice',
        is_backed_up: registrationInfo.credentialBackedUp,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select('passkey_id, credential_id, device_label, platform, created_at')
      .single<{
        passkey_id: string;
        credential_id: string;
        device_label: string | null;
        platform: string | null;
        created_at: string;
      }>();

    if (inserted.error) {
      throw new BadRequestException(inserted.error.message);
    }

    await this.consumePasskeyChallenge(challenge.challenge_id);
    await this.writeAuditLog(user.user_id, 'passkey_registered', context, {
      passkeyId: inserted.data.passkey_id,
    });

    return {
      success: true,
      code: 'PASSKEY_REGISTERED',
      message: 'Passkey registered successfully.',
      data: {
        passkey: {
          passkeyId: inserted.data.passkey_id,
          credentialId: inserted.data.credential_id,
          label: inserted.data.device_label,
          platform: inserted.data.platform,
          createdAt: inserted.data.created_at,
        },
      },
    };
  }

  async verifyPasskeyLogin(
    input: {
      challengeId: string;
      credential: AuthenticationResponseJSON;
    },
    context: AuthContext = {},
  ) {
    const credential = await this.findPasskeyByCredentialId(input.credential.id);
    const challenge = await this.getPasskeyChallenge(
      input.challengeId,
      'authenticate',
      null,
    );
    if (challenge.user_id && challenge.user_id !== credential.user_id) {
      throw new UnauthorizedException(
        this.errorPayload('PASSKEY_CHALLENGE_INVALID', 'Passkey challenge is invalid.'),
      );
    }

    let verification: Awaited<ReturnType<typeof verifyAuthenticationResponse>>;
    try {
      verification = await verifyAuthenticationResponse({
        response: input.credential,
        expectedChallenge: challenge.challenge,
        expectedOrigin: this.getWebAuthnOrigins(),
        expectedRPID: challenge.rp_id,
        credential: this.toWebAuthnCredential(credential),
        requireUserVerification: true,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Passkey login verification failed.';
      console.warn('Passkey login verification failed', {
        message,
        expectedRPID: challenge.rp_id,
        expectedOrigins: this.getWebAuthnOrigins(),
      });
      throw new UnauthorizedException(
        this.errorPayload('PASSKEY_LOGIN_FAILED', 'Passkey login failed.', {
          verificationMessage: message,
        }),
      );
    }

    if (!verification.verified) {
      throw new UnauthorizedException(
        this.errorPayload('PASSKEY_LOGIN_FAILED', 'Passkey login failed.'),
      );
    }

    await this.supabase.client
      .from('user_passkey_credential')
      .update({
        sign_count: verification.authenticationInfo.newCounter,
        last_used_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('passkey_id', credential.passkey_id);
    await this.consumePasskeyChallenge(challenge.challenge_id);

    const activeUser = await this.markLoginSuccess(credential.user_id);
    const session = await this.createSession(activeUser, context);
    await this.writeAuditLog(activeUser.user_id, 'passkey_login_success', context, {
      passkeyId: credential.passkey_id,
    });

    return {
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
      session,
      user: this.mapUser(activeUser),
    };
  }

  async getCurrentUser(userId: string) {
    const user = await this.findUserById(userId);
    return this.mapUser(user);
  }

  async refreshSession(input: { refreshToken: string }, context: AuthContext = {}) {
    const refreshTokenHash = this.hashRefreshToken(input.refreshToken);
    const result = await this.supabase.client
      .from('auth_session')
      .select('session_id, user_id, refresh_token_hash, expires_at, revoked_at')
      .eq('refresh_token_hash', refreshTokenHash)
      .is('revoked_at', null)
      .maybeSingle<AuthSessionRow>();

    if (result.error) {
      throw new BadRequestException(result.error.message);
    }

    if (
      !result.data ||
      new Date(result.data.expires_at).getTime() < Date.now()
    ) {
      throw new UnauthorizedException(
        this.errorPayload('INVALID_REFRESH_TOKEN', 'Invalid or expired refresh token.'),
      );
    }

    await this.revokeSession(result.data.session_id);
    const user = await this.findUserById(result.data.user_id);
    const session = await this.createSession(user, context);
    await this.writeAuditLog(user.user_id, 'session_refreshed', context);

    return {
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
      session,
      user: this.mapUser(user),
    };
  }

  async logout(sessionId: string, userId: string, context: AuthContext = {}) {
    await this.revokeSession(sessionId);
    await this.writeAuditLog(userId, 'logout', context, { sessionId });
    return {
      success: true,
      code: 'LOGOUT_SUCCESS',
      message: 'Logged out successfully.',
    };
  }

  async ensureSessionIsActive(sessionId: string, userId: string) {
    const result = await this.supabase.client
      .from('auth_session')
      .select('session_id, user_id, refresh_token_hash, expires_at, revoked_at')
      .eq('session_id', sessionId)
      .eq('user_id', userId)
      .maybeSingle<AuthSessionRow>();

    if (result.error || !result.data || result.data.revoked_at) {
      throw new UnauthorizedException('Session has been revoked');
    }

    if (new Date(result.data.expires_at).getTime() < Date.now()) {
      throw new UnauthorizedException('Session has expired');
    }

    await this.supabase.client
      .from('auth_session')
      .update({ last_seen_at: new Date().toISOString() })
      .eq('session_id', sessionId);
  }

  async ensureAdminAccess(userId: string) {
    const user = await this.getCurrentUser(userId);

    if (user.roleId !== 1 && user.roleId !== 2) {
      throw new ForbiddenException('Admin access is required');
    }

    return user;
  }

  private async findOrCreatePhoneVerifiedUser(input: {
    name: string;
    phone: string;
    phoneNormalized: string;
  }) {
    const existing = await this.findUserByPhoneNumber(input.phoneNormalized);
    const now = new Date().toISOString();

    if (existing) {
      const updated = await this.supabase.client
        .from('app_user')
        .update({
          name: input.name || existing.name,
          phone: input.phone,
          phone_normalized: input.phoneNormalized,
          is_phone_verified: true,
          phone_verified_at: existing.phone_verified_at ?? now,
          account_status: existing.pin_hash ? 'ACTIVE' : 'PHONE_VERIFIED',
          updated_at: now,
        })
        .eq('user_id', existing.user_id)
        .select(this.appUserSelect())
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
        name: input.name,
        phone: input.phone,
        phone_normalized: input.phoneNormalized,
        is_phone_verified: true,
        phone_verified_at: now,
        account_status: 'PHONE_VERIFIED',
        preferred_auth_method: 'pin',
        pin_failed_attempts: 0,
        created_at: now,
        updated_at: now,
      })
      .select(this.appUserSelect())
      .single<AppUserBaseRow>();

    if (inserted.error) {
      throw new BadRequestException(inserted.error.message);
    }

    return this.attachRole(inserted.data);
  }

  private async findUserById(userId: string) {
    const result = await this.supabase.client
      .from('app_user')
      .select(this.appUserSelect())
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
      .select(this.appUserSelect())
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
    const [roleId, passkeyCount] = await Promise.all([
      this.getPrimaryRoleId(user.user_id),
      this.getPasskeyCount(user.user_id),
    ]);
    return {
      ...user,
      role_id: roleId,
      passkey_count: passkeyCount,
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

  private async getPasskeyCount(userId: string) {
    const result = await this.supabase.client
      .from('user_passkey_credential')
      .select('passkey_id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .is('revoked_at', null);

    if (result.error) {
      return 0;
    }

    return result.count ?? 0;
  }

  private async getUserPasskeys(userId: string) {
    const result = await this.supabase.client
      .from('user_passkey_credential')
      .select(
        'passkey_id, user_id, credential_id, public_key, sign_count, transports, device_label, platform, revoked_at',
      )
      .eq('user_id', userId)
      .is('revoked_at', null)
      .returns<PasskeyCredentialRow[]>();

    if (result.error) {
      throw new BadRequestException(result.error.message);
    }

    return result.data ?? [];
  }

  private async findPasskeyByCredentialId(credentialId: string) {
    const result = await this.supabase.client
      .from('user_passkey_credential')
      .select(
        'passkey_id, user_id, credential_id, public_key, sign_count, transports, device_label, platform, revoked_at',
      )
      .eq('credential_id', credentialId)
      .is('revoked_at', null)
      .maybeSingle<PasskeyCredentialRow>();

    if (result.error) {
      throw new BadRequestException(result.error.message);
    }

    if (!result.data) {
      throw new UnauthorizedException(
        this.errorPayload('PASSKEY_NOT_FOUND', 'Passkey credential not found.'),
      );
    }

    return result.data;
  }

  private async getPasskeyChallenge(
    challengeId: string,
    purpose: 'register' | 'authenticate',
    userId: string | null,
  ) {
    const query = this.supabase.client
      .from('auth_passkey_challenge')
      .select(
        'challenge_id, user_id, purpose, challenge, rp_id, origin, expires_at, consumed_at, metadata',
      )
      .eq('challenge_id', challengeId)
      .eq('purpose', purpose);
    const result = userId ? await query.eq('user_id', userId).maybeSingle<PasskeyChallengeRow>() : await query.maybeSingle<PasskeyChallengeRow>();

    if (result.error) {
      throw new BadRequestException(result.error.message);
    }

    if (!result.data || result.data.consumed_at) {
      throw new UnauthorizedException(
        this.errorPayload('PASSKEY_CHALLENGE_INVALID', 'Passkey challenge is invalid.'),
      );
    }

    if (new Date(result.data.expires_at).getTime() < Date.now()) {
      throw new UnauthorizedException(
        this.errorPayload('PASSKEY_CHALLENGE_EXPIRED', 'Passkey challenge has expired.'),
      );
    }

    return result.data;
  }

  private async consumePasskeyChallenge(challengeId: string) {
    const result = await this.supabase.client
      .from('auth_passkey_challenge')
      .update({ consumed_at: new Date().toISOString() })
      .eq('challenge_id', challengeId);

    if (result.error) {
      throw new BadRequestException(result.error.message);
    }
  }

  private async ensureOtpCooldown(phoneNormalized: string, purpose: OtpPurpose) {
    const cooldownStartedAt = new Date(
      Date.now() - OTP_RESEND_COOLDOWN_SECONDS * 1000,
    ).toISOString();
    const result = await this.supabase.client
      .from('auth_otp_request')
      .select('otp_request_id, created_at')
      .eq('phone_normalized', phoneNormalized)
      .eq('purpose', purpose)
      .gte('created_at', cooldownStartedAt)
      .is('consumed_at', null)
      .limit(1)
      .maybeSingle<{ otp_request_id: string; created_at: string }>();

    if (result.error) {
      throw new BadRequestException(result.error.message);
    }

    if (result.data) {
      const retryAfterSeconds = Math.max(
        1,
        OTP_RESEND_COOLDOWN_SECONDS -
          Math.floor(
            (Date.now() - new Date(result.data.created_at).getTime()) / 1000,
          ),
      );
      throw new BadRequestException(
        this.errorPayload(
          'OTP_RATE_LIMITED',
          'Please wait before requesting another OTP.',
          { retryAfterSeconds },
        ),
      );
    }
  }

  private async getLatestOtpRequest(
    phoneNormalized: string,
    purpose: OtpPurpose,
  ) {
    const result = await this.supabase.client
      .from('auth_otp_request')
      .select(this.otpSelect())
      .eq('phone_normalized', phoneNormalized)
      .eq('purpose', purpose)
      .is('consumed_at', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle<OtpRequestRow>();

    if (result.error) {
      throw new BadRequestException(result.error.message);
    }

    if (!result.data) {
      throw new UnauthorizedException(
        this.errorPayload('OTP_REQUEST_NOT_FOUND', 'OTP request not found.'),
      );
    }

    return result.data;
  }

  private assertOtpRequestCanBeVerified(otpRequest: OtpRequestRow) {
    if (new Date(otpRequest.expires_at).getTime() < Date.now()) {
      throw new UnauthorizedException(
        this.errorPayload('OTP_EXPIRED', 'OTP code has expired. Request a new code.'),
      );
    }

    if (otpRequest.attempts >= otpRequest.max_attempts) {
      throw new UnauthorizedException(
        this.errorPayload('OTP_ATTEMPTS_EXCEEDED', 'Too many OTP attempts. Request a new code.'),
      );
    }
  }

  private async incrementOtpAttempts(otpRequest: OtpRequestRow) {
    const nextAttempts = otpRequest.attempts + 1;
    await this.supabase.client
      .from('auth_otp_request')
      .update({ attempts: nextAttempts })
      .eq('otp_request_id', otpRequest.otp_request_id);

    const attemptsRemaining = Math.max(otpRequest.max_attempts - nextAttempts, 0);
    throw new UnauthorizedException(
      this.errorPayload('INVALID_OTP', 'Invalid OTP code.', {
        attemptsRemaining,
        maxAttempts: otpRequest.max_attempts,
      }),
    );
  }

  private async consumeOtpRequest(otpRequestId: string) {
    const result = await this.supabase.client
      .from('auth_otp_request')
      .update({ consumed_at: new Date().toISOString() })
      .eq('otp_request_id', otpRequestId);

    if (result.error) {
      throw new BadRequestException(result.error.message);
    }
  }

  private async recordFailedPinAttempt(user: AppUserRow) {
    const attempts = (user.pin_failed_attempts ?? 0) + 1;
    const lockUntil =
      attempts >= PIN_MAX_ATTEMPTS
        ? new Date(Date.now() + PIN_LOCK_MINUTES * 60 * 1000).toISOString()
        : null;

    await this.supabase.client
      .from('app_user')
      .update({
        pin_failed_attempts: attempts,
        pin_locked_until: lockUntil,
        account_status: lockUntil ? 'LOCKED_TEMPORARILY' : user.account_status,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', user.user_id);

    return {
      attemptsRemaining: Math.max(PIN_MAX_ATTEMPTS - attempts, 0),
      lockedUntil: lockUntil,
      retryAfterSeconds: lockUntil ? PIN_LOCK_MINUTES * 60 : null,
    };
  }

  private async markLoginSuccess(userId: string) {
    const updated = await this.supabase.client
      .from('app_user')
      .update({
        account_status: 'ACTIVE',
        pin_failed_attempts: 0,
        pin_locked_until: null,
        last_login_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId)
      .select(this.appUserSelect())
      .single<AppUserBaseRow>();

    if (updated.error) {
      throw new BadRequestException(updated.error.message);
    }

    return this.attachRole(updated.data);
  }

  private async updateUserAccountStatus(userId: string, accountStatus: string) {
    await this.supabase.client
      .from('app_user')
      .update({
        account_status: accountStatus,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId);
  }

  private async createPasskeyChallenge(input: {
    userId: string | null;
    purpose: 'register' | 'authenticate';
    challenge: string;
    metadata: Record<string, unknown>;
  }) {
    const challengeId = randomUUID();
    const result = await this.supabase.client
      .from('auth_passkey_challenge')
      .insert({
        challenge_id: challengeId,
        user_id: input.userId,
        purpose: input.purpose,
        challenge: input.challenge,
        rp_id: this.getWebAuthnRpId(),
        origin: this.config.get<string>('WEBAUTHN_ORIGIN') ?? null,
        expires_at: new Date(Date.now() + 60 * 1000).toISOString(),
        metadata: input.metadata,
      });

    if (result.error) {
      throw new BadRequestException(result.error.message);
    }

    return challengeId;
  }

  private async createSession(user: AppUserRow, context: AuthContext) {
    const sessionId = randomUUID();
    const refreshToken = this.base64Url(randomBytes(48));
    const refreshTokenHash = this.hashRefreshToken(refreshToken);
    const expiresAt = new Date(
      Date.now() + REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
    ).toISOString();

    const inserted = await this.supabase.client.from('auth_session').insert({
      session_id: sessionId,
      user_id: user.user_id,
      refresh_token_hash: refreshTokenHash,
      ip_address: context.ipAddress ?? null,
      user_agent: context.userAgent ?? null,
      last_seen_at: new Date().toISOString(),
      expires_at: expiresAt,
      created_at: new Date().toISOString(),
    });

    if (inserted.error) {
      throw new BadRequestException(inserted.error.message);
    }

    return {
      sessionId,
      accessToken: await this.signSessionToken(user, sessionId),
      refreshToken,
      expiresInSeconds: ACCESS_TOKEN_TTL_SECONDS,
      refreshExpiresAt: expiresAt,
    };
  }

  private async revokeSession(sessionId: string) {
    await this.supabase.client
      .from('auth_session')
      .update({ revoked_at: new Date().toISOString() })
      .eq('session_id', sessionId)
      .is('revoked_at', null);
  }

  private async revokeUserSessions(userId: string) {
    await this.supabase.client
      .from('auth_session')
      .update({ revoked_at: new Date().toISOString() })
      .eq('user_id', userId)
      .is('revoked_at', null);
  }

  private async writeAuditLog(
    userId: string | null,
    eventType: string,
    context: AuthContext,
    metadata: Record<string, unknown> = {},
  ) {
    await this.supabase.client.from('auth_audit_log').insert({
      audit_id: randomUUID(),
      user_id: userId,
      event_type: eventType,
      ip_address: context.ipAddress ?? null,
      user_agent: context.userAgent ?? null,
      metadata,
      created_at: new Date().toISOString(),
    });
  }

  private async ensurePinWasNotRecentlyUsed(userId: string, pin: string) {
    const result = await this.supabase.client
      .from('auth_pin_history')
      .select('pin_hash')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(PIN_HISTORY_LIMIT)
      .returns<{ pin_hash: string }[]>();

    if (result.error) {
      throw new BadRequestException(result.error.message);
    }

    for (const row of result.data ?? []) {
      if (await this.verifySecret(pin, row.pin_hash)) {
        throw new BadRequestException(
          this.errorPayload(
            'PIN_RECENTLY_USED',
            `Choose a PIN that was not used in your last ${PIN_HISTORY_LIMIT} PINs.`,
          ),
        );
      }
    }
  }

  private async savePinHistory(userId: string, pinHash: string) {
    await this.supabase.client.from('auth_pin_history').insert({
      pin_history_id: randomUUID(),
      user_id: userId,
      pin_hash: pinHash,
      created_at: new Date().toISOString(),
    });
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

    const inserted = await this.supabase.client.from('visitors').insert({
      id: visitorId,
      platform: 'web',
      linked_user_id: userId,
      last_seen_at: now,
    });

    if (inserted.error) {
      throw new BadRequestException(inserted.error.message);
    }
  }

  private async sendWhatsappOtp(phoneNumber: string, otp: string) {
    const accountSid = this.config.get<string>('TWILIO_ACCOUNT_SID');
    const authToken = this.config.get<string>('TWILIO_AUTH_TOKEN');
    const from =
      this.config.get<string>('TWILIO_WHATSAPP_FROM') ??
      'whatsapp:+14155238886';

    if (!accountSid || !authToken) {
      throw new BadRequestException('Twilio credentials are not configured');
    }

    const body = new URLSearchParams({
      From: from,
      To: `whatsapp:${phoneNumber}`,
      Body: `Your GolfKakis code is ${otp}`,
    });

    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${Buffer.from(
            `${accountSid}:${authToken}`,
          ).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body,
      },
    );

    if (!response.ok) {
      const text = await response.text();
      throw new BadRequestException(
        `Unable to send WhatsApp OTP through Twilio: ${text || response.statusText}`,
      );
    }
  }

  private async signSessionToken(user: AppUserRow, sessionId: string) {
    const secret = new TextEncoder().encode(this.getJwtSecret());

    return new SignJWT({
      phone: user.phone_normalized ?? user.phone ?? '',
      sid: sessionId,
      type: 'app-session',
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime(`${ACCESS_TOKEN_TTL_SECONDS}s`)
      .setSubject(user.user_id)
      .sign(secret);
  }

  private async signPinSetupToken(user: AppUserRow) {
    const secret = new TextEncoder().encode(this.getJwtSecret());

    return new SignJWT({
      phone: user.phone_normalized ?? user.phone ?? '',
      type: 'pin-setup',
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('15m')
      .setSubject(user.user_id)
      .sign(secret);
  }

  private async verifyPinSetupToken(token: string) {
    try {
      const { payload } = await jwtVerify(
        token,
        new TextEncoder().encode(this.getJwtSecret()),
      );
      if (payload.type !== 'pin-setup' || typeof payload.sub !== 'string') {
        throw new UnauthorizedException('Invalid PIN setup token');
      }

      return payload.sub;
    } catch {
      throw new UnauthorizedException('Invalid PIN setup token');
    }
  }

  private mapUser(user: AppUserRow) {
    const roleId = user.role_id ?? null;

    return {
      userId: user.user_id,
      authId: user.auth_id,
      name: user.name ?? '',
      username: user.username ?? '',
      phoneNumber: user.phone_normalized ?? user.phone ?? '',
      roleId,
      roleName: this.getRoleName(roleId),
      isPhoneVerified: user.is_phone_verified ?? false,
      accountStatus: user.account_status ?? 'ACTIVE',
      preferredAuthMethod: user.preferred_auth_method ?? 'pin',
      hasPin: Boolean(user.pin_hash),
      hasPasskey: (user.passkey_count ?? 0) > 0,
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

  private appUserSelect() {
    return 'user_id, auth_id, name, username, password_hash, pin_hash, phone, phone_normalized, is_phone_verified, phone_verified_at, account_status, preferred_auth_method, last_login_at, pin_failed_attempts, pin_locked_until, created_at, updated_at';
  }

  private otpSelect() {
    return 'otp_request_id, purpose, phone, phone_normalized, user_id, visitor_id, channel, otp_hash, expires_at, attempts, max_attempts, consumed_at, created_at, metadata';
  }

  private normalizePhoneNumber(phoneNumber: string) {
    const digits = phoneNumber.replace(/[^\d]/g, '');

    if (!digits || digits.length < 8) {
      throw new BadRequestException('Invalid phone number');
    }

    if (digits.startsWith('60')) {
      return `+${digits}`;
    }

    if (digits.startsWith('0')) {
      return `+60${digits.slice(1)}`;
    }

    return `+${digits}`;
  }

  private errorPayload(
    code: string,
    message: string,
    details: Record<string, unknown> = {},
  ) {
    return {
      success: false,
      code,
      message,
      ...details,
    };
  }

  private generateOtpCode() {
    return randomInt(0, 1_000_000).toString().padStart(6, '0');
  }

  private hashOtp(otp: string) {
    const pepper = this.getJwtSecret();
    return createHash('sha256').update(`${otp}:${pepper}`).digest('hex');
  }

  private isWeakPin(pin: string) {
    return (
      ['000000', '111111', '123456', '654321', '121212', '112233'].includes(
        pin,
      ) || /^(\d)\1{5}$/.test(pin)
    );
  }

  private async hashSecret(secret: string) {
    return bcrypt.hash(secret, 12);
  }

  private async verifySecret(secret: string, storedHash: string) {
    if (storedHash.startsWith('$2')) {
      return bcrypt.compare(secret, storedHash);
    }

    const [scheme, salt, key] = storedHash.split(':');
    if (scheme !== 'scrypt' || !salt || !key) {
      return false;
    }

    const expected = Buffer.from(key, 'hex');
    const actual = (await scrypt(secret, salt, expected.length)) as Buffer;

    return (
      expected.length === actual.length && timingSafeEqual(expected, actual)
    );
  }

  private maskPhoneNumber(phoneNumber: string) {
    return phoneNumber.replace(/(\+\d{4})\d+(\d{3})$/, '$1****$2');
  }

  private base64Url(value: Buffer) {
    return value
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/g, '');
  }

  private base64UrlToBuffer(value: string) {
    const padded = value.replace(/-/g, '+').replace(/_/g, '/');
    return Buffer.from(padded, 'base64');
  }

  private hashRefreshToken(refreshToken: string) {
    return createHash('sha256')
      .update(`${refreshToken}:${this.getJwtSecret()}`)
      .digest('hex');
  }

  private toWebAuthnCredential(row: PasskeyCredentialRow): WebAuthnCredential {
    return {
      id: row.credential_id,
      publicKey: this.base64UrlToBuffer(row.public_key),
      counter: Number(row.sign_count ?? 0),
      transports: (row.transports ?? undefined) as never,
    };
  }

  async verifyCaptcha(captchaToken?: string, ipAddress?: string | null) {
    const secret = this.config.get<string>('CAPTCHA_SECRET');
    const provider = this.config.get<string>('CAPTCHA_PROVIDER') ?? 'turnstile';
    const mustVerify =
      Boolean(secret) || this.config.get<string>('NODE_ENV') === 'production';

    if (!mustVerify) {
      return;
    }

    if (!secret || !captchaToken) {
      throw new BadRequestException(
        this.errorPayload('CAPTCHA_REQUIRED', 'Captcha verification is required.'),
      );
    }

    const endpoint =
      provider === 'recaptcha'
        ? 'https://www.google.com/recaptcha/api/siteverify'
        : 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
    const body = new URLSearchParams({
      secret,
      response: captchaToken,
    });

    if (ipAddress) {
      body.set('remoteip', ipAddress);
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    const result = (await response.json()) as {
      success?: boolean;
      'error-codes'?: string[];
      hostname?: string;
      action?: string;
      cdata?: string;
    };

    if (!response.ok || !result.success) {
      const errorCodes = result['error-codes'] ?? [];
      console.warn('Captcha verification failed', {
        provider,
        status: response.status,
        errorCodes,
        hostname: result.hostname,
        action: result.action,
      });
      throw new BadRequestException(
        this.errorPayload('CAPTCHA_FAILED', 'Captcha verification failed.', {
          captchaErrorCodes: errorCodes,
        }),
      );
    }
  }

  private getJwtSecret() {
    return (
      this.config.get<string>('APP_AUTH_JWT_SECRET') ??
      'dev-mock-app-auth-secret'
    );
  }

  private getWebAuthnRpId() {
    return this.config.get<string>('WEBAUTHN_RP_ID') ?? 'localhost';
  }

  private getWebAuthnOrigin() {
    return this.getWebAuthnOrigins()[0];
  }

  private getWebAuthnOrigins() {
    const configuredOrigins =
      this.config.get<string>('WEBAUTHN_ORIGINS') ??
      this.config.get<string>('WEBAUTHN_ORIGIN');

    return (
      configuredOrigins
        ?.split(',')
        .map((origin) => origin.trim())
        .filter(Boolean) ?? ['http://localhost:3000']
    );
  }
}
