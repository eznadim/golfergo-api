import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { SupabaseService } from '../supabase/supabase.service';
import { BookingService } from './booking.service';
import { PhoneService } from './phone.service';

const ADMIN_BOOKABLE_CLUB_SLUG = 'kinrara-golf-club';

type SlotBoardStatus =
  | 'open'
  | 'held'
  | 'confirmed'
  | 'completed'
  | 'no_show'
  | 'blocked'
  | 'cancelled';

type SlotBoardItem = {
  slotKey: string;
  slotId: string;
  teeTimeSlot: string;
  startAt: string;
  endAt: string;
  playType: '9_holes' | '18_holes';
  selectedNine: string | null;
  status: SlotBoardStatus;
  remainingPlayerCapacity: number;
  currency: string;
  fromPrice: number;
  booking: null | {
    bookingRef: string;
    status: string;
    hostName: string;
    hostPhoneNumber: string;
    playerCount: number;
    grandTotal: number;
    currency: string;
  };
};

type AdminBookedListItem = {
  bookingRef: string;
  status: string;
  golfClubName: string;
  golfClubSlug: string;
  bookingDate: string;
  teeTimeSlot: string;
  playType: '9_holes' | '18_holes';
  selectedNine: string | null;
  hostName: string;
  hostPhoneNumber: string;
  playerCount: number;
  grandTotal: number;
  currency: string;
  createdAt: string;
};

type AdminCustomerRow = {
  user_id: string;
  name: string | null;
  phone: string | null;
  phone_normalized: string | null;
  email?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type AdminVoucherRow = {
  voucher_id: string;
  code: string;
  name: string;
  description: string | null;
  discount_type: 'fixed_amount' | 'percentage';
  discount_value: number | string;
  max_discount_amount: number | string | null;
  min_booking_amount: number | string | null;
  currency: string;
  max_total_redemptions: number | null;
  max_redemptions_per_user: number | null;
  first_time_booking_only: boolean | null;
  starts_at: string | null;
  ends_at: string | null;
  active: boolean | null;
  metadata: Record<string, unknown> | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type AdminVoucherRedemptionRow = {
  redemption_id: string;
  voucher_id: string;
  user_id: string;
  booking_id: string;
  discount_amount: number | string;
  currency: string;
  status: string;
  reserved_at: string;
  applied_at: string | null;
  cancelled_at: string | null;
  created_at: string;
};

type AdminPublicHolidayRow = {
  holiday_id: string;
  organization_id: string;
  facility_id: string | null;
  holiday_date: string;
  name: string;
  rate_day_type: 'weekend';
  active: boolean | null;
  metadata: Record<string, unknown> | null;
  created_by: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type BookingDocumentKind = 'invoice' | 'receipt';

type BookingAggregate = Awaited<
  ReturnType<BookingService['buildBookingAggregate']>
>;

@Injectable()
export class BookingAdminService {
  constructor(
    private readonly bookingService: BookingService,
    private readonly phoneService: PhoneService,
    private readonly supabase: SupabaseService,
  ) {}

  private toSlotBoardStatus(status: string): SlotBoardStatus {
    if (
      status === 'held' ||
      status === 'confirmed' ||
      status === 'completed' ||
      status === 'no_show' ||
      status === 'blocked' ||
      status === 'cancelled'
    ) {
      return status;
    }

    return 'open';
  }

  private toListItem(aggregate: BookingAggregate): AdminBookedListItem {
    const config = this.bookingService.getReadableBookingConfig(
      aggregate.booking,
      aggregate.lineItems,
    );

    return {
      bookingRef: aggregate.booking.booking_ref,
      status: this.bookingService.getDisplayStatus(aggregate.booking),
      golfClubName:
        aggregate.facility?.facility_name ?? aggregate.organization.name,
      golfClubSlug: aggregate.organization.slug,
      bookingDate: this.bookingService.extractDate(aggregate.slot.start_at),
      teeTimeSlot: this.bookingService.formatTeeTime(aggregate.slot.start_at),
      playType: config.playType,
      selectedNine: null,
      hostName:
        aggregate.hostUser?.name ?? aggregate.players[0]?.name ?? 'Unknown',
      hostPhoneNumber:
        aggregate.hostUser?.phone_normalized ??
        aggregate.hostUser?.phone ??
        aggregate.players[0]?.phone_number ??
        '',
      playerCount: config.playerCount,
      grandTotal: this.bookingService.toNumber(
        aggregate.booking.total_amount ??
          aggregate.booking.final_amount ??
          aggregate.booking.estimated_total_amount,
      ),
      currency: 'MYR',
      createdAt: aggregate.booking.created_at,
    };
  }

  private async getAdminClubScope(golfClubSlug: string) {
    if (golfClubSlug !== ADMIN_BOOKABLE_CLUB_SLUG) {
      throw new NotFoundException(
        `Booking is currently available only for slug: ${ADMIN_BOOKABLE_CLUB_SLUG}`,
      );
    }

    const organizationResult = await this.supabase.client
      .from('organization')
      .select('organization_id, name, slug')
      .eq('slug', golfClubSlug)
      .maybeSingle<{
        organization_id: string;
        name: string;
        slug: string;
      }>();

    if (organizationResult.error) {
      throw new InternalServerErrorException(organizationResult.error.message);
    }

    if (!organizationResult.data) {
      throw new NotFoundException(`Organization not found for slug: ${golfClubSlug}`);
    }

    const sportResult = await this.supabase.client
      .from('sport')
      .select('sport_id')
      .eq('sport_code', 'golf')
      .maybeSingle<{ sport_id: string }>();

    if (sportResult.error) {
      throw new InternalServerErrorException(sportResult.error.message);
    }

    if (!sportResult.data) {
      throw new NotFoundException('Golf sport not found');
    }

    const organizationSportResult = await this.supabase.client
      .from('organization_sport')
      .select('organization_sport_id')
      .eq('organization_id', organizationResult.data.organization_id)
      .eq('sport_id', sportResult.data.sport_id)
      .maybeSingle<{ organization_sport_id: string }>();

    if (organizationSportResult.error) {
      throw new InternalServerErrorException(
        organizationSportResult.error.message,
      );
    }

    if (!organizationSportResult.data) {
      throw new NotFoundException('Organization sport not found');
    }

    const facilityResult = await this.supabase.client
      .from('facility')
      .select('facility_id, facility_name')
      .eq(
        'organization_sport_id',
        organizationSportResult.data.organization_sport_id,
      )
      .limit(1)
      .maybeSingle<{ facility_id: string; facility_name: string | null }>();

    if (facilityResult.error) {
      throw new InternalServerErrorException(facilityResult.error.message);
    }

    if (!facilityResult.data) {
      throw new NotFoundException('Facility not found');
    }

    return {
      organization: organizationResult.data,
      facility: facilityResult.data,
    };
  }

  private getPrimaryAggregateForSlot(aggregates: BookingAggregate[]) {
    return [...aggregates].sort((left, right) => {
      const leftStatus = this.bookingService.getDisplayStatus(left.booking);
      const rightStatus = this.bookingService.getDisplayStatus(right.booking);

      if (leftStatus === rightStatus) {
        return (
          new Date(right.booking.created_at).getTime() -
          new Date(left.booking.created_at).getTime()
        );
      }

      const priority = ['confirmed', 'completed', 'no_show', 'held'];
      const leftRank = priority.includes(leftStatus)
        ? priority.indexOf(leftStatus)
        : priority.length;
      const rightRank = priority.includes(rightStatus)
        ? priority.indexOf(rightStatus)
        : priority.length;
      return leftRank - rightRank;
    })[0];
  }

  private getSlotStatusFromAggregates(
    aggregates: BookingAggregate[],
  ): SlotBoardStatus {
    for (const status of ['confirmed', 'completed', 'no_show', 'held']) {
      if (
        aggregates.some(
          (aggregate) =>
            this.bookingService.getDisplayStatus(aggregate.booking) === status,
        )
      ) {
        return this.toSlotBoardStatus(status);
      }
    }

    return 'open';
  }

  async fetchAdminSlotBoard(input: {
    golfClubSlug: string;
    bookingDate: string;
  }) {
    if (input.golfClubSlug !== ADMIN_BOOKABLE_CLUB_SLUG) {
      throw new NotFoundException(
        `Booking is currently available only for slug: ${ADMIN_BOOKABLE_CLUB_SLUG}`,
      );
    }

    const clubs = await this.bookingService.fetchGolfClubList();
    const selectedClub = clubs.find((club) => club.slug === input.golfClubSlug);

    if (!selectedClub) {
      throw new NotFoundException(
        `Golf club not found for slug: ${input.golfClubSlug}`,
      );
    }

    const slotResponses = await Promise.all([
      this.bookingService.fetchAdminTeeSlots({
        golfClubSlug: input.golfClubSlug,
        bookingDate: input.bookingDate,
        playType: '18_holes',
      }),
    ]);

    const bookingRows = await this.bookingService.getBookingRowsForList();
    const relevantAggregates = (
      await Promise.all(
        bookingRows.map((booking) =>
          this.bookingService.buildBookingAggregate(booking),
        ),
      )
    )
      .filter(
        (aggregate) =>
          aggregate.organization.slug === input.golfClubSlug &&
          this.bookingService.extractDate(aggregate.slot.start_at) ===
            input.bookingDate,
      )
      .filter((aggregate) => {
        const status = this.bookingService.getDisplayStatus(aggregate.booking);
        return (
          status === 'held' ||
          status === 'confirmed' ||
          status === 'completed' ||
          status === 'no_show' ||
          status === 'cancelled'
        );
      })
      .sort(
        (left, right) =>
          new Date(left.slot.start_at).getTime() -
          new Date(right.slot.start_at).getTime(),
      );

    const bookingAggregatesBySlotId = new Map<string, BookingAggregate[]>();

    for (const aggregate of relevantAggregates) {
      const existing =
        bookingAggregatesBySlotId.get(aggregate.slot.slot_id) ?? [];
      existing.push(aggregate);
      bookingAggregatesBySlotId.set(aggregate.slot.slot_id, existing);
    }

    const slotItems = new Map<string, SlotBoardItem>();

    for (const response of slotResponses) {
      for (const slot of response.slots) {
        const slotKey = `${slot.slotId}:${response.playType}:all`;

        slotItems.set(slotKey, {
          slotKey,
          slotId: slot.slotId,
          teeTimeSlot: slot.teeTimeSlot,
          startAt: slot.startAt,
          endAt: slot.endAt,
          playType: response.playType,
          selectedNine: null,
          status: slot.isBlocked ? 'blocked' : 'open',
          remainingPlayerCapacity: slot.remainingPlayerCapacity,
          currency: slot.currency,
          fromPrice: slot.fromPrice,
          booking: null,
        });
      }
    }

    for (const [slotId, aggregates] of bookingAggregatesBySlotId.entries()) {
      const primaryAggregate = this.getPrimaryAggregateForSlot(aggregates);
      const config = this.bookingService.getReadableBookingConfig(
        primaryAggregate.booking,
        primaryAggregate.lineItems,
      );
      const existingItem = [...slotItems.values()].find(
        (item) => item.slotId === slotId,
      );
      const slotStatus = this.getSlotStatusFromAggregates(aggregates);
      const slotKey =
        existingItem?.slotKey ?? `${slotId}:${config.playType}:all`;

      slotItems.set(slotKey, {
        slotKey,
        slotId,
        teeTimeSlot:
          existingItem?.teeTimeSlot ??
          this.bookingService.formatTeeTime(primaryAggregate.slot.start_at),
        startAt: existingItem?.startAt ?? primaryAggregate.slot.start_at,
        endAt: existingItem?.endAt ?? primaryAggregate.slot.end_at,
        playType: existingItem?.playType ?? config.playType,
        selectedNine: null,
        status: slotStatus,
        remainingPlayerCapacity: existingItem?.remainingPlayerCapacity ?? 0,
        currency: existingItem?.currency ?? 'MYR',
        fromPrice:
          existingItem?.fromPrice ??
          primaryAggregate.booking.pricing_snapshot?.prices.basePrice ??
          this.bookingService.toNumber(
            primaryAggregate.booking.estimated_total_amount,
          ),
        booking: {
          bookingRef: primaryAggregate.booking.booking_ref,
          status: this.bookingService.getDisplayStatus(
            primaryAggregate.booking,
          ),
          hostName:
            primaryAggregate.hostUser?.name ??
            primaryAggregate.players[0]?.name ??
            'Unknown',
          hostPhoneNumber:
            primaryAggregate.hostUser?.phone_normalized ??
            primaryAggregate.hostUser?.phone ??
            primaryAggregate.players[0]?.phone_number ??
            '',
          playerCount: config.playerCount,
          grandTotal: this.bookingService.toNumber(
            primaryAggregate.booking.total_amount,
          ),
          currency: 'MYR',
        },
      });
    }

    const items = [...slotItems.values()].sort(
      (left, right) =>
        new Date(left.startAt).getTime() - new Date(right.startAt).getTime(),
    );

    return {
      club: {
        slug: selectedClub.slug,
        name: selectedClub.name,
      },
      bookingDate: input.bookingDate,
      summary: {
        totalSlots: items.length,
        openSlots: items.filter((item) => item.status === 'open').length,
        bookedSlots: items.filter((item) => item.booking !== null).length,
        heldSlots: items.filter((item) => item.status === 'held').length,
        blockedSlots: items.filter((item) => item.status === 'blocked')
          .length,
      },
      items,
    };
  }

  fetchAdminBookedBookings() {
    return this.fetchAdminBookings({
      status: undefined,
      page: 1,
      pageSize: 500,
    });
  }

  async fetchAdminBookings(input: {
    golfClubSlug?: string;
    bookingDate?: string;
    status?: string;
    q?: string;
    page?: number;
    pageSize?: number;
  }) {
    const bookingRows = await this.bookingService.getBookingRowsForList();
    const normalizedQuery = input.q?.trim().toLowerCase() ?? '';
    const allItems = (
      await Promise.all(
        bookingRows.map((booking) =>
          this.bookingService.buildBookingAggregate(booking),
        ),
      )
    )
      .filter((aggregate) => {
        const status = this.bookingService.getDisplayStatus(aggregate.booking);
        return (
          status === 'held' ||
          status === 'pending_payment' ||
          status === 'confirmed' ||
          status === 'completed' ||
          status === 'no_show' ||
          status === 'cancelled'
        );
      })
      .filter((aggregate) =>
        input.golfClubSlug
          ? aggregate.organization.slug === input.golfClubSlug
          : true,
      )
      .filter((aggregate) =>
        input.bookingDate
          ? this.bookingService.extractDate(aggregate.slot.start_at) ===
            input.bookingDate
          : true,
      )
      .filter((aggregate) =>
        input.status
          ? this.bookingService.getDisplayStatus(aggregate.booking) ===
            input.status
          : true,
      )
      .sort(
        (left, right) =>
          new Date(right.slot.start_at).getTime() -
          new Date(left.slot.start_at).getTime(),
      )
      .map((aggregate) => this.toListItem(aggregate))
      .filter((item) => {
        if (!normalizedQuery) return true;
        return [
          item.bookingRef,
          item.golfClubName,
          item.hostName,
          item.hostPhoneNumber,
          item.bookingDate,
          item.teeTimeSlot,
          item.status,
        ]
          .join(' ')
          .toLowerCase()
          .includes(normalizedQuery);
      });

    const page = input.page ?? 1;
    const pageSize = input.pageSize ?? 50;
    const items = allItems.slice((page - 1) * pageSize, page * pageSize);

    return {
      summary: {
        total: allItems.length,
        held: allItems.filter((item) => item.status === 'held').length,
        pendingPayment: allItems.filter(
          (item) => item.status === 'pending_payment',
        ).length,
        confirmed: allItems.filter((item) => item.status === 'confirmed')
          .length,
        completed: allItems.filter((item) => item.status === 'completed')
          .length,
        noShow: allItems.filter((item) => item.status === 'no_show').length,
        cancelled: allItems.filter((item) => item.status === 'cancelled')
          .length,
      },
      page,
      pageSize,
      total: allItems.length,
      items,
    };
  }

  async fetchAdminDashboard(input: {
    golfClubSlug?: string;
    bookingDate?: string;
  }) {
    const bookings = await this.fetchAdminBookings({
      golfClubSlug: input.golfClubSlug,
      bookingDate: input.bookingDate,
      page: 1,
      pageSize: 500,
    });

    return {
      filters: {
        golfClubSlug: input.golfClubSlug ?? null,
        bookingDate: input.bookingDate ?? null,
      },
      summary: {
        ...bookings.summary,
        totalRevenue: bookings.items.reduce(
          (sum, item) =>
            item.status === 'cancelled' ? sum : sum + item.grandTotal,
          0,
        ),
        currency: 'MYR',
      },
      recentBookings: bookings.items.slice(0, 8),
    };
  }

  fetchAdminBookingDetails(bookingRef: string) {
    return this.bookingService.fetchBookingDetails(bookingRef);
  }

  async createAdminBooking(input: {
    slotId: string;
    hostName: string;
    hostPhoneNumber: string;
    caddieArrangement: 'none' | 'shared' | 'per_player';
    playerDetails: Array<{
      name: string;
      phoneNumber: string;
      category: 'adult' | 'normal' | 'senior' | 'junior';
      isHost: boolean;
    }>;
  }) {
    const slotContext = await this.bookingService.getSlotContextById(
      input.slotId,
    );
    const availability =
      await this.bookingService.getSlotAvailability(slotContext);
    const bookingConfig = this.bookingService.buildBookingConfigFromSubmit({
      playType: this.bookingService.getSlotPlayType(
        slotContext.teeInstance,
        slotContext.slot,
      ),
      caddieArrangement: input.caddieArrangement,
      playerDetails: input.playerDetails,
    });
    const counts = this.bookingService.getRequestedBookingCounts(bookingConfig);

    this.bookingService.ensurePlayerCountAllowed(
      bookingConfig.playerCount,
      slotContext.teeInstance,
    );
    this.bookingService.ensureCapacityAvailable(counts, availability);

    if (availability.activeBookingCount > 0) {
      throw new ConflictException('Selected slot is already booked');
    }

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
    const hostUser = await this.bookingService.findOrCreateAppUser(
      input.hostName,
      input.hostPhoneNumber,
      this.phoneService.normalizePhoneNumber(input.hostPhoneNumber),
    );
    const now = new Date().toISOString();
    const bookingId = randomUUID();
    const bookingRef = this.bookingService.generateBookingRef();

    await this.bookingService.insertBooking({
      booking_id: bookingId,
      user_id: hostUser.user_id,
      organization_id: slotContext.organization.organization_id,
      sport_id: slotContext.organizationSport.sport_id,
      status: 'confirmed',
      total_amount: pricing.grandTotal,
      created_at: now,
      booking_ref: bookingRef,
      visitor_id: null,
      slot_id: slotContext.slot.slot_id,
      is_phone_verified: false,
      booking_source: 'admin',
      confirmed_at: now,
      cancelled_at: null,
      cancellation_reason: null,
      updated_at: now,
      hold_expires_at: null,
      play_type: bookingConfig.playType,
      selected_nine: null,
      buggy_type: bookingConfig.buggyType,
      buggy_sharing_preference: bookingConfig.buggySharingPreference,
      caddy_arrangement: bookingConfig.caddieArrangement,
      payment_method: bookingConfig.paymentMethod,
      estimated_total_amount: pricing.grandTotal,
      subtotal_amount: pricing.grandTotal,
      discount_amount: 0,
      voucher_id: null,
      voucher_code: null,
      final_amount: pricing.grandTotal,
      pricing_snapshot: pricingSnapshot,
    });
    await this.bookingService.replaceBookingPlayers(
      bookingId,
      input.playerDetails.map((player) => ({
        name: player.name,
        phone_number: this.phoneService.normalizePhoneNumber(
          player.phoneNumber,
        ),
        category: player.category,
      })),
    );
    await this.bookingService.insertBookingLineItems(
      bookingId,
      slotContext,
      availability,
      counts,
      bookingConfig,
      pricing,
    );
    await this.bookingService.insertBookingStatusHistory(
      bookingId,
      null,
      'confirmed',
    );

    return this.bookingService.fetchBookingDetails(bookingRef);
  }

  async updateAdminBookingStatus(
    bookingRef: string,
    input: {
      status: 'confirmed' | 'cancelled' | 'completed' | 'no_show';
      reason?: string;
    },
  ) {
    const aggregate =
      await this.bookingService.getBookingAggregateByRef(bookingRef);
    const oldStatus = this.bookingService.getDisplayStatus(aggregate.booking);
    const now = new Date().toISOString();

    await this.bookingService.updateBookingRow(aggregate.booking.booking_id, {
      status: input.status,
      confirmed_at:
        input.status === 'confirmed'
          ? (aggregate.booking.confirmed_at ?? now)
          : aggregate.booking.confirmed_at,
      cancelled_at: input.status === 'cancelled' ? now : null,
      cancellation_reason:
        input.status === 'cancelled'
          ? (input.reason ?? 'Admin cancelled')
          : null,
      hold_expires_at: null,
      updated_at: now,
    });
    await this.bookingService.insertBookingStatusHistory(
      aggregate.booking.booking_id,
      oldStatus === 'expired' ? 'held' : oldStatus,
      input.status,
    );

    return this.bookingService.fetchBookingDetails(bookingRef);
  }

  async updateAdminBookingDetails(
    bookingRef: string,
    input: {
      hostName?: string;
      hostPhoneNumber?: string;
      caddieArrangement?: 'none' | 'shared' | 'per_player';
      playerDetails?: Array<{
        name: string;
        phoneNumber: string;
        category: 'adult' | 'normal' | 'senior' | 'junior';
        isHost: boolean;
      }>;
    },
  ) {
    const aggregate =
      await this.bookingService.getBookingAggregateByRef(bookingRef);
    const currentConfig = this.bookingService.getReadableBookingConfig(
      aggregate.booking,
      aggregate.lineItems,
    );
    const nextPlayerDetails =
      input.playerDetails ??
      aggregate.players.map((player) => ({
        name: player.name,
        phoneNumber: player.phone_number,
        category:
          player.category === 'senior' || player.category === 'junior'
            ? player.category
            : 'normal',
        isHost:
          (aggregate.hostUser?.phone_normalized ??
            aggregate.hostUser?.phone ??
            '') === player.phone_number,
      }));
    const nextConfig = input.playerDetails
      ? this.bookingService.buildBookingConfigFromSubmit({
          playType: currentConfig.playType,
          caddieArrangement:
            input.caddieArrangement ?? currentConfig.caddieArrangement,
          playerDetails: nextPlayerDetails,
        })
      : {
          ...currentConfig,
          caddieArrangement:
            input.caddieArrangement ?? currentConfig.caddieArrangement,
        };

    if (input.hostName && aggregate.booking.user_id) {
      await this.bookingService.updateAppUser(aggregate.booking.user_id, {
        name: input.hostName,
      });
    }

    if (input.hostPhoneNumber && aggregate.booking.user_id) {
      await this.bookingService.updateAppUser(aggregate.booking.user_id, {
        phone: input.hostPhoneNumber,
        phone_normalized: this.phoneService.normalizePhoneNumber(
          input.hostPhoneNumber,
        ),
      });
    }

    if (input.playerDetails) {
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
    }

    if (input.playerDetails || input.caddieArrangement) {
      const slotContext = await this.bookingService.getSlotContextById(
        aggregate.booking.slot_id,
      );
      const availability = await this.bookingService.getSlotAvailability(
        slotContext,
        undefined,
        aggregate.booking.booking_id,
      );
      const counts = this.bookingService.getRequestedBookingCounts(nextConfig);

      this.bookingService.ensurePlayerCountAllowed(
        nextConfig.playerCount,
        slotContext.teeInstance,
      );
      this.bookingService.ensureCapacityAvailable(counts, availability);

      const pricing = this.bookingService.calculateBookingPricing(
        availability,
        nextConfig,
        counts,
      );
      const pricingSnapshot = await this.bookingService.buildPricingSnapshot(
        slotContext,
        availability,
        nextConfig,
        counts,
        pricing,
      );

      await this.bookingService.replaceBookingLineItems(
        aggregate.booking.booking_id,
        slotContext,
        availability,
        counts,
        nextConfig,
        pricing,
      );

      await this.bookingService.updateBookingRow(aggregate.booking.booking_id, {
        caddy_arrangement: nextConfig.caddieArrangement,
        buggy_type: nextConfig.buggyType,
        buggy_sharing_preference: nextConfig.buggySharingPreference,
        total_amount: pricing.grandTotal,
        estimated_total_amount: pricing.grandTotal,
        subtotal_amount: pricing.grandTotal,
        discount_amount: 0,
        final_amount: pricing.grandTotal,
        pricing_snapshot: pricingSnapshot,
        updated_at: new Date().toISOString(),
      });
    } else {
      await this.bookingService.updateBookingRow(aggregate.booking.booking_id, {
        updated_at: new Date().toISOString(),
      });
    }

    return this.bookingService.fetchBookingDetails(bookingRef);
  }

  async moveAdminBookingSlot(bookingRef: string, input: { slotId: string }) {
    const aggregate =
      await this.bookingService.getBookingAggregateByRef(bookingRef);
    const slotContext = await this.bookingService.getSlotContextById(
      input.slotId,
    );
    const currentConfig = this.bookingService.getReadableBookingConfig(
      aggregate.booking,
      aggregate.lineItems,
    );
    const availability = await this.bookingService.getSlotAvailability(
      slotContext,
      undefined,
      aggregate.booking.booking_id,
    );
    const counts = this.bookingService.getRequestedBookingCounts(currentConfig);

    this.bookingService.ensurePlayerCountAllowed(
      currentConfig.playerCount,
      slotContext.teeInstance,
    );
    this.bookingService.ensureCapacityAvailable(counts, availability);

    const pricing = this.bookingService.calculateBookingPricing(
      availability,
      currentConfig,
      counts,
    );
    const pricingSnapshot = await this.bookingService.buildPricingSnapshot(
      slotContext,
      availability,
      currentConfig,
      counts,
      pricing,
    );

    await this.bookingService.replaceBookingLineItems(
      aggregate.booking.booking_id,
      slotContext,
      availability,
      counts,
      currentConfig,
      pricing,
    );
    await this.bookingService.updateBookingRow(aggregate.booking.booking_id, {
      slot_id: slotContext.slot.slot_id,
      organization_id: slotContext.organization.organization_id,
      sport_id: slotContext.organizationSport.sport_id,
      play_type: currentConfig.playType,
      total_amount: pricing.grandTotal,
      estimated_total_amount: pricing.grandTotal,
      subtotal_amount: pricing.grandTotal,
      final_amount: pricing.grandTotal,
      pricing_snapshot: pricingSnapshot,
      updated_at: new Date().toISOString(),
    });

    return this.bookingService.fetchBookingDetails(bookingRef);
  }

  async markAdminBookingPaid(bookingRef: string, input: { note?: string }) {
    const aggregate =
      await this.bookingService.getBookingAggregateByRef(bookingRef);
    const paidAt = new Date().toISOString();
    const pricingSnapshot = {
      ...(aggregate.booking.pricing_snapshot ?? {}),
      adminPayment: {
        method: 'pay_counter',
        status: 'paid',
        paidAt,
        note: input.note ?? null,
      },
    };

    await this.bookingService.updateBookingRow(aggregate.booking.booking_id, {
      payment_method: 'pay_counter',
      pricing_snapshot: pricingSnapshot,
      updated_at: paidAt,
    });

    return {
      bookingRef,
      paymentStatus: 'paid',
      paidAt,
    };
  }

  async createAdminBookingDocument(
    bookingRef: string,
    input: { type: BookingDocumentKind },
  ) {
    const aggregate =
      await this.bookingService.getBookingAggregateByRef(bookingRef);
    const details = await this.bookingService.fetchBookingDetails(bookingRef);
    const issuedAt = new Date().toISOString();
    const documentNo = `${input.type === 'receipt' ? 'RCPT' : 'INV'}-${bookingRef}`;
    const pricing = details.pricing;
    const lineItems = [
      { label: 'Green fee', amount: pricing.greenFeeTotal },
      { label: 'Caddie', amount: pricing.caddieTotal },
      { label: 'Buggy', amount: pricing.buggyEstimatedTotal },
      { label: 'Insurance', amount: pricing.insuranceTotal },
      { label: 'SST', amount: pricing.sstTotal },
      ...(details.discountAmount && details.discountAmount > 0
        ? [{ label: 'Discount', amount: -details.discountAmount }]
        : []),
    ].filter((item) => item.amount !== 0);
    const paymentStatus =
      (aggregate.booking.pricing_snapshot as Record<string, unknown> | null)
        ?.adminPayment &&
      typeof (aggregate.booking.pricing_snapshot as Record<string, unknown>)
        .adminPayment === 'object'
        ? 'paid'
        : input.type === 'receipt'
          ? 'paid'
          : 'pending';

    const document = {
      type: input.type,
      documentNo,
      issuedAt,
      bookingRef,
      paymentStatus,
      club: {
        name: details.golfClubName,
        slug: details.golfClubSlug,
      },
      customer: {
        name: details.hostName,
        phoneNumber: details.hostPhoneNumber,
      },
      booking: {
        date: details.bookingDate,
        teeTimeSlot: details.teeTimeSlot,
        playerCount: details.playerCount,
        players: details.playerDetails,
      },
      currency: pricing.currency,
      lineItems,
      totals: {
        subtotalAmount: details.subtotalAmount ?? pricing.grandTotal,
        discountAmount: details.discountAmount ?? 0,
        grandTotal: pricing.grandTotal,
        finalAmount: details.finalAmount ?? pricing.grandTotal,
      },
    };

    return {
      ...document,
      printableHtml: this.buildBookingDocumentHtml(document),
    };
  }

  async blockSlot(slotId: string, input: { reason?: string }) {
    const slotContext = await this.bookingService.getSlotContextById(slotId);
    const payload = {
      override_id: randomUUID(),
      facility_id: slotContext.facility.facility_id,
      resource_instance_id: slotContext.slot.resource_instance_id,
      start_at: slotContext.slot.start_at,
      end_at: slotContext.slot.end_at,
    };
    const result = await this.supabase.client
      .from('availability_override')
      .insert({ ...payload, reason: input.reason ?? 'Admin blocked slot' });

    if (result.error) {
      const retry = await this.supabase.client
        .from('availability_override')
        .insert(payload);

      if (retry.error) {
        throw new InternalServerErrorException(retry.error.message);
      }
    }

    return { slotId, status: 'blocked' };
  }

  async unblockSlot(slotId: string) {
    const slotContext = await this.bookingService.getSlotContextById(slotId);
    const result = await this.supabase.client
      .from('availability_override')
      .delete()
      .eq('facility_id', slotContext.facility.facility_id)
      .eq('resource_instance_id', slotContext.slot.resource_instance_id)
      .eq('start_at', slotContext.slot.start_at)
      .eq('end_at', slotContext.slot.end_at);

    if (result.error) {
      throw new InternalServerErrorException(result.error.message);
    }

    return { slotId, status: 'open' };
  }

  async bulkBlockSlots(input: {
    golfClubSlug: string;
    slotIds?: string[];
    startAt?: string;
    endAt?: string;
    reason?: string;
  }) {
    if (input.golfClubSlug !== ADMIN_BOOKABLE_CLUB_SLUG) {
      throw new NotFoundException(
        `Booking is currently available only for slug: ${ADMIN_BOOKABLE_CLUB_SLUG}`,
      );
    }

    if (input.slotIds?.length) {
      const uniqueSlotIds = [...new Set(input.slotIds)];
      const results: Array<{ slotId: string; status: string }> = [];

      for (const slotId of uniqueSlotIds) {
        const slotContext = await this.bookingService.getSlotContextById(slotId);
        const availability =
          await this.bookingService.getSlotAvailability(slotContext);

        if (availability.activeBookingCount > 0) {
          continue;
        }

        results.push(await this.blockSlot(slotId, { reason: input.reason }));
      }

      return {
        golfClubSlug: input.golfClubSlug,
        slotIds: uniqueSlotIds,
        blockedCount: results.length,
        items: results,
      };
    }

    if (!input.startAt || !input.endAt) {
      return {
        golfClubSlug: input.golfClubSlug,
        blockedCount: 0,
        items: [],
      };
    }

    const slots = await this.bookingService.fetchAdminTeeSlots({
      golfClubSlug: input.golfClubSlug,
      bookingDate: this.bookingService.extractDate(input.startAt),
      playType: '18_holes',
    });
    const startTime = new Date(input.startAt).getTime();
    const endTime = new Date(input.endAt).getTime();
    const targetSlots = slots.slots.filter(
      (slot) =>
        new Date(slot.startAt).getTime() >= startTime &&
        new Date(slot.startAt).getTime() < endTime &&
        !slot.isBlocked,
    );

    const results: Array<{ slotId: string; status: string }> = [];
    for (const slot of targetSlots) {
      results.push(await this.blockSlot(slot.slotId, { reason: input.reason }));
    }

    return {
      golfClubSlug: input.golfClubSlug,
      startAt: input.startAt,
      endAt: input.endAt,
      blockedCount: results.length,
      items: results,
    };
  }

  async fetchAdminCustomers(input: { q?: string; page?: number; pageSize?: number }) {
    const result = await this.supabase.client
      .from('app_user')
      .select('user_id, name, phone, phone_normalized, email, created_at, updated_at')
      .order('created_at', { ascending: false });

    if (result.error) {
      throw new InternalServerErrorException(result.error.message);
    }

    const normalizedQuery = input.q?.trim().toLowerCase() ?? '';
    const rows = ((result.data ?? []) as AdminCustomerRow[]).filter((user) => {
      if (!normalizedQuery) return true;
      return [
        user.name ?? '',
        user.phone ?? '',
        user.phone_normalized ?? '',
        user.email ?? '',
      ]
        .join(' ')
        .toLowerCase()
        .includes(normalizedQuery);
    });
    const bookingRows = await this.bookingService.getBookingRowsForList();
    const byUserId = new Map<string, typeof bookingRows>();

    for (const booking of bookingRows) {
      if (!booking.user_id) continue;
      const existing = byUserId.get(booking.user_id) ?? [];
      existing.push(booking);
      byUserId.set(booking.user_id, existing);
    }

    const items = rows.map((user) => {
      const bookings = byUserId.get(user.user_id) ?? [];
      const completedBookings = bookings.filter((booking) =>
        ['confirmed', 'completed', 'no_show'].includes(
          this.bookingService.getDisplayStatus(booking),
        ),
      );
      return {
        userId: user.user_id,
        name: user.name ?? 'Unknown',
        phoneNumber: user.phone_normalized ?? user.phone ?? '',
        email: user.email ?? null,
        bookingCount: bookings.length,
        completedBookingCount: completedBookings.length,
        totalSpend: completedBookings.reduce(
          (sum, booking) =>
            sum +
            this.bookingService.toNumber(
              booking.final_amount ?? booking.total_amount,
            ),
          0,
        ),
        createdAt: user.created_at ?? null,
        updatedAt: user.updated_at ?? null,
      };
    });

    const page = input.page ?? 1;
    const pageSize = input.pageSize ?? 50;
    return {
      page,
      pageSize,
      total: items.length,
      items: items.slice((page - 1) * pageSize, page * pageSize),
    };
  }

  async fetchAdminCustomerBookings(userId: string) {
    const bookingRows = (await this.bookingService.getBookingRowsForList()).filter(
      (booking) => booking.user_id === userId,
    );
    const items = (
      await Promise.all(
        bookingRows.map((booking) =>
          this.bookingService.buildBookingAggregate(booking),
        ),
      )
    ).map((aggregate) => this.toListItem(aggregate));

    return {
      userId,
      total: items.length,
      items,
    };
  }

  async fetchPublicHolidays(input: {
    golfClubSlug: string;
    year?: number;
  }) {
    const scope = await this.getAdminClubScope(input.golfClubSlug);
    const year = input.year ?? new Date().getFullYear();
    const startDate = `${year}-01-01`;
    const endDate = `${year + 1}-01-01`;

    const result = await this.supabase.client
      .from('public_holiday_calendar')
      .select(
        'holiday_id, organization_id, facility_id, holiday_date, name, rate_day_type, active, metadata, created_by, created_at, updated_at',
      )
      .eq('organization_id', scope.organization.organization_id)
      .gte('holiday_date', startDate)
      .lt('holiday_date', endDate)
      .order('holiday_date', { ascending: true });

    if (result.error) {
      throw new InternalServerErrorException(result.error.message);
    }

    const items = ((result.data ?? []) as AdminPublicHolidayRow[]).map((row) =>
      this.toPublicHolidayItem(row),
    );

    return {
      filters: {
        golfClubSlug: input.golfClubSlug,
        year,
      },
      total: items.length,
      items,
    };
  }

  async createPublicHoliday(
    input: {
      golfClubSlug: string;
      holidayDate: string;
      name: string;
      rateDayType?: 'weekend';
      active?: boolean;
    },
    adminUserId: string,
  ) {
    const scope = await this.getAdminClubScope(input.golfClubSlug);
    const now = new Date().toISOString();
    const result = await this.supabase.client
      .from('public_holiday_calendar')
      .upsert(
        {
          organization_id: scope.organization.organization_id,
          facility_id: scope.facility.facility_id,
          holiday_date: input.holidayDate,
          name: input.name,
          rate_day_type: input.rateDayType ?? 'weekend',
          active: input.active ?? true,
          created_by: adminUserId,
          updated_at: now,
        },
        {
          onConflict: 'organization_id,facility_id,holiday_date',
        },
      )
      .select(
        'holiday_id, organization_id, facility_id, holiday_date, name, rate_day_type, active, metadata, created_by, created_at, updated_at',
      )
      .single<AdminPublicHolidayRow>();

    if (result.error) {
      throw new InternalServerErrorException(result.error.message);
    }

    return this.toPublicHolidayItem(result.data);
  }

  async updatePublicHoliday(
    holidayId: string,
    input: {
      name?: string;
      holidayDate?: string;
      rateDayType?: 'weekend';
      active?: boolean;
    },
  ) {
    const patch: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (input.name !== undefined) patch.name = input.name;
    if (input.holidayDate !== undefined) patch.holiday_date = input.holidayDate;
    if (input.rateDayType !== undefined) patch.rate_day_type = input.rateDayType;
    if (input.active !== undefined) patch.active = input.active;

    const result = await this.supabase.client
      .from('public_holiday_calendar')
      .update(patch)
      .eq('holiday_id', holidayId)
      .select(
        'holiday_id, organization_id, facility_id, holiday_date, name, rate_day_type, active, metadata, created_by, created_at, updated_at',
      )
      .maybeSingle<AdminPublicHolidayRow>();

    if (result.error) {
      throw new InternalServerErrorException(result.error.message);
    }

    if (!result.data) {
      throw new NotFoundException(`Public holiday not found: ${holidayId}`);
    }

    return this.toPublicHolidayItem(result.data);
  }

  async deletePublicHoliday(holidayId: string) {
    const result = await this.supabase.client
      .from('public_holiday_calendar')
      .delete()
      .eq('holiday_id', holidayId)
      .select('holiday_id')
      .maybeSingle<{ holiday_id: string }>();

    if (result.error) {
      throw new InternalServerErrorException(result.error.message);
    }

    if (!result.data) {
      throw new NotFoundException(`Public holiday not found: ${holidayId}`);
    }

    return {
      holidayId,
      deleted: true,
    };
  }

  private toPublicHolidayItem(row: AdminPublicHolidayRow) {
    return {
      holidayId: row.holiday_id,
      organizationId: row.organization_id,
      facilityId: row.facility_id,
      holidayDate: row.holiday_date,
      name: row.name,
      rateDayType: row.rate_day_type,
      active: row.active ?? true,
      createdBy: row.created_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  async fetchBookingReport(input: {
    golfClubSlug?: string;
    dateFrom?: string;
    dateTo?: string;
  }) {
    const bookings = await this.fetchReportItems(input);
    const byStatus = this.groupBy(bookings, (item) => item.status);

    return {
      filters: input,
      summary: {
        totalBookings: bookings.length,
        totalPlayers: bookings.reduce((sum, item) => sum + item.playerCount, 0),
        byStatus,
      },
      items: bookings,
    };
  }

  async fetchRevenueReport(input: {
    golfClubSlug?: string;
    dateFrom?: string;
    dateTo?: string;
  }) {
    const bookings = await this.fetchReportItems(input);
    const revenueItems = bookings.filter((item) => item.status !== 'cancelled');

    return {
      filters: input,
      summary: {
        grossRevenue: revenueItems.reduce((sum, item) => sum + item.grandTotal, 0),
        bookingCount: revenueItems.length,
        averageBookingValue:
          revenueItems.length > 0
            ? Math.round(
                (revenueItems.reduce((sum, item) => sum + item.grandTotal, 0) /
                  revenueItems.length) *
                  100,
              ) / 100
            : 0,
        currency: 'MYR',
      },
      items: revenueItems,
    };
  }

  async fetchMonthlyTrendReport(input: {
    golfClubSlug?: string;
    months?: number;
  }) {
    const months = Math.min(Math.max(input.months ?? 6, 1), 24);
    const now = new Date();
    const monthKeys = Array.from({ length: months }, (_, index) => {
      const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
      date.setUTCMonth(date.getUTCMonth() - (months - 1 - index));
      return date.toISOString().slice(0, 7);
    });
    const rows = await this.fetchReportItems({
      golfClubSlug: input.golfClubSlug,
    });
    const empty = () => ({
      total: 0,
      held: 0,
      pendingPayment: 0,
      confirmed: 0,
      completed: 0,
      noShow: 0,
      cancelled: 0,
      revenue: 0,
    });
    const byMonth = new Map(monthKeys.map((key) => [key, empty()]));

    for (const item of rows) {
      const month = item.bookingDate.slice(0, 7);
      const bucket = byMonth.get(month);
      if (!bucket) continue;

      bucket.total += 1;
      if (item.status === 'held') bucket.held += 1;
      if (item.status === 'pending_payment') bucket.pendingPayment += 1;
      if (item.status === 'confirmed') bucket.confirmed += 1;
      if (item.status === 'completed') bucket.completed += 1;
      if (item.status === 'no_show') bucket.noShow += 1;
      if (item.status === 'cancelled') bucket.cancelled += 1;
      if (item.status !== 'cancelled') bucket.revenue += item.grandTotal;
    }

    return {
      filters: {
        golfClubSlug: input.golfClubSlug ?? null,
        months,
      },
      items: monthKeys.map((month) => ({
        month,
        label: new Intl.DateTimeFormat('en-MY', {
          month: 'short',
          year: '2-digit',
          timeZone: 'UTC',
        }).format(new Date(`${month}-01T00:00:00.000Z`)),
        ...byMonth.get(month),
      })),
    };
  }

  async fetchSlotUtilizationReport(input: {
    golfClubSlug: string;
    bookingDate: string;
  }) {
    const board = await this.fetchAdminSlotBoard(input);
    const occupiedStatuses = ['held', 'confirmed', 'completed', 'no_show'];
    const occupiedSlots = board.items.filter((item) =>
      occupiedStatuses.includes(item.status),
    ).length;

    return {
      filters: input,
      summary: {
        totalSlots: board.summary.totalSlots,
        occupiedSlots,
        openSlots: board.summary.openSlots,
        blockedSlots: board.summary.blockedSlots,
        utilizationRate:
          board.summary.totalSlots > 0
            ? Math.round((occupiedSlots / board.summary.totalSlots) * 10000) / 100
            : 0,
      },
      items: board.items,
    };
  }

  async fetchAdminVouchers() {
    const result = await this.supabase.client
      .from('voucher')
      .select(
        'voucher_id, code, name, description, discount_type, discount_value, max_discount_amount, min_booking_amount, currency, max_total_redemptions, max_redemptions_per_user, first_time_booking_only, starts_at, ends_at, active, metadata, created_at, updated_at',
      )
      .order('created_at', { ascending: false });

    if (result.error) {
      throw new InternalServerErrorException(result.error.message);
    }

    const rows = (result.data ?? []) as AdminVoucherRow[];
    const redemptionCounts = await this.fetchVoucherRedemptionCounts(
      rows.map((row) => row.voucher_id),
    );

    return {
      total: rows.length,
      items: rows.map((row) => this.toVoucherItem(row, redemptionCounts)),
    };
  }

  async createAdminVoucher(input: Record<string, unknown>) {
    const now = new Date().toISOString();
    const result = await this.supabase.client
      .from('voucher')
      .insert({
        voucher_id: randomUUID(),
        ...input,
        code: String(input.code ?? '').trim().toUpperCase(),
        currency: input.currency ?? 'MYR',
        metadata: input.metadata ?? {},
        created_at: now,
        updated_at: now,
      })
      .select(
        'voucher_id, code, name, description, discount_type, discount_value, max_discount_amount, min_booking_amount, currency, max_total_redemptions, max_redemptions_per_user, first_time_booking_only, starts_at, ends_at, active, metadata, created_at, updated_at',
      )
      .single<AdminVoucherRow>();

    if (result.error) {
      throw new InternalServerErrorException(result.error.message);
    }

    return this.toVoucherItem(result.data, new Map());
  }

  async updateAdminVoucher(voucherId: string, input: Record<string, unknown>) {
    const patch = {
      ...input,
      ...(input.code ? { code: String(input.code).trim().toUpperCase() } : {}),
      updated_at: new Date().toISOString(),
    };
    const result = await this.supabase.client
      .from('voucher')
      .update(patch)
      .eq('voucher_id', voucherId)
      .select(
        'voucher_id, code, name, description, discount_type, discount_value, max_discount_amount, min_booking_amount, currency, max_total_redemptions, max_redemptions_per_user, first_time_booking_only, starts_at, ends_at, active, metadata, created_at, updated_at',
      )
      .single<AdminVoucherRow>();

    if (result.error) {
      throw new InternalServerErrorException(result.error.message);
    }

    return this.toVoucherItem(result.data, new Map());
  }

  async fetchAdminVoucherRedemptions(voucherId: string) {
    const result = await this.supabase.client
      .from('voucher_redemption')
      .select(
        'redemption_id, voucher_id, user_id, booking_id, discount_amount, currency, status, reserved_at, applied_at, cancelled_at, created_at',
      )
      .eq('voucher_id', voucherId)
      .order('created_at', { ascending: false });

    if (result.error) {
      throw new InternalServerErrorException(result.error.message);
    }

    const rows = (result.data ?? []) as AdminVoucherRedemptionRow[];
    return {
      voucherId,
      total: rows.length,
      summary: {
        applied: rows.filter((row) => row.status === 'applied').length,
        reserved: rows.filter((row) => row.status === 'reserved').length,
        cancelled: rows.filter((row) => row.status === 'cancelled').length,
        totalDiscount: rows.reduce(
          (sum, row) => sum + this.bookingService.toNumber(row.discount_amount),
          0,
        ),
      },
      items: rows.map((row) => ({
        redemptionId: row.redemption_id,
        voucherId: row.voucher_id,
        userId: row.user_id,
        bookingId: row.booking_id,
        discountAmount: this.bookingService.toNumber(row.discount_amount),
        currency: row.currency,
        status: row.status,
        reservedAt: row.reserved_at,
        appliedAt: row.applied_at,
        cancelledAt: row.cancelled_at,
        createdAt: row.created_at,
      })),
    };
  }

  private async fetchReportItems(input: {
    golfClubSlug?: string;
    dateFrom?: string;
    dateTo?: string;
  }) {
    const bookings = await this.fetchAdminBookings({
      golfClubSlug: input.golfClubSlug,
      page: 1,
      pageSize: 1000,
    });

    return bookings.items.filter((item) => {
      if (input.dateFrom && item.bookingDate < input.dateFrom) return false;
      if (input.dateTo && item.bookingDate > input.dateTo) return false;
      return true;
    });
  }

  private buildBookingDocumentHtml(document: {
    type: BookingDocumentKind;
    documentNo: string;
    issuedAt: string;
    bookingRef: string;
    paymentStatus: string;
    club: { name: string; slug: string };
    customer: { name: string; phoneNumber: string };
    booking: { date: string; teeTimeSlot: string; playerCount: number };
    currency: string;
    lineItems: Array<{ label: string; amount: number }>;
    totals: {
      subtotalAmount: number;
      discountAmount: number;
      grandTotal: number;
      finalAmount: number;
    };
  }) {
    const title = document.type === 'receipt' ? 'Receipt' : 'Invoice';
    const rows = document.lineItems
      .map(
        (item) =>
          `<tr><td>${this.escapeHtml(item.label)}</td><td style="text-align:right">${document.currency} ${item.amount.toFixed(2)}</td></tr>`,
      )
      .join('');

    return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${title} ${this.escapeHtml(document.documentNo)}</title>
  <style>
    body { font-family: Arial, sans-serif; color: #10202f; margin: 32px; }
    h1 { margin: 0 0 8px; }
    .muted { color: #607084; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin: 24px 0; }
    table { width: 100%; border-collapse: collapse; margin-top: 24px; }
    td, th { border-bottom: 1px solid #d9e2ec; padding: 12px; text-align: left; }
    .total td { font-weight: 700; font-size: 18px; }
  </style>
</head>
<body>
  <h1>${title}</h1>
  <p class="muted">${this.escapeHtml(document.documentNo)} | ${new Date(document.issuedAt).toLocaleString('en-MY')}</p>
  <div class="grid">
    <section>
      <h3>Customer</h3>
      <p>${this.escapeHtml(document.customer.name)}<br />${this.escapeHtml(document.customer.phoneNumber)}</p>
    </section>
    <section>
      <h3>Booking</h3>
      <p>${this.escapeHtml(document.club.name)}<br />${document.booking.date} ${this.escapeHtml(document.booking.teeTimeSlot)}<br />${document.booking.playerCount} players</p>
    </section>
  </div>
  <table>
    <thead><tr><th>Item</th><th style="text-align:right">Amount</th></tr></thead>
    <tbody>${rows}</tbody>
    <tfoot>
      <tr><td>Subtotal</td><td style="text-align:right">${document.currency} ${document.totals.subtotalAmount.toFixed(2)}</td></tr>
      <tr><td>Discount</td><td style="text-align:right">${document.currency} ${document.totals.discountAmount.toFixed(2)}</td></tr>
      <tr class="total"><td>Total</td><td style="text-align:right">${document.currency} ${document.totals.finalAmount.toFixed(2)}</td></tr>
    </tfoot>
  </table>
  <p class="muted">Booking ref: ${this.escapeHtml(document.bookingRef)} | Payment: ${this.escapeHtml(document.paymentStatus)}</p>
</body>
</html>`;
  }

  private escapeHtml(value: string) {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  private groupBy<T>(items: T[], keyFn: (item: T) => string) {
    return items.reduce<Record<string, number>>((accumulator, item) => {
      const key = keyFn(item);
      accumulator[key] = (accumulator[key] ?? 0) + 1;
      return accumulator;
    }, {});
  }

  private async fetchVoucherRedemptionCounts(voucherIds: string[]) {
    const counts = new Map<string, number>();
    if (voucherIds.length === 0) {
      return counts;
    }

    const result = await this.supabase.client
      .from('voucher_redemption')
      .select('voucher_id')
      .in('voucher_id', voucherIds);

    if (result.error) {
      throw new InternalServerErrorException(result.error.message);
    }

    for (const row of (result.data ?? []) as Array<{ voucher_id: string }>) {
      counts.set(row.voucher_id, (counts.get(row.voucher_id) ?? 0) + 1);
    }

    return counts;
  }

  private toVoucherItem(
    row: AdminVoucherRow,
    redemptionCounts: Map<string, number>,
  ) {
    return {
      voucherId: row.voucher_id,
      code: row.code,
      name: row.name,
      description: row.description,
      discountType: row.discount_type,
      discountValue: this.bookingService.toNumber(row.discount_value),
      maxDiscountAmount: this.bookingService.toNumber(row.max_discount_amount),
      minBookingAmount: this.bookingService.toNumber(row.min_booking_amount),
      currency: row.currency,
      maxTotalRedemptions: row.max_total_redemptions,
      maxRedemptionsPerUser: row.max_redemptions_per_user,
      firstTimeBookingOnly: row.first_time_booking_only ?? false,
      startsAt: row.starts_at,
      endsAt: row.ends_at,
      active: row.active ?? false,
      redemptionCount: redemptionCounts.get(row.voucher_id) ?? 0,
      createdAt: row.created_at ?? null,
      updatedAt: row.updated_at ?? null,
    };
  }
}
