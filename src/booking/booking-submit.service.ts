import { ConflictException, GoneException, Injectable } from '@nestjs/common';
import { BookingService } from './booking.service';
import { PhoneService } from './phone.service';

@Injectable()
export class BookingSubmitService {
  constructor(
    private readonly bookingService: BookingService,
    private readonly phoneService: PhoneService,
  ) {}

  async submitBooking(input: {
    bookingRef: string;
    caddieArrangement: 'none' | 'shared' | 'per_player';
    buggyType: 'jumbo' | 'normal';
    buggySharingPreference?: 'shared' | 'mixed' | 'single';
    playerDetails: Array<{
      name: string;
      phoneNumber: string;
      category: 'normal' | 'senior';
      isHost: boolean;
    }>;
    acknowledgedTerms: true;
  }) {
    const aggregate = await this.bookingService.getBookingAggregateByRef(
      input.bookingRef,
    );
    const displayStatus = this.bookingService.getDisplayStatus(aggregate.booking);

    if (displayStatus === 'expired') {
      throw new GoneException('Booking hold has expired');
    }

    if (displayStatus !== 'held') {
      throw new ConflictException('Booking is not in held status');
    }

    const slotContext = await this.bookingService.getSlotContextById(
      aggregate.booking.slot_id,
    );
    const availability = await this.bookingService.getSlotAvailability(
      slotContext,
      undefined,
      aggregate.booking.booking_id,
    );
    const bookingConfig = this.bookingService.buildBookingConfigFromSubmit({
      playType:
        aggregate.booking.play_type === '9_holes' ? '9_holes' : '18_holes',
      selectedNine: aggregate.booking.selected_nine,
      caddieArrangement: input.caddieArrangement,
      buggyType: input.buggyType,
      buggySharingPreference: input.buggySharingPreference,
      playerDetails: input.playerDetails,
    });
    const counts = this.bookingService.getRequestedBookingCounts(bookingConfig);
    this.bookingService.ensureCapacityAvailable(counts, availability);
    const pricing = this.bookingService.calculateBookingPricing(
      availability,
      bookingConfig,
      counts,
    );

    await this.bookingService.replaceBookingPlayers(
      aggregate.booking.booking_id,
      input.playerDetails.map((player) => ({
        name: player.name,
        phone_number: this.phoneService.normalizePhoneNumber(player.phoneNumber),
        category: player.category,
      })),
    );
    await this.bookingService.replaceBookingLineItems(
      aggregate.booking.booking_id,
      slotContext,
      availability,
      counts,
      bookingConfig,
      pricing,
    );

    const hostPlayer = input.playerDetails.find((player) => player.isHost);
    if (hostPlayer && aggregate.booking.user_id) {
      await this.bookingService.updateAppUser(aggregate.booking.user_id, {
        name: hostPlayer.name,
        phone: hostPlayer.phoneNumber,
        phone_normalized: this.phoneService.normalizePhoneNumber(hostPlayer.phoneNumber),
      });
    }

    const now = new Date().toISOString();
    await this.bookingService.updateBookingRow(aggregate.booking.booking_id, {
      status: 'confirmed',
      total_amount: pricing.grandTotal,
      buggy_type: bookingConfig.buggyType,
      buggy_sharing_preference: bookingConfig.buggySharingPreference,
      caddy_arrangement: bookingConfig.caddieArrangement,
      payment_method: bookingConfig.paymentMethod,
      estimated_total_amount: pricing.grandTotal,
      confirmed_at: now,
      hold_expires_at: null,
      updated_at: now,
    });
    await this.bookingService.insertBookingStatusHistory(
      aggregate.booking.booking_id,
      'held',
      'confirmed',
    );

    const refreshed = await this.bookingService.getBookingAggregateById(
      aggregate.booking.booking_id,
    );

    return {
      bookingId: refreshed.booking.booking_id,
      bookingRef: refreshed.booking.booking_ref,
      status: refreshed.booking.status,
      confirmedAt: refreshed.booking.confirmed_at,
      bookingSummary: {
        golfClubName: refreshed.facility?.facility_name ?? refreshed.organization.name,
        bookingDate: this.bookingService.extractDate(refreshed.slot.start_at),
        teeTimeSlot: this.bookingService.formatTeeTime(refreshed.slot.start_at),
        playType: bookingConfig.playType,
        selectedNine: bookingConfig.selectedNine,
        playerCount: bookingConfig.playerCount,
        normalPlayerCount: bookingConfig.normalPlayerCount,
        seniorPlayerCount: bookingConfig.seniorPlayerCount,
        caddieArrangement: bookingConfig.caddieArrangement,
        buggyType: bookingConfig.buggyType,
        buggySharingPreference: bookingConfig.buggySharingPreference,
        grandTotal: pricing.grandTotal,
        currency: 'MYR',
        paymentMethod: bookingConfig.paymentMethod,
      },
    };
  }
}
