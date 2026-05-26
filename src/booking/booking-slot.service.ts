import { Injectable } from '@nestjs/common';
import { BookingService } from './booking.service';

@Injectable()
export class BookingSlotService {
  constructor(private readonly bookingService: BookingService) {}

  fetchAvailableSlots(input: {
    golfClubSlug: string;
    bookingDate: string;
    playType: '9_holes' | '18_holes';
    selectedNine?: string;
  }) {
    return this.bookingService.fetchAvailableSlots(input);
  }

  async fetchSlotDetails(slotId: string) {
    const slotContext = await this.bookingService.getSlotContextById(slotId);
    const availability =
      await this.bookingService.getSlotAvailability(slotContext);
    const playType = this.bookingService.getSlotPlayType(
      slotContext.teeInstance,
      slotContext.slot,
    );
    const minPlayers =
      this.bookingService.toNumber(slotContext.teeInstance.min_players) || 1;
    const maxPlayers = this.bookingService.toNumber(
      slotContext.teeInstance.max_players,
    );

    return {
      slotId: slotContext.slot.slot_id,
      golfClubSlug: slotContext.organization.slug,
      golfClubName:
        slotContext.facility.facility_name ?? slotContext.organization.name,
      bookingDate: this.bookingService.extractDate(slotContext.slot.start_at),
      teeTimeSlot: this.bookingService.formatTeeTime(slotContext.slot.start_at),
      localTime: this.bookingService.formatLocalTime(slotContext.slot.start_at),
      startAt: slotContext.slot.start_at,
      endAt: slotContext.slot.end_at,
      noOfHoles: playType === '9_holes' ? 9 : 18,
      playType,
      pricingCategory: slotContext.teeInstance.pricing_category,
      selectedNine: null,
      currency: 'MYR',
      minPlayers,
      maxPlayers,
      playerCount: maxPlayers,
      remainingPlayerCapacity: availability.playerCapacity,
      available:
        availability.activeBookingCount === 0 &&
        availability.playerCapacity > 0,
      price: {
        adult: availability.teeTimeUnitPrice,
        seniorJunior: availability.seniorJuniorUnitPrice,
      },
      categoryPricing: [
        {
          label: 'Normal',
          description: 'Standard adult published rate',
          amount: availability.teeTimeUnitPrice,
        },
        {
          label: 'Senior',
          description: 'Reduced published rate for senior players',
          amount: availability.seniorJuniorUnitPrice,
        },
        {
          label: 'Junior',
          description: 'Reduced published rate for junior players',
          amount: availability.seniorJuniorUnitPrice,
        },
      ],
      addOns: {
        caddyFee: availability.caddieUnitPrice,
        buggyFeePerPlayer: availability.golfCartUnitPrice,
        insuranceFeePerPlayer: 5,
        singleRiderSurcharge: 43.2,
      },
    };
  }
}
