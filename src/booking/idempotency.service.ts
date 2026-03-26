import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';

type IdempotencyRow = {
  idempotency_key: string;
  visitor_id: string | null;
  user_id: string | null;
  booking_id: string | null;
  request_type: string | null;
  created_at: string | null;
};

@Injectable()
export class IdempotencyService {
  constructor(private readonly supabase: SupabaseService) {}

  async getExistingBookingHold(idempotencyKey: string) {
    const result = await this.supabase.client
      .from('booking_idempotency')
      .select('idempotency_key, visitor_id, user_id, booking_id, request_type, created_at')
      .eq('idempotency_key', idempotencyKey)
      .maybeSingle<IdempotencyRow>();

    if (result.error) {
      throw new InternalServerErrorException(result.error.message);
    }

    return result.data;
  }

  async saveBookingHold(
    idempotencyKey: string,
    visitorId: string | null,
    userId: string,
    bookingId: string,
  ) {
    const result = await this.supabase.client.from('booking_idempotency').insert({
      idempotency_key: idempotencyKey,
      visitor_id: visitorId,
      user_id: userId,
      booking_id: bookingId,
      request_type: 'booking_hold',
      created_at: new Date().toISOString(),
    });

    if (result.error) {
      throw new InternalServerErrorException(result.error.message);
    }
  }
}
