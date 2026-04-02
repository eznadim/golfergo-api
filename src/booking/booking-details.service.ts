import { Injectable } from '@nestjs/common';
import { BookingService } from './booking.service';

@Injectable()
export class BookingDetailsService {
  constructor(private readonly bookingService: BookingService) {}

  async fetchBookingDetails(bookingRef: string, userId: string) {
    const aggregate = await this.bookingService.getBookingAggregateByRef(bookingRef);
    this.bookingService.assertBookingOwnedByUser(aggregate.booking, userId);
    return this.bookingService.fetchBookingDetails(bookingRef);
  }
}
