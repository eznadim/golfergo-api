import { Injectable } from '@nestjs/common';
import { BookingService } from './booking.service';

@Injectable()
export class BookingCancelService {
  constructor(private readonly bookingService: BookingService) {}

  async cancelBooking(bookingRef: string, reason: string, userId: string) {
    const aggregate = await this.bookingService.getBookingAggregateByRef(bookingRef);
    this.bookingService.assertBookingOwnedByUser(aggregate.booking, userId);
    const oldStatus = this.bookingService.getDisplayStatus(aggregate.booking);
    const now = new Date().toISOString();

    await this.bookingService.updateBookingRow(aggregate.booking.booking_id, {
      status: 'cancelled',
      cancelled_at: now,
      cancellation_reason: reason,
      hold_expires_at: null,
      updated_at: now,
    });
    await this.bookingService.insertBookingStatusHistory(
      aggregate.booking.booking_id,
      oldStatus === 'expired' ? 'held' : oldStatus,
      'cancelled',
    );

    return {
      bookingRef: aggregate.booking.booking_ref,
      status: 'cancelled',
      cancelledAt: now,
    };
  }
}
