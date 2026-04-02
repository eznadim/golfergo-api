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
      hostName: string;
      hostPhoneNumber: string;
      source: 'web' | 'ios' | 'android';
    },
    idempotencyKey: string,
    deviceId?: string,
  ) {
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
    this.bookingService.ensureSlotCanBeHeld(availability);

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

    await this.bookingService.insertBooking({
      booking_id: bookingId,
      user_id: hostUser.user_id,
      organization_id: slotContext.organization.organization_id,
      sport_id: slotContext.organizationSport.sport_id,
      status: 'held',
      total_amount: null,
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
      play_type: this.bookingService.getSlotPlayType(
        slotContext.teeInstance,
        slotContext.slot,
      ),
      selected_nine: this.bookingService.getSlotSelectedNine(
        slotContext.teeInstance,
        slotContext.slot,
      ),
      buggy_type: null,
      buggy_sharing_preference: null,
      caddy_arrangement: null,
      payment_method: 'pay_counter',
      estimated_total_amount: null,
    });
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
