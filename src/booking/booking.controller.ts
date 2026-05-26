import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import { AppAuthGuard } from '../auth/app-auth.guard';
import { AuthService } from '../auth/auth.service';
import { BookingAdminService } from './booking-admin.service';
import { BookingCancelService } from './booking-cancel.service';
import { BookingClubService } from './booking-club.service';
import { BookingDetailsService } from './booking-details.service';
import { BookingHoldService } from './booking-hold.service';
import { BookingListService } from './booking-list.service';
import { BookingQuickBookService } from './booking-quick-book.service';
import { BookingSlotService } from './booking-slot.service';
import { BookingSubmitService } from './booking-submit.service';
import { BookingUpdateService } from './booking-update.service';

const AvailableSlotsSchema = z.object({
  golfClubSlug: z.string().min(1),
  bookingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  playType: z.enum(['9_holes', '18_holes']),
  selectedNine: z.string().min(1).optional(),
});

const CreateHoldSchema = z.object({
  slotId: z.string().min(1),
  hostName: z.string().min(1),
  hostPhoneNumber: z.string().min(1),
  source: z.enum(['web', 'ios', 'android']),
});

const PlayerDetailSchema = z.object({
  name: z.string().min(1),
  phoneNumber: z.string().min(1),
  category: z.enum(['adult', 'normal', 'senior', 'junior']),
  isHost: z.boolean(),
});

const SubmitBookingSchema = z.object({
  bookingRef: z.string().min(1),
  caddieArrangement: z.enum(['none', 'shared', 'per_player']),
  buggyType: z.enum(['jumbo', 'normal']).optional(),
  buggyQuantity: z.number().int().min(1).max(3).optional(),
  buggySharingPreference: z.enum(['shared', 'mixed', 'single']).optional(),
  playerDetails: z.array(PlayerDetailSchema).min(1),
  voucherCode: z.string().trim().min(1).optional(),
  acknowledgedTerms: z.literal(true),
  captchaToken: z.string().trim().min(1).optional(),
});

const PreviewBookingSchema = z.object({
  bookingRef: z.string().min(1),
  caddieArrangement: z.enum(['none', 'shared', 'per_player']),
  buggyType: z.enum(['jumbo', 'normal']).optional(),
  buggyQuantity: z.number().int().min(1).max(3).optional(),
  buggySharingPreference: z.enum(['shared', 'mixed', 'single']).optional(),
  playerDetails: z.array(PlayerDetailSchema).min(1),
  voucherCode: z.string().trim().min(1).optional(),
});

const UpdateBookingSchema = z.object({
  hostName: z.string().min(1).optional(),
  hostPhoneNumber: z.string().min(1).optional(),
  caddieArrangement: z.enum(['none', 'shared', 'per_player']).optional(),
  buggyType: z.enum(['jumbo', 'normal']).optional(),
  buggyQuantity: z.number().int().min(1).max(3).optional(),
  buggySharingPreference: z.enum(['shared', 'mixed', 'single']).optional(),
  playerDetails: z.array(PlayerDetailSchema).min(1).optional(),
});

const CancelBookingSchema = z.object({
  reason: z.string().min(1),
});

const AdminSlotBoardSchema = z.object({
  golfClubSlug: z.string().min(1),
  bookingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

const QuickBookSchema = z.object({
  golfClubSlug: z.string().min(1).optional(),
  latitude: z.number().finite().optional(),
  longitude: z.number().finite().optional(),
  maxResults: z.number().int().positive().max(10).optional(),
  searchDays: z.number().int().positive().max(14).optional(),
});

function parsePositiveInteger(
  value: string | undefined,
  fallback: number,
  fieldName: string,
) {
  if (!value) return fallback;

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new BadRequestException(`${fieldName} must be a positive integer`);
  }

  return parsed;
}

function getRequestIp(req: {
  ip?: string;
  headers?: Record<string, string | string[] | undefined>;
}) {
  const forwardedFor = req.headers?.['x-forwarded-for'];
  return Array.isArray(forwardedFor)
    ? forwardedFor[0]
    : forwardedFor?.split(',')[0]?.trim() || req.ip || null;
}

function getClientPlatform(req: {
  headers?: Record<string, string | string[] | undefined>;
}) {
  const clientPlatform = req.headers?.['x-client-platform'];
  return (
    (Array.isArray(clientPlatform) ? clientPlatform[0] : clientPlatform) ?? null
  );
}

@Controller('booking')
export class BookingController {
  constructor(
    private readonly authService: AuthService,
    private readonly bookingClubService: BookingClubService,
    private readonly bookingAdminService: BookingAdminService,
    private readonly bookingSlotService: BookingSlotService,
    private readonly bookingHoldService: BookingHoldService,
    private readonly bookingSubmitService: BookingSubmitService,
    private readonly bookingDetailsService: BookingDetailsService,
    private readonly bookingListService: BookingListService,
    private readonly bookingQuickBookService: BookingQuickBookService,
    private readonly bookingUpdateService: BookingUpdateService,
    private readonly bookingCancelService: BookingCancelService,
  ) {}

  @Get('golf-clubs')
  getGolfClubs(@Query('slug') golfClubSlug?: string) {
    return this.bookingClubService.fetchGolfClubs(golfClubSlug);
  }

  @Get('admin/slot-board')
  @UseGuards(AppAuthGuard)
  async fetchAdminSlotBoard(
    @Req() req: { appUser?: { sub: string } },
    @Query('golfClubSlug') golfClubSlug?: string,
    @Query('bookingDate') bookingDate?: string,
  ) {
    await this.authService.ensureAdminAccess(req.appUser?.sub ?? '');
    const data = AdminSlotBoardSchema.parse({ golfClubSlug, bookingDate });
    return this.bookingAdminService.fetchAdminSlotBoard(data);
  }

  @Get('admin/bookings')
  @UseGuards(AppAuthGuard)
  async fetchAdminBookedBookings(@Req() req: { appUser?: { sub: string } }) {
    await this.authService.ensureAdminAccess(req.appUser?.sub ?? '');
    return this.bookingAdminService.fetchAdminBookedBookings();
  }

  @Get('admin/:bookingRef')
  @UseGuards(AppAuthGuard)
  async fetchAdminBookingDetails(
    @Param('bookingRef') bookingRef: string,
    @Req() req: { appUser?: { sub: string } },
  ) {
    await this.authService.ensureAdminAccess(req.appUser?.sub ?? '');
    return this.bookingAdminService.fetchAdminBookingDetails(bookingRef);
  }

  @Post('available-slots')
  getAvailableSlots(@Body() body: unknown) {
    const data = AvailableSlotsSchema.parse(body);
    return this.bookingSlotService.fetchAvailableSlots(data);
  }

  @Post('quick-book')
  getQuickBook(@Body() body: unknown) {
    const data = QuickBookSchema.parse(body);
    return this.bookingQuickBookService.fetchQuickBook(data);
  }

  @Post('hold')
  @UseGuards(AppAuthGuard)
  createBookingHold(
    @Body() body: unknown,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Headers('x-device-id') deviceId: string | undefined,
    @Req() req: { appUser?: { sub: string } },
  ) {
    if (!idempotencyKey) {
      throw new BadRequestException('Idempotency-Key header is required');
    }

    const data = CreateHoldSchema.parse(body);
    return this.bookingHoldService.createBookingHold(
      data,
      idempotencyKey,
      req.appUser?.sub ?? '',
      deviceId,
    );
  }

  @Post('submit')
  @UseGuards(AppAuthGuard)
  async submitBooking(
    @Body() body: unknown,
    @Req()
    req: {
      appUser?: { sub: string };
      ip?: string;
      headers?: Record<string, string | string[] | undefined>;
    },
  ) {
    const data = SubmitBookingSchema.parse(body);
    if (
      !this.authService.isMobileClient({
        clientPlatform: getClientPlatform(req),
        userAgent: Array.isArray(req.headers?.['user-agent'])
          ? req.headers?.['user-agent'][0]
          : (req.headers?.['user-agent'] ?? null),
      })
    ) {
      await this.authService.verifyCaptcha(
        data.captchaToken,
        getRequestIp(req),
      );
    }
    return this.bookingSubmitService.submitBooking(
      data,
      req.appUser?.sub ?? '',
    );
  }

  @Post(':bookingRef/extend-hold')
  @UseGuards(AppAuthGuard)
  extendBookingHold(
    @Param('bookingRef') bookingRef: string,
    @Req() req: { appUser?: { sub: string } },
  ) {
    return this.bookingHoldService.extendBookingHold(
      bookingRef,
      req.appUser?.sub ?? '',
    );
  }

  @Post('preview')
  @UseGuards(AppAuthGuard)
  previewBooking(
    @Body() body: unknown,
    @Req() req: { appUser?: { sub: string } },
  ) {
    const data = PreviewBookingSchema.parse(body);
    return this.bookingSubmitService.previewBooking(
      data,
      req.appUser?.sub ?? '',
    );
  }

  @Get('list/upcoming')
  @UseGuards(AppAuthGuard)
  fetchUpcomingBookings(
    @Req() req: { appUser?: { sub: string } },
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.bookingListService.fetchUpcomingBookings({
      userId: req.appUser?.sub ?? '',
      page: parsePositiveInteger(page, 1, 'page'),
      pageSize: parsePositiveInteger(pageSize, 20, 'pageSize'),
    });
  }

  @Get('list/past')
  @UseGuards(AppAuthGuard)
  fetchPastBookings(
    @Req() req: { appUser?: { sub: string } },
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.bookingListService.fetchPastBookings({
      userId: req.appUser?.sub ?? '',
      page: parsePositiveInteger(page, 1, 'page'),
      pageSize: parsePositiveInteger(pageSize, 20, 'pageSize'),
    });
  }

  @Get(':bookingRef')
  @UseGuards(AppAuthGuard)
  fetchBookingDetails(
    @Param('bookingRef') bookingRef: string,
    @Req() req: { appUser?: { sub: string } },
  ) {
    return this.bookingDetailsService.fetchBookingDetails(
      bookingRef,
      req.appUser?.sub ?? '',
    );
  }

  @Put(':bookingRef')
  @UseGuards(AppAuthGuard)
  updateBookingDetails(
    @Param('bookingRef') bookingRef: string,
    @Body() body: unknown,
    @Req() req: { appUser?: { sub: string } },
  ) {
    const data = UpdateBookingSchema.parse(body);
    return this.bookingUpdateService.updateBookingDetails(
      bookingRef,
      data,
      req.appUser?.sub ?? '',
    );
  }

  @Post(':bookingRef/cancel')
  @UseGuards(AppAuthGuard)
  cancelBooking(
    @Param('bookingRef') bookingRef: string,
    @Body() body: unknown,
    @Req() req: { appUser?: { sub: string } },
  ) {
    const data = CancelBookingSchema.parse(body);
    return this.bookingCancelService.cancelBooking(
      bookingRef,
      data.reason,
      req.appUser?.sub ?? '',
    );
  }
}
