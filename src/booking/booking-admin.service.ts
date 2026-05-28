import { Injectable, NotFoundException } from '@nestjs/common';
import { BookingService } from './booking.service';

type SlotBoardItem = {
  slotKey: string;
  slotId: string;
  teeTimeSlot: string;
  startAt: string;
  endAt: string;
  playType: '9_holes' | '18_holes';
  selectedNine: string | null;
  status: 'open' | 'held' | 'confirmed' | 'completed' | 'cancelled';
  remainingPlayerCapacity: number;
  currency: string;
  fromPrice: number;
  booking: null | {
    bookingRef: string;
    status: string;
    hostName: string;
    hostPhoneNumber: string;
    playerCount: number;
    grandTotal: number;
    currency: string;
  };
};

type SlotBoardStatus = SlotBoardItem['status'];

type AdminBookedListItem = {
  bookingRef: string;
  status: 'confirmed' | 'completed';
  golfClubName: string;
  golfClubSlug: string;
  bookingDate: string;
  teeTimeSlot: string;
  playType: '9_holes' | '18_holes';
  selectedNine: string | null;
  hostName: string;
  hostPhoneNumber: string;
  playerCount: number;
  grandTotal: number;
  currency: string;
  createdAt: string;
};

@Injectable()
export class BookingAdminService {
  constructor(private readonly bookingService: BookingService) {}

  private toSlotBoardStatus(status: string): SlotBoardStatus {
    if (
      status === 'held' ||
      status === 'confirmed' ||
      status === 'completed' ||
      status === 'cancelled'
    ) {
      return status;
    }

    return 'open';
  }

  private getPrimaryAggregateForSlot(
    aggregates: Awaited<ReturnType<BookingService['buildBookingAggregate']>>[],
  ) {
    return [...aggregates].sort((left, right) => {
      const leftStatus = this.bookingService.getDisplayStatus(left.booking);
      const rightStatus = this.bookingService.getDisplayStatus(right.booking);

      if (leftStatus === rightStatus) {
        return (
          new Date(right.booking.created_at).getTime() -
          new Date(left.booking.created_at).getTime()
        );
      }

      if (leftStatus === 'confirmed') {
        return -1;
      }

      if (rightStatus === 'confirmed') {
        return 1;
      }

      if (leftStatus === 'held') {
        return -1;
      }

      if (rightStatus === 'held') {
        return 1;
      }

      return 0;
    })[0];
  }

  private getSlotStatusFromAggregates(
    aggregates: Awaited<ReturnType<BookingService['buildBookingAggregate']>>[],
  ): SlotBoardStatus {
    if (
      aggregates.some(
        (aggregate) =>
          this.bookingService.getDisplayStatus(aggregate.booking) ===
          'confirmed',
      )
    ) {
      return 'confirmed';
    }

    if (
      aggregates.some(
        (aggregate) =>
          this.bookingService.getDisplayStatus(aggregate.booking) === 'held',
      )
    ) {
      return 'held';
    }

    return 'open';
  }

  async fetchAdminSlotBoard(input: {
    golfClubSlug: string;
    bookingDate: string;
  }) {
    const clubs = await this.bookingService.fetchGolfClubList();
    const selectedClub = clubs.find((club) => club.slug === input.golfClubSlug);

    if (!selectedClub) {
      throw new NotFoundException(
        `Golf club not found for slug: ${input.golfClubSlug}`,
      );
    }

    const slotResponses = await Promise.all([
      this.bookingService.fetchAvailableSlots({
        golfClubSlug: input.golfClubSlug,
        bookingDate: input.bookingDate,
        playType: '18_holes',
      }),
    ]);

    const bookingRows = await this.bookingService.getBookingRowsForList();
    const relevantAggregates = (
      await Promise.all(
        bookingRows.map((booking) =>
          this.bookingService.buildBookingAggregate(booking),
        ),
      )
    )
      .filter(
        (aggregate) =>
          aggregate.organization.slug === input.golfClubSlug &&
          this.bookingService.extractDate(aggregate.slot.start_at) ===
            input.bookingDate,
      )
      .filter((aggregate) => {
        const status = this.bookingService.getDisplayStatus(aggregate.booking);
        return (
          status === 'held' ||
          status === 'confirmed' ||
          status === 'completed' ||
          status === 'cancelled'
        );
      })
      .sort(
        (left, right) =>
          new Date(left.slot.start_at).getTime() -
          new Date(right.slot.start_at).getTime(),
      );

    const bookingAggregatesBySlotId = new Map<
      string,
      Awaited<ReturnType<BookingService['buildBookingAggregate']>>[]
    >();

    for (const aggregate of relevantAggregates) {
      const existing =
        bookingAggregatesBySlotId.get(aggregate.slot.slot_id) ?? [];
      existing.push(aggregate);
      bookingAggregatesBySlotId.set(aggregate.slot.slot_id, existing);
    }

    const slotItems = new Map<string, SlotBoardItem>();

    for (const response of slotResponses) {
      for (const slot of response.slots) {
        const slotKey = `${slot.slotId}:${response.playType}:all`;

        slotItems.set(slotKey, {
          slotKey,
          slotId: slot.slotId,
          teeTimeSlot: slot.teeTimeSlot,
          startAt: slot.startAt,
          endAt: slot.endAt,
          playType: response.playType,
          selectedNine: null,
          status: 'open',
          remainingPlayerCapacity: slot.remainingPlayerCapacity,
          currency: slot.currency,
          fromPrice: slot.fromPrice,
          booking: null,
        });
      }
    }

    for (const [slotId, aggregates] of bookingAggregatesBySlotId.entries()) {
      const primaryAggregate = this.getPrimaryAggregateForSlot(aggregates);
      const config = this.bookingService.getReadableBookingConfig(
        primaryAggregate.booking,
        primaryAggregate.lineItems,
      );
      const existingItem = [...slotItems.values()].find(
        (item) => item.slotId === slotId,
      );
      const slotStatus = this.getSlotStatusFromAggregates(aggregates);
      const slotKey =
        existingItem?.slotKey ?? `${slotId}:${config.playType}:all`;

      slotItems.set(slotKey, {
        slotKey,
        slotId,
        teeTimeSlot:
          existingItem?.teeTimeSlot ??
          this.bookingService.formatTeeTime(primaryAggregate.slot.start_at),
        startAt: existingItem?.startAt ?? primaryAggregate.slot.start_at,
        endAt: existingItem?.endAt ?? primaryAggregate.slot.end_at,
        playType: existingItem?.playType ?? config.playType,
        selectedNine: null,
        status: slotStatus,
        remainingPlayerCapacity: existingItem?.remainingPlayerCapacity ?? 0,
        currency: existingItem?.currency ?? 'MYR',
        fromPrice:
          existingItem?.fromPrice ??
          primaryAggregate.booking.pricing_snapshot?.prices.basePrice ??
          this.bookingService.toNumber(
            primaryAggregate.booking.estimated_total_amount,
          ),
        booking: {
          bookingRef: primaryAggregate.booking.booking_ref,
          status: this.bookingService.getDisplayStatus(
            primaryAggregate.booking,
          ),
          hostName:
            primaryAggregate.hostUser?.name ??
            primaryAggregate.players[0]?.name ??
            'Unknown',
          hostPhoneNumber:
            primaryAggregate.hostUser?.phone_normalized ??
            primaryAggregate.hostUser?.phone ??
            primaryAggregate.players[0]?.phone_number ??
            '',
          playerCount: config.playerCount,
          grandTotal: this.bookingService.toNumber(
            primaryAggregate.booking.total_amount,
          ),
          currency: 'MYR',
        },
      });
    }

    const items = [...slotItems.values()].sort(
      (left, right) =>
        new Date(left.startAt).getTime() - new Date(right.startAt).getTime(),
    );

    const openCount = items.filter((item) => item.status === 'open').length;
    const bookedCount = items.filter((item) => item.booking !== null).length;
    const heldCount = items.filter((item) => item.status === 'held').length;

    return {
      club: {
        slug: selectedClub.slug,
        name: selectedClub.name,
      },
      bookingDate: input.bookingDate,
      summary: {
        totalSlots: items.length,
        openSlots: openCount,
        bookedSlots: bookedCount,
        heldSlots: heldCount,
      },
      items,
    };
  }

  async fetchAdminBookedBookings() {
    const bookingRows = await this.bookingService.getBookingRowsForList();
    const aggregates = await Promise.all(
      bookingRows.map((booking) =>
        this.bookingService.buildBookingAggregate(booking),
      ),
    );

    const items: AdminBookedListItem[] = aggregates
      .filter((aggregate) => {
        const status = this.bookingService.getDisplayStatus(aggregate.booking);
        return status === 'confirmed' || status === 'completed';
      })
      .sort(
        (left, right) =>
          new Date(right.slot.start_at).getTime() -
          new Date(left.slot.start_at).getTime(),
      )
      .map((aggregate) => {
        const config = this.bookingService.getReadableBookingConfig(
          aggregate.booking,
          aggregate.lineItems,
        );
        const status = this.bookingService.getDisplayStatus(
          aggregate.booking,
        ) as 'confirmed' | 'completed';

        return {
          bookingRef: aggregate.booking.booking_ref,
          status,
          golfClubName:
            aggregate.facility?.facility_name ?? aggregate.organization.name,
          golfClubSlug: aggregate.organization.slug,
          bookingDate: this.bookingService.extractDate(aggregate.slot.start_at),
          teeTimeSlot: this.bookingService.formatTeeTime(
            aggregate.slot.start_at,
          ),
          playType: config.playType,
          selectedNine: null,
          hostName:
            aggregate.hostUser?.name ?? aggregate.players[0]?.name ?? 'Unknown',
          hostPhoneNumber:
            aggregate.hostUser?.phone_normalized ??
            aggregate.hostUser?.phone ??
            aggregate.players[0]?.phone_number ??
            '',
          playerCount: config.playerCount,
          grandTotal: this.bookingService.toNumber(
            aggregate.booking.total_amount,
          ),
          currency: 'MYR',
          createdAt: aggregate.booking.created_at,
        };
      });

    return {
      summary: {
        total: items.length,
        confirmed: items.filter((item) => item.status === 'confirmed').length,
        completed: items.filter((item) => item.status === 'completed').length,
      },
      items,
    };
  }

  fetchAdminBookingDetails(bookingRef: string) {
    return this.bookingService.fetchBookingDetails(bookingRef);
  }
}
