import { Injectable } from '@nestjs/common';
import { BookingService } from './booking.service';

@Injectable()
export class BookingClubService {
  constructor(private readonly bookingService: BookingService) {}

  fetchGolfClubList() {
    return this.bookingService.fetchGolfClubList();
  }
}
