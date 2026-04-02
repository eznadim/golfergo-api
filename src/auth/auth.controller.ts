import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { AppAuthGuard } from './app-auth.guard';
import { AuthService } from './auth.service';

const RequestOtpSchema = z.object({
  name: z.string().trim().min(1),
  phoneNumber: z.string().trim().min(1),
  visitorId: z.string().uuid().optional(),
});

const VerifyOtpSchema = z.object({
  name: z.string().trim().min(1),
  phoneNumber: z.string().trim().min(1),
  otp: z.string().trim().min(1),
  visitorId: z.string().uuid().optional(),
});

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Get('me')
  @UseGuards(AppAuthGuard)
  getCurrentUser(@Req() req: { appUser?: { sub: string } }) {
    return this.authService.getCurrentUser(req.appUser?.sub ?? '');
  }

  @Get('mock-otp')
  getMockOtp() {
    return {
      mockOtpCode: '000000',
      message: 'Mock OTP is enabled for local development.',
    };
  }

  @Post('request-otp')
  requestOtp(@Body() body: unknown) {
    const data = RequestOtpSchema.parse(body);
    return this.authService.requestOtp(data);
  }

  @Post('verify-otp')
  verifyOtp(@Body() body: unknown) {
    const data = VerifyOtpSchema.parse(body);
    return this.authService.verifyOtp(data);
  }
}
