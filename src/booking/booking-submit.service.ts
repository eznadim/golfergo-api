import { ConflictException, GoneException, Injectable } from '@nestjs/common';
import { BookingNotificationService } from './booking-notification.service';
import { BookingService } from './booking.service';
import { PhoneService } from './phone.service';
import { VoucherService } from './voucher.service';

@Injectable()
export class BookingSubmitService {
  constructor(
    private readonly bookingService: BookingService,
    private readonly phoneService: PhoneService,
    private readonly bookingNotificationService: BookingNotificationService,
    private readonly voucherService: VoucherService,
  ) {}

  async previewBooking(
    input: {
      bookingRef: string;
      caddieArrangement: 'none' | 'shared' | 'per_player';
      buggyType?: 'jumbo' | 'normal';
      buggyQuantity?: number;
      buggySharingPreference?: 'shared' | 'mixed' | 'single';
      playerDetails: Array<{
        name: string;
        phoneNumber: string;
        category: 'adult' | 'normal' | 'senior' | 'junior';
        isHost: boolean;
      }>;
      voucherCode?: string;
    },
    userId: string,
  ) {
    const aggregate = await this.bookingService.getBookingAggregateByRef(
      input.bookingRef,
    );
    this.bookingService.assertBookingOwnedByUser(aggregate.booking, userId);
    const displayStatus = this.bookingService.getDisplayStatus(
      aggregate.booking,
    );

    if (displayStatus === 'expired') {
      await this.voucherService.cancelOrExpireVoucherRedemption(
        aggregate.booking.booking_id,
        'expired',
      );
      throw new GoneException('Booking hold has expired');
    }

    if (displayStatus !== 'held') {
      throw new ConflictException('Booking is not in held status');
    }

    const slotContext = await this.bookingService.getSlotContextById(
      aggregate.booking.slot_id,
    );
    const availability = this.bookingService.applyPricingSnapshotToAvailability(
      await this.bookingService.getSlotAvailability(
        slotContext,
        undefined,
        aggregate.booking.booking_id,
      ),
      aggregate.booking.pricing_snapshot,
    );
    const bookingConfig = this.bookingService.buildBookingConfigFromSubmit({
      playType:
        aggregate.booking.play_type === '9_holes' ? '9_holes' : '18_holes',
      caddieArrangement: input.caddieArrangement,
      buggyType: input.buggyType,
      buggySharingPreference: input.buggySharingPreference,
      playerDetails: input.playerDetails,
    });
    const counts = this.bookingService.getRequestedBookingCounts(bookingConfig);
    this.bookingService.ensurePlayerCountAllowed(
      bookingConfig.playerCount,
      slotContext.teeInstance,
    );
    this.bookingService.ensureCapacityAvailable(counts, availability);
    const pricing = this.bookingService.calculateBookingPricing(
      availability,
      bookingConfig,
      counts,
    );
    const voucherValidation = await this.resolveVoucherValidation({
      bookingId: aggregate.booking.booking_id,
      userId,
      voucherCode: input.voucherCode,
      subtotalAmount: pricing.grandTotal,
      organizationId: slotContext.organization.organization_id,
      facilityId: slotContext.facility.facility_id,
      sportId: slotContext.organizationSport.sport_id,
      throwWhenIneligible: Boolean(input.voucherCode),
    });
    const pricingSummary = this.voucherService.buildPricingSummary({
      subtotalAmount: pricing.grandTotal,
      discountAmount: voucherValidation?.discountAmount ?? 0,
      finalAmount: voucherValidation?.finalAmount ?? pricing.grandTotal,
      voucher: voucherValidation?.voucher ?? null,
      autoApplied: voucherValidation?.autoApplied,
    });

    return {
      bookingRef: aggregate.booking.booking_ref,
      status: displayStatus,
      bookingSummary: {
        golfClubName:
          aggregate.facility?.facility_name ?? aggregate.organization.name,
        bookingDate: this.bookingService.extractDate(aggregate.slot.start_at),
        teeTimeSlot: this.bookingService.formatTeeTime(aggregate.slot.start_at),
        playType: bookingConfig.playType,
        pricingCategory: slotContext.teeInstance.pricing_category,
        minPlayers: slotContext.teeInstance.min_players,
        maxPlayers: slotContext.teeInstance.max_players,
        playerCount: bookingConfig.playerCount,
        normalPlayerCount: bookingConfig.normalPlayerCount,
        seniorPlayerCount: bookingConfig.seniorPlayerCount,
        caddieArrangement: bookingConfig.caddieArrangement,
        buggyType: bookingConfig.buggyType,
        buggyQuantity: bookingConfig.buggyQuantity,
        buggySharingPreference: bookingConfig.buggySharingPreference,
        paymentMethod: bookingConfig.paymentMethod,
      },
      pricing: {
        ...pricing,
        ...pricingSummary,
        grandTotal: pricingSummary.finalAmount,
      },
    };
  }

  async submitBooking(
    input: {
      bookingRef: string;
      caddieArrangement: 'none' | 'shared' | 'per_player';
      buggyType?: 'jumbo' | 'normal';
      buggyQuantity?: number;
      buggySharingPreference?: 'shared' | 'mixed' | 'single';
      playerDetails: Array<{
        name: string;
        phoneNumber: string;
        category: 'adult' | 'normal' | 'senior' | 'junior';
        isHost: boolean;
      }>;
      voucherCode?: string;
      acknowledgedTerms: true;
    },
    userId: string,
  ) {
    const aggregate = await this.bookingService.getBookingAggregateByRef(
      input.bookingRef,
    );
    this.bookingService.assertBookingOwnedByUser(aggregate.booking, userId);
    const displayStatus = this.bookingService.getDisplayStatus(
      aggregate.booking,
    );

    if (displayStatus === 'expired') {
      await this.voucherService.cancelOrExpireVoucherRedemption(
        aggregate.booking.booking_id,
        'expired',
      );
      throw new GoneException('Booking hold has expired');
    }

    if (displayStatus !== 'held') {
      throw new ConflictException('Booking is not in held status');
    }

    const slotContext = await this.bookingService.getSlotContextById(
      aggregate.booking.slot_id,
    );
    const availability = this.bookingService.applyPricingSnapshotToAvailability(
      await this.bookingService.getSlotAvailability(
        slotContext,
        undefined,
        aggregate.booking.booking_id,
      ),
      aggregate.booking.pricing_snapshot,
    );
    const bookingConfig = this.bookingService.buildBookingConfigFromSubmit({
      playType:
        aggregate.booking.play_type === '9_holes' ? '9_holes' : '18_holes',
      caddieArrangement: input.caddieArrangement,
      buggyType: input.buggyType,
      buggySharingPreference: input.buggySharingPreference,
      playerDetails: input.playerDetails,
    });
    const counts = this.bookingService.getRequestedBookingCounts(bookingConfig);
    this.bookingService.ensurePlayerCountAllowed(
      bookingConfig.playerCount,
      slotContext.teeInstance,
    );
    this.bookingService.ensureCapacityAvailable(counts, availability);
    const pricing = this.bookingService.calculateBookingPricing(
      availability,
      bookingConfig,
      counts,
    );
    const pricingSnapshot = await this.bookingService.buildPricingSnapshot(
      slotContext,
      availability,
      bookingConfig,
      counts,
      pricing,
    );
    const voucherValidation = await this.resolveVoucherValidation({
      bookingId: aggregate.booking.booking_id,
      userId,
      voucherCode: input.voucherCode,
      subtotalAmount: pricing.grandTotal,
      organizationId: slotContext.organization.organization_id,
      facilityId: slotContext.facility.facility_id,
      sportId: slotContext.organizationSport.sport_id,
      throwWhenIneligible: Boolean(input.voucherCode),
    });
    const pricingSummary = this.voucherService.buildPricingSummary({
      subtotalAmount: pricing.grandTotal,
      discountAmount: voucherValidation?.discountAmount ?? 0,
      finalAmount: voucherValidation?.finalAmount ?? pricing.grandTotal,
      voucher: voucherValidation?.voucher ?? null,
      autoApplied: voucherValidation?.autoApplied,
    });

    await this.bookingService.replaceBookingPlayers(
      aggregate.booking.booking_id,
      input.playerDetails.map((player) => ({
        name: player.name,
        phone_number: this.phoneService.normalizePhoneNumber(
          player.phoneNumber,
        ),
        category: player.category,
      })),
    );
    await this.bookingService.replaceBookingLineItems(
      aggregate.booking.booking_id,
      slotContext,
      availability,
      counts,
      bookingConfig,
      pricing,
    );

    const hostPlayer = input.playerDetails.find((player) => player.isHost);
    if (hostPlayer && aggregate.booking.user_id) {
      await this.bookingService.updateAppUser(aggregate.booking.user_id, {
        name: hostPlayer.name,
        phone: hostPlayer.phoneNumber,
        phone_normalized: this.phoneService.normalizePhoneNumber(
          hostPlayer.phoneNumber,
        ),
      });
    }

    if (voucherValidation) {
      await this.voucherService.reserveVoucherRedemption({
        voucher: voucherValidation.voucher,
        userId,
        bookingId: aggregate.booking.booking_id,
        discountAmount: voucherValidation.discountAmount,
        currency: voucherValidation.voucher.currency,
        autoApplied: voucherValidation.autoApplied,
      });
    }

    const now = new Date().toISOString();
    await this.bookingService.updateBookingRow(aggregate.booking.booking_id, {
      status: 'confirmed',
      total_amount: pricingSummary.finalAmount,
      buggy_type: bookingConfig.buggyType,
      buggy_sharing_preference: bookingConfig.buggySharingPreference,
      caddy_arrangement: bookingConfig.caddieArrangement,
      payment_method: bookingConfig.paymentMethod,
      estimated_total_amount: pricingSummary.finalAmount,
      subtotal_amount: pricingSummary.subtotalAmount,
      discount_amount: pricingSummary.discountAmount,
      voucher_id: voucherValidation?.voucher.voucher_id ?? null,
      voucher_code: voucherValidation?.voucher.code ?? null,
      final_amount: pricingSummary.finalAmount,
      pricing_snapshot: pricingSnapshot,
      confirmed_at: now,
      hold_expires_at: null,
      updated_at: now,
    });
    await this.bookingService.insertBookingStatusHistory(
      aggregate.booking.booking_id,
      'held',
      'confirmed',
    );
    if (voucherValidation) {
      await this.voucherService.updateReservedVoucherForBooking({
        bookingId: aggregate.booking.booking_id,
        discountAmount: voucherValidation.discountAmount,
      });
      await this.voucherService.applyVoucherRedemption(
        aggregate.booking.booking_id,
      );
    }

    const refreshed = await this.bookingService.getBookingAggregateById(
      aggregate.booking.booking_id,
    );
    await this.bookingNotificationService.sendBookingConfirmed({
      bookingRef: refreshed.booking.booking_ref,
      clubName:
        refreshed.facility?.facility_name ?? refreshed.organization.name,
      clubEmail: refreshed.organization.email,
      bookingDate: this.bookingService.extractDate(refreshed.slot.start_at),
      teeTime: this.bookingService.formatTeeTime(refreshed.slot.start_at),
      playerCount: bookingConfig.playerCount,
      grandTotal: pricingSummary.finalAmount,
      currency: 'MYR',
      players: refreshed.players.map((player) => ({
        name: player.name,
        phoneNumber: player.phone_number,
      })),
    });

    return {
      bookingId: refreshed.booking.booking_id,
      bookingRef: refreshed.booking.booking_ref,
      status: refreshed.booking.status,
      confirmedAt: refreshed.booking.confirmed_at,
      bookingSummary: {
        golfClubName:
          refreshed.facility?.facility_name ?? refreshed.organization.name,
        bookingDate: this.bookingService.extractDate(refreshed.slot.start_at),
        teeTimeSlot: this.bookingService.formatTeeTime(refreshed.slot.start_at),
        playType: bookingConfig.playType,
        pricingCategory: slotContext.teeInstance.pricing_category,
        playerCount: bookingConfig.playerCount,
        normalPlayerCount: bookingConfig.normalPlayerCount,
        seniorPlayerCount: bookingConfig.seniorPlayerCount,
        caddieArrangement: bookingConfig.caddieArrangement,
        buggyType: bookingConfig.buggyType,
        buggyQuantity: bookingConfig.buggyQuantity,
        buggySharingPreference: bookingConfig.buggySharingPreference,
        grandTotal: pricingSummary.finalAmount,
        subtotalAmount: pricingSummary.subtotalAmount,
        discountAmount: pricingSummary.discountAmount,
        finalAmount: pricingSummary.finalAmount,
        voucher: pricingSummary.voucher,
        currency: 'MYR',
        paymentMethod: bookingConfig.paymentMethod,
      },
    };
  }

  private async resolveVoucherValidation(input: {
    bookingId: string;
    userId: string;
    voucherCode?: string;
    subtotalAmount: number;
    organizationId: string;
    facilityId: string;
    sportId: string;
    throwWhenIneligible: boolean;
  }) {
    const code = input.voucherCode?.trim().toUpperCase() || 'FIRST10';

    try {
      return await this.voucherService.validateVoucherForBooking({
        code,
        userId: input.userId,
        bookingId: input.bookingId,
        subtotalAmount: input.subtotalAmount,
        organizationId: input.organizationId,
        facilityId: input.facilityId,
        sportId: input.sportId,
        autoApplied: !input.voucherCode,
      });
    } catch (error) {
      if (input.throwWhenIneligible) {
        throw error;
      }

      return null;
    }
  }
}
