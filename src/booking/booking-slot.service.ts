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
}
