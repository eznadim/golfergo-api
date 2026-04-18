import { Injectable } from '@nestjs/common';
import { BookingService } from './booking.service';

@Injectable()
export class BookingQuickBookService {
  constructor(private readonly bookingService: BookingService) {}

  fetchQuickBook(input: {
    golfClubSlug?: string;
    latitude?: number;
    longitude?: number;
    maxResults?: number;
    searchDays?: number;
  }) {
    return this.bookingService.fetchQuickBook(input);
  }
}
