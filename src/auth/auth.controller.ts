import {
  Body,
  Controller,
  Delete,
  Get,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import { AppAuthGuard } from './app-auth.guard';
import { AuthService } from './auth.service';

const OtpPurposeSchema = z.enum(['register', 'login_fallback', 'pin_reset']);

const SendOtpSchema = z.object({
  name: z.string().trim().min(1).optional(),
  phoneNumber: z.string().trim().min(1),
  purpose: OtpPurposeSchema,
  visitorId: z.string().uuid().optional(),
  channel: z.enum(['whatsapp']).optional(),
  captchaToken: z.string().trim().min(1).optional(),
});

const VerifyOtpSchema = z.object({
  name: z.string().trim().min(1).optional(),
  phoneNumber: z.string().trim().min(1),
  purpose: OtpPurposeSchema,
  otpCode: z.string().trim().min(1),
  visitorId: z.string().uuid().optional(),
});

const PinSetupSchema = z.object({
  pinSetupToken: z.string().trim().min(1),
  pin: z.string().regex(/^\d{6}$/),
  confirmPin: z.string().regex(/^\d{6}$/),
});

const PinLoginSchema = z.object({
  phoneNumber: z.string().trim().min(1),
  pin: z.string().regex(/^\d{6}$/),
});

const LoginOptionsSchema = z.object({
  phoneNumber: z.string().trim().min(1),
});

const PasskeyOptionsSchema = z.object({
  phoneNumber: z.string().trim().min(1).optional().nullable(),
  deviceLabel: z.string().trim().min(1).optional(),
  platform: z.string().trim().min(1).optional(),
});

const PasskeyRegisterVerifySchema = z.object({
  challengeId: z.string().uuid(),
  credential: z.any(),
  deviceLabel: z.string().trim().min(1).optional(),
  platform: z.string().trim().min(1).optional(),
});

const PasskeyLoginVerifySchema = z.object({
  challengeId: z.string().uuid(),
  credential: z.any(),
});

const RefreshSessionSchema = z.object({
  refreshToken: z.string().trim().min(1),
});

const UpdateCurrentUserSchema = z
  .object({
    name: z.string().trim().min(1).optional(),
    email: z.string().trim().email().nullable().optional(),
    dateOfBirth: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable()
      .optional(),
    username: z.string().trim().min(1).nullable().optional(),
  })
  .refine(
    (value) =>
      value.name !== undefined ||
      value.email !== undefined ||
      value.dateOfBirth !== undefined ||
      value.username !== undefined,
    {
      message: 'At least one profile field is required',
    },
  );

const ProfileImageUploadUrlSchema = z.object({
  fileName: z.string().trim().min(1),
  contentType: z.string().trim().min(1).optional(),
});

const ProfileImageUpdateSchema = z.object({
  bucket: z.string().trim().min(1).optional(),
  path: z.string().trim().min(1),
});

function getAuthContext(req: {
  ip?: string;
  headers?: Record<string, string | string[] | undefined>;
}) {
  const forwardedFor = req.headers?.['x-forwarded-for'];
  const clientPlatform = req.headers?.['x-client-platform'];
  return {
    ipAddress: Array.isArray(forwardedFor)
      ? forwardedFor[0]
      : forwardedFor?.split(',')[0]?.trim() || req.ip || null,
    userAgent:
      (Array.isArray(req.headers?.['user-agent'])
        ? req.headers?.['user-agent'][0]
        : req.headers?.['user-agent']) ?? null,
    clientPlatform:
      (Array.isArray(clientPlatform) ? clientPlatform[0] : clientPlatform) ??
      null,
  };
}

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Get('me')
  @UseGuards(AppAuthGuard)
  getCurrentUser(@Req() req: { appUser?: { sub: string } }) {
    return this.authService.getCurrentUser(req.appUser?.sub ?? '');
  }

  @Patch('me')
  @UseGuards(AppAuthGuard)
  updateCurrentUser(
    @Req() req: { appUser?: { sub: string } },
    @Body() body: unknown,
  ) {
    const data = UpdateCurrentUserSchema.parse(body);
    return this.authService.updateCurrentUserProfile(
      req.appUser?.sub ?? '',
      data,
    );
  }

  @Post('me/profile-image/upload-url')
  @UseGuards(AppAuthGuard)
  createProfileImageUploadUrl(
    @Req() req: { appUser?: { sub: string } },
    @Body() body: unknown,
  ) {
    const data = ProfileImageUploadUrlSchema.parse(body);
    return this.authService.createProfileImageUploadUrl(
      req.appUser?.sub ?? '',
      data,
    );
  }

  @Post('me/profile-image')
  @UseGuards(AppAuthGuard)
  updateProfileImage(
    @Req() req: { appUser?: { sub: string } },
    @Body() body: unknown,
  ) {
    const data = ProfileImageUpdateSchema.parse(body);
    return this.authService.updateProfileImage(req.appUser?.sub ?? '', data);
  }

  @Post('me/profile-image/delete')
  @UseGuards(AppAuthGuard)
  deleteProfileImage(@Req() req: { appUser?: { sub: string } }) {
    return this.authService.deleteProfileImage(req.appUser?.sub ?? '');
  }

  @Delete('me/profile-image')
  @UseGuards(AppAuthGuard)
  deleteProfileImageRest(@Req() req: { appUser?: { sub: string } }) {
    return this.authService.deleteProfileImage(req.appUser?.sub ?? '');
  }

  @Post('otp/send')
  sendOtp(
    @Body() body: unknown,
    @Req()
    req: {
      ip?: string;
      headers?: Record<string, string | string[] | undefined>;
    },
  ) {
    const data = SendOtpSchema.parse(body);
    return this.authService.sendOtp(data, getAuthContext(req));
  }

  @Post('otp/verify')
  verifyOtp(
    @Body() body: unknown,
    @Req()
    req: {
      ip?: string;
      headers?: Record<string, string | string[] | undefined>;
    },
  ) {
    const data = VerifyOtpSchema.parse(body);
    return this.authService.verifyOtp(data, getAuthContext(req));
  }

  @Post('pin/setup')
  setupPin(
    @Body() body: unknown,
    @Req()
    req: {
      ip?: string;
      headers?: Record<string, string | string[] | undefined>;
    },
  ) {
    const data = PinSetupSchema.parse(body);
    return this.authService.setupPin(data, getAuthContext(req));
  }

  @Post('login/options')
  getLoginOptions(@Body() body: unknown) {
    const data = LoginOptionsSchema.parse(body);
    return this.authService.getLoginOptions(data);
  }

  @Post('login/pin')
  loginWithPin(
    @Body() body: unknown,
    @Req()
    req: {
      ip?: string;
      headers?: Record<string, string | string[] | undefined>;
    },
  ) {
    const data = PinLoginSchema.parse(body);
    return this.authService.loginWithPin(data, getAuthContext(req));
  }

  @Post('passkeys/register/options')
  @UseGuards(AppAuthGuard)
  getPasskeyRegistrationOptions(
    @Req() req: { appUser?: { sub: string } },
    @Body() body: unknown,
  ) {
    const data = PasskeyOptionsSchema.parse(body);
    return this.authService.getPasskeyRegistrationOptions(
      req.appUser?.sub ?? '',
      data,
    );
  }

  @Post('passkeys/register/verify')
  @UseGuards(AppAuthGuard)
  verifyPasskeyRegistration(
    @Req()
    req: {
      appUser?: { sub: string };
      ip?: string;
      headers?: Record<string, string | string[] | undefined>;
    },
    @Body() body: unknown,
  ) {
    const data = PasskeyRegisterVerifySchema.parse(body);
    return this.authService.verifyPasskeyRegistration(
      req.appUser?.sub ?? '',
      data,
      getAuthContext(req),
    );
  }

  @Post('passkeys/login/options')
  getPasskeyLoginOptions(@Body() body: unknown) {
    const data = PasskeyOptionsSchema.parse(body);
    return this.authService.getPasskeyLoginOptions(data);
  }

  @Post('passkeys/login/verify')
  verifyPasskeyLogin(
    @Req()
    req: {
      ip?: string;
      headers?: Record<string, string | string[] | undefined>;
    },
    @Body() body: unknown,
  ) {
    const data = PasskeyLoginVerifySchema.parse(body);
    return this.authService.verifyPasskeyLogin(data, getAuthContext(req));
  }

  @Post('session/refresh')
  refreshSession(
    @Req()
    req: {
      ip?: string;
      headers?: Record<string, string | string[] | undefined>;
    },
    @Body() body: unknown,
  ) {
    const data = RefreshSessionSchema.parse(body);
    return this.authService.refreshSession(data, getAuthContext(req));
  }

  @Post('logout')
  @UseGuards(AppAuthGuard)
  logout(
    @Req()
    req: {
      appUser?: { sub: string; sid?: string };
      ip?: string;
      headers?: Record<string, string | string[] | undefined>;
    },
  ) {
    return this.authService.logout(
      req.appUser?.sid ?? '',
      req.appUser?.sub ?? '',
      getAuthContext(req),
    );
  }
}
