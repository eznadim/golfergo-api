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
import { BookingCancelService } from './booking-cancel.service';
import { BookingClubService } from './booking-club.service';
import { BookingDetailsService } from './booking-details.service';
import { BookingHoldService } from './booking-hold.service';
import { BookingListService } from './booking-list.service';
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
  category: z.enum(['normal', 'senior']),
  isHost: z.boolean(),
});

const SubmitBookingSchema = z.object({
  bookingRef: z.string().min(1),
  caddieArrangement: z.enum(['none', 'shared', 'per_player']),
  buggyType: z.enum(['jumbo', 'normal']),
  buggySharingPreference: z.enum(['shared', 'mixed', 'single']).optional(),
  playerDetails: z.array(PlayerDetailSchema).min(1),
  acknowledgedTerms: z.literal(true),
});

const UpdateBookingSchema = z.object({
  hostName: z.string().min(1).optional(),
  hostPhoneNumber: z.string().min(1).optional(),
  caddieArrangement: z.enum(['none', 'shared', 'per_player']).optional(),
  buggyType: z.enum(['jumbo', 'normal']).optional(),
  buggySharingPreference: z.enum(['shared', 'mixed', 'single']).optional(),
  playerDetails: z.array(PlayerDetailSchema).min(1).optional(),
});

const CancelBookingSchema = z.object({
  reason: z.string().min(1),
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

@Controller('booking')
export class BookingController {
  constructor(
    private readonly bookingClubService: BookingClubService,
    private readonly bookingSlotService: BookingSlotService,
    private readonly bookingHoldService: BookingHoldService,
    private readonly bookingSubmitService: BookingSubmitService,
    private readonly bookingDetailsService: BookingDetailsService,
    private readonly bookingListService: BookingListService,
    private readonly bookingUpdateService: BookingUpdateService,
    private readonly bookingCancelService: BookingCancelService,
  ) {}

  @Get('golf-clubs')
  getGolfClubs() {
    return this.bookingClubService.fetchGolfClubList();
  }

  @Post('available-slots')
  getAvailableSlots(@Body() body: unknown) {
    const data = AvailableSlotsSchema.parse(body);
    return this.bookingSlotService.fetchAvailableSlots(data);
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
  submitBooking(
    @Body() body: unknown,
    @Req() req: { appUser?: { sub: string } },
  ) {
    const data = SubmitBookingSchema.parse(body);
    return this.bookingSubmitService.submitBooking(data, req.appUser?.sub ?? '');
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
