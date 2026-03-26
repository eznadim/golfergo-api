import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { BookingService } from './booking.service';
import { IdempotencyService } from './idempotency.service';
import { PhoneService } from './phone.service';

@Injectable()
export class BookingHoldService {
  constructor(
    private readonly bookingService: BookingService,
    private readonly idempotencyService: IdempotencyService,
    private readonly phoneService: PhoneService,
  ) {}

  async createBookingHold(
    input: {
      slotId: string;
      playType: '9_holes' | '18_holes';
      selectedNine?: string;
      hostName: string;
      hostPhoneNumber: string;
      playerCount: number;
      normalPlayerCount: number;
      seniorPlayerCount: number;
      caddieArrangement: 'none' | 'shared' | 'per_player';
      buggyType: 'none' | 'normal';
      buggySharingPreference?: 'shared' | 'mixed' | 'solo';
      paymentMethod: 'pay_counter';
      source: 'web' | 'ios' | 'android';
    },
    idempotencyKey: string,
    deviceId?: string,
  ) {
    this.bookingService.validateHoldRequest(input);

    const existing =
      await this.idempotencyService.getExistingBookingHold(idempotencyKey);
    if (existing?.booking_id) {
      const aggregate = await this.bookingService.getBookingAggregateById(
        existing.booking_id,
      );
      return this.bookingService.buildHoldResponse(aggregate);
    }

    const slotContext = await this.bookingService.getSlotContextById(input.slotId);
    const availability = await this.bookingService.getSlotAvailability(slotContext);
    const bookingConfig = this.bookingService.buildBookingConfig(input);
    const counts = this.bookingService.getRequestedBookingCounts(bookingConfig);
    this.bookingService.ensureCapacityAvailable(counts, availability);

    const normalizedPhoneNumber = this.phoneService.normalizePhoneNumber(
      input.hostPhoneNumber,
    );
    const hostUser = await this.bookingService.findOrCreateAppUser(
      input.hostName,
      input.hostPhoneNumber,
      normalizedPhoneNumber,
    );
    const visitorId = await this.bookingService.resolveVisitorId(deviceId);
    const now = new Date().toISOString();
    const bookingId = randomUUID();
    const bookingRef = this.bookingService.generateBookingRef();
    const holdExpiresAt = new Date(Date.now() + 300 * 1000).toISOString();
    const pricing = this.bookingService.calculateBookingPricing(
      availability,
      bookingConfig,
      counts,
    );

    await this.bookingService.insertBooking({
      booking_id: bookingId,
      user_id: hostUser.user_id,
      organization_id: slotContext.organization.organization_id,
      sport_id: slotContext.organizationSport.sport_id,
      status: 'held',
      total_amount: pricing.grandTotal,
      created_at: now,
      booking_ref: bookingRef,
      visitor_id: visitorId,
      slot_id: slotContext.slot.slot_id,
      is_phone_verified: hostUser.is_phone_verified ?? false,
      booking_source: input.source,
      confirmed_at: null,
      cancelled_at: null,
      cancellation_reason: null,
      updated_at: now,
      hold_expires_at: holdExpiresAt,
    });

    await this.bookingService.insertBookingLineItems(
      bookingId,
      slotContext,
      availability,
      counts,
      bookingConfig,
      pricing,
    );
    await this.bookingService.insertBookingStatusHistory(bookingId, null, 'held');
    await this.idempotencyService.saveBookingHold(
      idempotencyKey,
      visitorId,
      hostUser.user_id,
      bookingId,
    );

    const aggregate = await this.bookingService.getBookingAggregateById(bookingId);
    return this.bookingService.buildHoldResponse(aggregate);
  }
}
