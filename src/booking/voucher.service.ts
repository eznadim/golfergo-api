import {
  ConflictException,
  Injectable,
  BadRequestException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';

type VoucherRow = {
  voucher_id: string;
  code: string;
  name: string;
  description: string | null;
  discount_type: 'fixed_amount' | 'percentage';
  discount_value: number | string;
  max_discount_amount: number | string | null;
  min_booking_amount: number | string | null;
  currency: string;
  organization_id: string | null;
  facility_id: string | null;
  sport_id: string | null;
  max_total_redemptions: number | null;
  max_redemptions_per_user: number | null;
  first_time_booking_only: boolean | null;
  starts_at: string | null;
  ends_at: string | null;
  active: boolean | null;
  metadata: Record<string, unknown> | null;
};

type VoucherValidationInput = {
  code: string;
  userId: string;
  bookingId?: string;
  subtotalAmount: number;
  organizationId: string;
  facilityId?: string | null;
  sportId: string;
  autoApplied?: boolean;
};

type VoucherValidationResult = {
  voucher: VoucherRow;
  discountAmount: number;
  finalAmount: number;
  autoApplied: boolean;
};

const VALID_PREVIOUS_BOOKING_STATUSES = [
  'confirmed',
  'paid',
  'completed',
  'pending_payment',
];

@Injectable()
export class VoucherService {
  constructor(private readonly supabase: SupabaseService) {}

  async validateVoucherForBooking(
    input: VoucherValidationInput,
  ): Promise<VoucherValidationResult> {
    const voucher = await this.getVoucherByCode(input.code);
    const now = Date.now();

    if (!voucher.active) {
      this.throwNotEligible('Voucher is not active.');
    }

    if (voucher.starts_at && new Date(voucher.starts_at).getTime() > now) {
      this.throwNotEligible('Voucher is not active yet.');
    }

    if (voucher.ends_at && new Date(voucher.ends_at).getTime() <= now) {
      this.throwNotEligible('Voucher has expired.');
    }

    if (input.subtotalAmount < this.toNumber(voucher.min_booking_amount)) {
      this.throwNotEligible(
        'Booking subtotal does not meet the minimum amount.',
      );
    }

    if (
      voucher.organization_id &&
      voucher.organization_id !== input.organizationId
    ) {
      this.throwNotEligible('Voucher is not valid for this club.');
    }

    if (voucher.facility_id && voucher.facility_id !== input.facilityId) {
      this.throwNotEligible('Voucher is not valid for this facility.');
    }

    if (voucher.sport_id && voucher.sport_id !== input.sportId) {
      this.throwNotEligible('Voucher is not valid for this sport.');
    }

    if (voucher.max_total_redemptions !== null) {
      const totalRedemptions = await this.countVoucherRedemptions(
        voucher.voucher_id,
      );
      if (totalRedemptions >= voucher.max_total_redemptions) {
        this.throwNotEligible('Voucher redemption limit has been reached.');
      }
    }

    const userRedemptions = await this.countUserVoucherRedemptions(
      voucher.voucher_id,
      input.userId,
      input.bookingId,
    );
    if (userRedemptions >= (voucher.max_redemptions_per_user ?? 1)) {
      this.throwNotEligible('Voucher has already been used by this user.');
    }

    if (voucher.first_time_booking_only) {
      const hasPreviousBooking = await this.getUserHasPreviousValidBooking(
        input.userId,
        input.bookingId,
      );
      if (hasPreviousBooking) {
        this.throwNotEligible(
          'This voucher is only available for first-time bookings.',
        );
      }
    }

    const discountAmount = this.calculateVoucherDiscount(
      voucher,
      input.subtotalAmount,
    );

    return {
      voucher,
      discountAmount,
      finalAmount: this.roundCurrency(input.subtotalAmount - discountAmount),
      autoApplied: input.autoApplied ?? false,
    };
  }

  calculateVoucherDiscount(voucher: VoucherRow, subtotalAmount: number) {
    const subtotal = Math.max(0, subtotalAmount);
    let discount =
      voucher.discount_type === 'fixed_amount'
        ? Math.min(this.toNumber(voucher.discount_value), subtotal)
        : (subtotal * this.toNumber(voucher.discount_value)) / 100;

    const maxDiscount = this.toNumber(voucher.max_discount_amount);
    if (maxDiscount > 0) {
      discount = Math.min(discount, maxDiscount);
    }

    return this.roundCurrency(Math.max(0, Math.min(discount, subtotal)));
  }

  async reserveVoucherRedemption(input: {
    voucher: VoucherRow;
    userId: string;
    bookingId: string;
    discountAmount: number;
    currency?: string;
    autoApplied?: boolean;
  }) {
    const existing = await this.getRedemptionByBookingId(input.bookingId);
    if (existing) {
      return;
    }

    const result = await this.supabase.client
      .from('voucher_redemption')
      .insert({
        voucher_id: input.voucher.voucher_id,
        user_id: input.userId,
        booking_id: input.bookingId,
        discount_amount: input.discountAmount,
        currency: input.currency ?? input.voucher.currency,
        status: 'reserved',
        metadata: { autoApplied: input.autoApplied ?? false },
      });

    if (result.error) {
      if (result.error.message.toLowerCase().includes('duplicate')) {
        this.throwNotEligible('Voucher has already been reserved or used.');
      }
      throw new BadRequestException(result.error.message);
    }
  }

  async updateReservedVoucherForBooking(input: {
    bookingId: string;
    discountAmount: number;
  }) {
    const result = await this.supabase.client
      .from('voucher_redemption')
      .update({ discount_amount: input.discountAmount })
      .eq('booking_id', input.bookingId)
      .eq('status', 'reserved');

    if (result.error) {
      throw new BadRequestException(result.error.message);
    }
  }

  async applyVoucherRedemption(bookingId: string) {
    const result = await this.supabase.client
      .from('voucher_redemption')
      .update({
        status: 'applied',
        applied_at: new Date().toISOString(),
      })
      .eq('booking_id', bookingId)
      .eq('status', 'reserved');

    if (result.error) {
      throw new BadRequestException(result.error.message);
    }
  }

  async cancelOrExpireVoucherRedemption(
    bookingId: string,
    status: 'cancelled' | 'expired',
  ) {
    const result = await this.supabase.client
      .from('voucher_redemption')
      .update({
        status,
        cancelled_at: status === 'cancelled' ? new Date().toISOString() : null,
      })
      .eq('booking_id', bookingId)
      .eq('status', 'reserved');

    if (result.error) {
      throw new BadRequestException(result.error.message);
    }
  }

  async getReservedVoucherForBooking(bookingId: string) {
    const result = await this.supabase.client
      .from('voucher_redemption')
      .select(
        'voucher:voucher_id(voucher_id, code, name, description, discount_type, discount_value, max_discount_amount, min_booking_amount, currency, organization_id, facility_id, sport_id, max_total_redemptions, max_redemptions_per_user, first_time_booking_only, starts_at, ends_at, active, metadata)',
      )
      .eq('booking_id', bookingId)
      .eq('status', 'reserved')
      .maybeSingle<{ voucher: VoucherRow }>();

    if (result.error) {
      throw new BadRequestException(result.error.message);
    }

    return result.data?.voucher ?? null;
  }

  async getUserHasPreviousValidBooking(
    userId: string,
    currentBookingId?: string,
  ) {
    let query = this.supabase.client
      .from('booking')
      .select('booking_id')
      .eq('user_id', userId)
      .in('status', VALID_PREVIOUS_BOOKING_STATUSES)
      .limit(1);

    if (currentBookingId) {
      query = query.neq('booking_id', currentBookingId);
    }

    const result = await query;

    if (result.error) {
      throw new BadRequestException(result.error.message);
    }

    return (result.data ?? []).length > 0;
  }

  buildPricingSummary(input: {
    subtotalAmount: number;
    discountAmount?: number;
    finalAmount?: number;
    voucher?: VoucherRow | null;
    autoApplied?: boolean;
  }) {
    const subtotalAmount = this.roundCurrency(input.subtotalAmount);
    const discountAmount = this.roundCurrency(input.discountAmount ?? 0);
    const finalAmount = this.roundCurrency(
      input.finalAmount ?? Math.max(0, subtotalAmount - discountAmount),
    );

    return {
      subtotalAmount,
      discountAmount,
      finalAmount,
      currency: input.voucher?.currency ?? 'MYR',
      voucher: input.voucher
        ? {
            code: input.voucher.code,
            name: input.voucher.name,
            discountType: input.voucher.discount_type,
            discountValue: this.toNumber(input.voucher.discount_value),
            autoApplied: input.autoApplied ?? false,
          }
        : null,
    };
  }

  private async getVoucherByCode(code: string) {
    const result = await this.supabase.client
      .from('voucher')
      .select(
        'voucher_id, code, name, description, discount_type, discount_value, max_discount_amount, min_booking_amount, currency, organization_id, facility_id, sport_id, max_total_redemptions, max_redemptions_per_user, first_time_booking_only, starts_at, ends_at, active, metadata',
      )
      .eq('code', code.trim().toUpperCase())
      .maybeSingle<VoucherRow>();

    if (result.error) {
      throw new BadRequestException(result.error.message);
    }

    if (!result.data) {
      this.throwNotEligible('Voucher does not exist.');
    }

    return result.data;
  }

  private async countVoucherRedemptions(voucherId: string) {
    const result = await this.supabase.client
      .from('voucher_redemption')
      .select('redemption_id', { count: 'exact', head: true })
      .eq('voucher_id', voucherId)
      .in('status', ['reserved', 'applied']);

    if (result.error) {
      throw new BadRequestException(result.error.message);
    }

    return result.count ?? 0;
  }

  private async countUserVoucherRedemptions(
    voucherId: string,
    userId: string,
    currentBookingId?: string,
  ) {
    let query = this.supabase.client
      .from('voucher_redemption')
      .select('redemption_id', { count: 'exact', head: true })
      .eq('voucher_id', voucherId)
      .eq('user_id', userId)
      .in('status', ['reserved', 'applied']);

    if (currentBookingId) {
      query = query.neq('booking_id', currentBookingId);
    }

    const result = await query;

    if (result.error) {
      throw new BadRequestException(result.error.message);
    }

    return result.count ?? 0;
  }

  private async getRedemptionByBookingId(bookingId: string) {
    const result = await this.supabase.client
      .from('voucher_redemption')
      .select('redemption_id')
      .eq('booking_id', bookingId)
      .in('status', ['reserved', 'applied'])
      .maybeSingle<{ redemption_id: string }>();

    if (result.error) {
      throw new BadRequestException(result.error.message);
    }

    return result.data;
  }

  private throwNotEligible(details: string): never {
    throw new ConflictException({
      message: 'Voucher is not valid for this booking.',
      code: 'VOUCHER_NOT_ELIGIBLE',
      details,
    });
  }

  private roundCurrency(value: number) {
    return Math.round(Math.max(0, value) * 100) / 100;
  }

  private toNumber(value: number | string | null | undefined) {
    if (value === null || value === undefined) {
      return 0;
    }

    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
}
