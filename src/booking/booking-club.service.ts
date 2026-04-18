import { Injectable } from '@nestjs/common';
import { BookingService } from './booking.service';

@Injectable()
export class BookingClubService {
  constructor(private readonly bookingService: BookingService) {}

  fetchGolfClubs(golfClubSlug?: string) {
    if (golfClubSlug) {
      return this.bookingService.fetchGolfClubDetails(golfClubSlug);
    }

    return this.bookingService.fetchGolfClubList();
  }
}
