import { Injectable } from '@nestjs/common';
import { BookingService } from './booking.service';
import { PhoneService } from './phone.service';

@Injectable()
export class BookingUpdateService {
  constructor(
    private readonly bookingService: BookingService,
    private readonly phoneService: PhoneService,
  ) {}

  async updateBookingDetails(
    bookingRef: string,
    input: {
      hostName?: string;
      hostPhoneNumber?: string;
      caddieArrangement?: 'none' | 'shared' | 'per_player';
      buggyType?: 'jumbo' | 'normal';
      buggySharingPreference?: 'shared' | 'mixed' | 'single';
      playerDetails?: Array<{
        name: string;
        phoneNumber: string;
        category: 'normal' | 'senior';
        isHost: boolean;
      }>;
    },
    userId: string,
  ) {
    const aggregate = await this.bookingService.getBookingAggregateByRef(bookingRef);
    this.bookingService.assertBookingOwnedByUser(aggregate.booking, userId);
    const currentConfig = this.bookingService.extractBookingConfig(aggregate.lineItems);

    if (input.hostName && aggregate.booking.user_id) {
      await this.bookingService.updateAppUser(aggregate.booking.user_id, {
        name: input.hostName,
      });
    }

    if (input.hostPhoneNumber && aggregate.booking.user_id) {
      await this.bookingService.updateAppUser(aggregate.booking.user_id, {
        phone: input.hostPhoneNumber,
        phone_normalized: this.phoneService.normalizePhoneNumber(
          input.hostPhoneNumber,
        ),
      });
    }

    if (input.playerDetails) {
      await this.bookingService.replaceBookingPlayers(
        aggregate.booking.booking_id,
        input.playerDetails.map((player) => ({
          name: player.name,
          phone_number: this.phoneService.normalizePhoneNumber(player.phoneNumber),
          category: player.category,
        })),
      );
    }

    if (
      input.caddieArrangement !== undefined ||
      input.buggyType !== undefined ||
      input.buggySharingPreference !== undefined
    ) {
      await this.bookingService.updateBookingConfig(
        aggregate.booking.booking_id,
        currentConfig,
        input,
      );
    }

    const now = new Date().toISOString();
    await this.bookingService.updateBookingRow(aggregate.booking.booking_id, {
      updated_at: now,
    });

    return {
      bookingRef: aggregate.booking.booking_ref,
      status: this.bookingService.getDisplayStatus(aggregate.booking),
      updatedAt: now,
    };
  }
}
