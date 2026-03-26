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
} from '@nestjs/common';
import { z } from 'zod';
import { BookingService } from './booking.service';

const AvailableSlotsSchema = z.object({
  golfClubSlug: z.string().min(1),
  bookingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

const DraftSummarySchema = z.object({
  slotId: z.string().min(1),
  playerCount: z.number().int().positive(),
  caddieCount: z.number().int().min(0),
  golfCartCount: z.number().int().min(0),
});

const CreateHoldSchema = z.object({
  slotId: z.string().min(1),
  hostName: z.string().min(1),
  hostPhoneNumber: z.string().min(1),
  playerCount: z.number().int().positive(),
  caddieCount: z.number().int().min(0),
  golfCartCount: z.number().int().min(0),
  source: z.enum(['web', 'ios', 'android']),
});

const PlayerDetailSchema = z.object({
  name: z.string().min(1),
  phoneNumber: z.string().min(1),
});

const SubmitBookingSchema = z.object({
  bookingRef: z.string().min(1),
  playerDetails: z.array(PlayerDetailSchema).min(1),
});

const UpdateBookingSchema = z.object({
  hostName: z.string().min(1).optional(),
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
  constructor(private readonly bookingService: BookingService) {}

  @Get('golf-clubs')
  getGolfClubs() {
    return this.bookingService.fetchGolfClubList();
  }

  @Post('available-slots')
  getAvailableSlots(@Body() body: unknown) {
    const data = AvailableSlotsSchema.parse(body);
    return this.bookingService.fetchAvailableSlots(data);
  }

  @Post('draft-summary')
  getDraftSummary(@Body() body: unknown) {
    const data = DraftSummarySchema.parse(body);
    return this.bookingService.getDraftSummary(data);
  }

  @Post('hold')
  createBookingHold(
    @Body() body: unknown,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Headers('x-device-id') deviceId: string | undefined,
  ) {
    if (!idempotencyKey) {
      throw new BadRequestException('Idempotency-Key header is required');
    }

    const data = CreateHoldSchema.parse(body);
    return this.bookingService.createBookingHold(data, idempotencyKey, deviceId);
  }

  @Post('submit')
  submitBooking(@Body() body: unknown) {
    const data = SubmitBookingSchema.parse(body);
    return this.bookingService.submitBooking(data);
  }

  @Get('list/upcoming')
  fetchUpcomingBookings(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.bookingService.fetchBookingList('upcoming', {
      page: parsePositiveInteger(page, 1, 'page'),
      pageSize: parsePositiveInteger(pageSize, 20, 'pageSize'),
    });
  }

  @Get('list/past')
  fetchPastBookings(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.bookingService.fetchBookingList('past', {
      page: parsePositiveInteger(page, 1, 'page'),
      pageSize: parsePositiveInteger(pageSize, 20, 'pageSize'),
    });
  }

  @Get(':bookingRef')
  fetchBookingDetails(@Param('bookingRef') bookingRef: string) {
    return this.bookingService.fetchBookingDetails(bookingRef);
  }

  @Put(':bookingRef')
  updateBookingDetails(
    @Param('bookingRef') bookingRef: string,
    @Body() body: unknown,
  ) {
    const data = UpdateBookingSchema.parse(body);
    return this.bookingService.updateBookingDetails(bookingRef, data);
  }

  @Post(':bookingRef/cancel')
  cancelBooking(@Param('bookingRef') bookingRef: string, @Body() body: unknown) {
    const data = CancelBookingSchema.parse(body);
    return this.bookingService.cancelBooking(bookingRef, data.reason);
  }
}
