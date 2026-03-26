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
    const config = this.bookingService.extractBookingConfig(aggregate.lineItems);

    if (displayStatus === 'expired') {
      throw new GoneException('Booking hold has expired');
    }

    if (displayStatus !== 'held') {
      throw new ConflictException('Booking is not in held status');
    }

    await this.bookingService.replaceBookingPlayers(
      aggregate.booking.booking_id,
      input.playerDetails.map((player) => ({
        name: player.name,
        phone_number: this.phoneService.normalizePhoneNumber(player.phoneNumber),
        category: player.category,
      })),
    );

    const now = new Date().toISOString();
    await this.bookingService.updateBookingRow(aggregate.booking.booking_id, {
      status: 'confirmed',
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
        playType: config.playType,
        selectedNine: config.selectedNine,
        playerCount: config.playerCount,
        normalPlayerCount: config.normalPlayerCount,
        seniorPlayerCount: config.seniorPlayerCount,
        caddieArrangement: config.caddieArrangement,
        buggyType: config.buggyType,
        buggySharingPreference: config.buggySharingPreference,
        grandTotal: this.bookingService.toNumber(refreshed.booking.total_amount),
        currency: 'MYR',
        paymentMethod: config.paymentMethod,
      },
    };
  }
}
