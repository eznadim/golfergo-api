import { Injectable } from '@nestjs/common';
import { BookingService } from './booking.service';

@Injectable()
export class BookingClubService {
  constructor(private readonly bookingService: BookingService) {}

  fetchGolfClubs(golfClubSlug?: string) {
    const normalizedSlug = golfClubSlug?.trim();

    if (normalizedSlug) {
      return this.bookingService.fetchGolfClubDetails(normalizedSlug);
    }

    return this.bookingService.fetchGolfClubList();
  }
}
