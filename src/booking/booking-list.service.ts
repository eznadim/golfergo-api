import { Injectable } from '@nestjs/common';
import { BookingService } from './booking.service';

@Injectable()
export class BookingListService {
  constructor(private readonly bookingService: BookingService) {}

  fetchUpcomingBookings(pagination: { page: number; pageSize: number }) {
    return this.fetchBookingList('upcoming', pagination);
  }

  fetchPastBookings(pagination: { page: number; pageSize: number }) {
    return this.fetchBookingList('past', pagination);
  }

  private async fetchBookingList(
    mode: 'upcoming' | 'past',
    pagination: { page: number; pageSize: number },
  ) {
    const bookings = await this.bookingService.getBookingRowsForList();
    const aggregates = await Promise.all(
      bookings.map((booking) => this.bookingService.buildBookingAggregate(booking)),
    );

    const now = Date.now();
    const filtered = aggregates.filter((aggregate) => {
      if (this.bookingService.getDisplayStatus(aggregate.booking) === 'expired') {
        return false;
      }

      const slotTime = new Date(aggregate.slot.start_at).getTime();
      return mode === 'upcoming' ? slotTime >= now : slotTime < now;
    });

    const items = filtered
      .sort(
        (left, right) =>
          new Date(left.slot.start_at).getTime() -
          new Date(right.slot.start_at).getTime(),
      )
      .map((aggregate) => {
        const config = this.bookingService.extractBookingConfig(aggregate.lineItems);

        return {
          bookingRef: aggregate.booking.booking_ref,
          status: this.bookingService.getDisplayStatus(aggregate.booking),
          golfClubName: aggregate.facility?.facility_name ?? aggregate.organization.name,
          bookingDate: this.bookingService.extractDate(aggregate.slot.start_at),
          teeTimeSlot: this.bookingService.formatTeeTime(aggregate.slot.start_at),
          playType: config.playType,
          selectedNine: config.selectedNine,
          playerCount: config.playerCount,
          grandTotal: this.bookingService.toNumber(aggregate.booking.total_amount),
          currency: 'MYR',
          paymentMethod: config.paymentMethod,
        };
      });

    const startIndex = (pagination.page - 1) * pagination.pageSize;
    return {
      page: pagination.page,
      pageSize: pagination.pageSize,
      total: items.length,
      items: items.slice(startIndex, startIndex + pagination.pageSize),
    };
  }
}
