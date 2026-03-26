import { Module } from '@nestjs/common';
import { BookingCancelService } from './booking-cancel.service';
import { BookingClubService } from './booking-club.service';
import { BookingController } from './booking.controller';
import { BookingDetailsService } from './booking-details.service';
import { BookingHoldService } from './booking-hold.service';
import { IdempotencyService } from './idempotency.service';
import { BookingListService } from './booking-list.service';
import { PhoneService } from './phone.service';
import { BookingService } from './booking.service';
import { BookingSlotService } from './booking-slot.service';
import { BookingSubmitService } from './booking-submit.service';
import { BookingUpdateService } from './booking-update.service';
import { SupabaseModule } from '../supabase/supabase.module';

@Module({
  imports: [SupabaseModule],
  controllers: [BookingController],
  providers: [
    BookingService,
    BookingClubService,
    BookingSlotService,
    BookingHoldService,
    BookingSubmitService,
    BookingDetailsService,
    BookingListService,
    BookingUpdateService,
    BookingCancelService,
    IdempotencyService,
    PhoneService,
  ],
})
export class BookingModule {}
