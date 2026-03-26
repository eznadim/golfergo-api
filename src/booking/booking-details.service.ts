import { Injectable } from '@nestjs/common';
import { BookingService } from './booking.service';

@Injectable()
export class BookingDetailsService {
  constructor(private readonly bookingService: BookingService) {}

  fetchBookingDetails(bookingRef: string) {
    return this.bookingService.fetchBookingDetails(bookingRef);
  }
}
