  import {
  ConflictException,
  GoneException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { SupabaseService } from '../supabase/supabase.service';

type SourcePlatform = 'web' | 'ios' | 'android';
type ListMode = 'upcoming' | 'past';
type BookingStatus = 'held' | 'confirmed' | 'completed' | 'cancelled' | 'expired';
type ResourceType = 'tee_time' | 'caddie' | 'golf_cart';

type PlayerDetail = {
  name: string;
  phoneNumber: string;
};

type SlotSelectionRequest = {
  slotId: string;
  playerCount: number;
  caddieCount: number;
  golfCartCount: number;
};

type CreateHoldRequest = SlotSelectionRequest & {
  hostName: string;
  hostPhoneNumber: string;
  source: SourcePlatform;
};

type SubmitBookingRequest = {
  bookingRef: string;
  playerDetails: PlayerDetail[];
};

type UpdateBookingRequest = {
  hostName?: string;
  playerDetails?: PlayerDetail[];
};

type BookingCounts = {
  playerCount: number;
  caddieCount: number;
  golfCartCount: number;
};

type GolfSport = {
  sport_id: string;
  sport_code: string;
  sport_name: string;
};

type OrganizationRow = {
  organization_id: string;
  name: string;
  address: string | null;
  slug: string;
  created_at: string | null;
};

type OrganizationSportRow = {
  organization_sport_id: string;
  organization_id: string;
  sport_id: string;
};

type FacilityRow = {
  facility_id: string;
  organization_sport_id: string;
  facility_name: string;
  capacity: number | string | null;
  no_of_holes: number | string | null;
};

type BookableResourceRow = {
  resource_id: string;
  sport_id: string;
  resource_type: ResourceType;
  name: string;
  is_optional: boolean | null;
};

type ResourceInstanceRow = {
  resource_instance_id: string;
  resource_id: string;
  organization_id: string;
  identifier: string | null;
};

type ResourceSlotRow = {
  slot_id: string;
  resource_instance_id: string;
  start_at: string;
  end_at: string;
  base_price: number | string | null;
};

type AvailabilityOverrideRow = {
  override_id: string;
  facility_id: string;
  resource_instance_id: string | null;
  start_at: string;
  end_at: string;
};

type AppUserRow = {
  user_id: string;
  name: string | null;
  phone: string | null;
  phone_normalized: string | null;
  is_phone_verified: boolean | null;
};

type BookingRow = {
  booking_id: string;
  user_id: string | null;
  organization_id: string;
  sport_id: string;
  status: string;
  total_amount: number | string | null;
  created_at: string;
  booking_ref: string;
  visitor_id: string | null;
  slot_id: string;
  is_phone_verified: boolean | null;
  booking_source: string | null;
  confirmed_at: string | null;
  cancelled_at: string | null;
  cancellation_reason: string | null;
  updated_at: string | null;
  hold_expires_at: string | null;
};

type BookingLineItemRow = {
  booking_line_item_id: string;
  booking_id: string;
  resource_id: string;
  resource_instance_id: string | null;
  slot_id: string | null;
  quantity: number | string | null;
  unit_price: number | string | null;
  total_price: number | string | null;
  metadata: Record<string, unknown> | null;
};

type BookingPlayerRow = {
  booking_player_id: string;
  booking_id: string;
  name: string;
  phone_number: string;
  category: string | null;
  handicap: number | string | null;
  created_at: string | null;
};

type ResourceCatalog = {
  byId: Map<string, BookableResourceRow>;
  byType: Record<ResourceType, BookableResourceRow[]>;
};

type SlotContext = {
  organization: OrganizationRow;
  organizationSport: OrganizationSportRow;
  facility: FacilityRow;
  slot: ResourceSlotRow;
  teeResource: BookableResourceRow;
  teeInstance: ResourceInstanceRow;
  resourceCatalog: ResourceCatalog;
};

type ClubContext = {
  organization: OrganizationRow;
  organizationSport: OrganizationSportRow;
  facility: FacilityRow;
  resourceCatalog: ResourceCatalog;
  teeInstancesById: Map<string, ResourceInstanceRow>;
};

type SlotAvailabilitySummary = {
  playerCapacity: number;
  caddieCapacity: number;
  golfCartCapacity: number;
  teeTimeUnitPrice: number;
  caddieUnitPrice: number;
  golfCartUnitPrice: number;
};

type BookingAggregate = {
  booking: BookingRow;
  organization: OrganizationRow;
  facility: FacilityRow | null;
  slot: ResourceSlotRow;
  hostUser: AppUserRow | null;
  players: BookingPlayerRow[];
  lineItems: BookingLineItemRow[];
  resourceCatalog: ResourceCatalog;
};

type IdempotencyRow = {
  idempotency_key: string;
  visitor_id: string | null;
  user_id: string | null;
  booking_id: string | null;
  request_type: string | null;
  created_at: string | null;
};

const HOLD_DURATION_SECONDS = 300;
const CURRENCY = 'MYR';

@Injectable()
export class BookingService {
  constructor(private readonly supabase: SupabaseService) {}

  async fetchGolfClubList() {
    const sport = await this.getGolfSport();
    const organizationSports = await this.getOrganizationSportsBySportId(sport.sport_id);
    const organizations = await this.getOrganizationsByIds(
      organizationSports.map((item) => item.organization_id),
    );
    const facilities = await this.getFacilitiesByOrganizationSportIds(
      organizationSports.map((item) => item.organization_sport_id),
    );

    return organizationSports
      .map((organizationSport) => {
        const organization = organizations.get(organizationSport.organization_id);
        const facility = facilities.find(
          (item) => item.organization_sport_id === organizationSport.organization_sport_id,
        );

        if (!organization || !facility) {
          return null;
        }

        return {
          id: facility.facility_id,
          slug: organization.slug,
          name: facility.facility_name || organization.name,
          address: organization.address ?? '',
          noOfHoles: this.toNumber(facility.no_of_holes),
          updatedAt: organization.created_at ?? new Date().toISOString(),
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);
  }

  async fetchAvailableSlots({
    golfClubSlug,
    bookingDate,
  }: {
    golfClubSlug: string;
    bookingDate?: string;
  }) {
    const clubContext = await this.getClubContextBySlug(golfClubSlug);
    const teeSlots = await this.getTeeSlots(clubContext, bookingDate);

    const slots = await Promise.all(
      teeSlots.map(async (slot) => {
        const teeInstance = clubContext.teeInstancesById.get(slot.resource_instance_id);
        if (!teeInstance) {
          return null;
        }

        const teeResource = clubContext.resourceCatalog.byId.get(teeInstance.resource_id);
        if (!teeResource) {
          return null;
        }

        const availability = await this.getSlotAvailability({
          organization: clubContext.organization,
          organizationSport: clubContext.organizationSport,
          facility: clubContext.facility,
          slot,
          teeResource,
          teeInstance,
          resourceCatalog: clubContext.resourceCatalog,
        });

        return {
          slotId: slot.slot_id,
          teeTimeSlot: this.formatTeeTime(slot.start_at),
          startAt: slot.start_at,
          endAt: slot.end_at,
          pricePerPerson: availability.teeTimeUnitPrice,
          currency: CURRENCY,
          remainingPlayerCapacity: availability.playerCapacity,
          remainingCaddieCapacity: availability.caddieCapacity,
          remainingGolfCartCapacity: availability.golfCartCapacity,
          isAvailable: availability.playerCapacity > 0,
        };
      }),
    );

    return {
      club: {
        slug: clubContext.organization.slug,
        name: clubContext.facility.facility_name || clubContext.organization.name,
      },
      bookingDate: bookingDate ?? null,
      slots: slots.filter((item): item is NonNullable<typeof item> => item !== null),
    };
  }

  async createBookingHold(
    request: CreateHoldRequest,
    idempotencyKey: string,
    deviceId?: string,
  ) {
    const existing = await this.getExistingIdempotency(idempotencyKey);
    if (existing?.booking_id) {
      const aggregate = await this.getBookingAggregateById(existing.booking_id);
      return this.buildHoldResponse(aggregate);
    }

    const slotContext = await this.getSlotContextById(request.slotId);
    const availability = await this.getSlotAvailability(slotContext);
    this.ensureCapacityAvailable(request, availability);

    const normalizedPhoneNumber = this.normalizePhoneNumber(request.hostPhoneNumber);
    const hostUser = await this.findOrCreateAppUser(
      request.hostName,
      request.hostPhoneNumber,
      normalizedPhoneNumber,
    );
    const visitorId = await this.resolveVisitorId(deviceId);
    const now = new Date().toISOString();
    const bookingId = randomUUID();
    const bookingRef = this.generateBookingRef();
    const holdExpiresAt = new Date(Date.now() + HOLD_DURATION_SECONDS * 1000).toISOString();
    const priceBreakdown = this.calculatePriceBreakdown(availability, request);

    await this.insertBooking({
      booking_id: bookingId,
      user_id: hostUser.user_id,
      organization_id: slotContext.organization.organization_id,
      sport_id: slotContext.organizationSport.sport_id,
      status: 'held',
      total_amount: priceBreakdown.grandTotal,
      created_at: now,
      booking_ref: bookingRef,
      visitor_id: visitorId,
      slot_id: slotContext.slot.slot_id,
      is_phone_verified: hostUser.is_phone_verified ?? false,
      booking_source: request.source,
      confirmed_at: null,
      cancelled_at: null,
      cancellation_reason: null,
      updated_at: now,
      hold_expires_at: holdExpiresAt,
    });

    await this.insertBookingLineItems(
      bookingId,
      slotContext,
      availability,
      {
        playerCount: request.playerCount,
        caddieCount: request.caddieCount,
        golfCartCount: request.golfCartCount,
      },
    );
    await this.insertBookingStatusHistory(bookingId, null, 'held');
    await this.insertBookingIdempotency(
      idempotencyKey,
      visitorId,
      hostUser.user_id,
      bookingId,
    );

    const aggregate = await this.getBookingAggregateById(bookingId);
    return this.buildHoldResponse(aggregate);
  }

  async submitBooking({ bookingRef, playerDetails }: SubmitBookingRequest) {
    const aggregate = await this.getBookingAggregateByRef(bookingRef);
    const displayStatus = this.getDisplayStatus(aggregate.booking);

    if (displayStatus === 'expired') {
      throw new GoneException('Booking hold has expired');
    }

    if (displayStatus !== 'held') {
      throw new ConflictException('Booking is not in held status');
    }

    await this.replaceBookingPlayers(
      aggregate.booking.booking_id,
      playerDetails.map((player) => ({
        name: player.name,
        phone_number: this.normalizePhoneNumber(player.phoneNumber),
      })),
    );

    const now = new Date().toISOString();
    await this.updateBookingRow(aggregate.booking.booking_id, {
      status: 'confirmed',
      confirmed_at: now,
      hold_expires_at: null,
      updated_at: now,
    });
    await this.insertBookingStatusHistory(aggregate.booking.booking_id, 'held', 'confirmed');

    const refreshed = await this.getBookingAggregateById(aggregate.booking.booking_id);
    const counts = this.extractCountsFromLineItems(
      refreshed.lineItems,
      refreshed.resourceCatalog,
    );

    return {
      bookingId: refreshed.booking.booking_id,
      bookingRef: refreshed.booking.booking_ref,
      status: refreshed.booking.status,
      confirmedAt: refreshed.booking.confirmed_at,
      bookingSummary: {
        golfClubName: refreshed.facility?.facility_name ?? refreshed.organization.name,
        bookingDate: this.extractDate(refreshed.slot.start_at),
        teeTimeSlot: this.formatTeeTime(refreshed.slot.start_at),
        playerCount: counts.playerCount,
        caddieCount: counts.caddieCount,
        golfCartCount: counts.golfCartCount,
        grandTotal: this.toNumber(refreshed.booking.total_amount),
        currency: CURRENCY,
      },
    };
  }

  async fetchBookingDetails(bookingRef: string) {
    const aggregate = await this.getBookingAggregateByRef(bookingRef);
    const counts = this.extractCountsFromLineItems(
      aggregate.lineItems,
      aggregate.resourceCatalog,
    );

    return {
      bookingRef: aggregate.booking.booking_ref,
      status: this.getDisplayStatus(aggregate.booking),
      isPhoneVerified: aggregate.booking.is_phone_verified ?? false,
      golfClubName: aggregate.facility?.facility_name ?? aggregate.organization.name,
      golfClubSlug: aggregate.organization.slug,
      bookingDate: this.extractDate(aggregate.slot.start_at),
      teeTimeSlot: this.formatTeeTime(aggregate.slot.start_at),
      hostName: aggregate.hostUser?.name ?? '',
      hostPhoneNumber:
        aggregate.hostUser?.phone_normalized ?? aggregate.hostUser?.phone ?? '',
      playerCount: counts.playerCount,
      caddieCount: counts.caddieCount,
      golfCartCount: counts.golfCartCount,
      playerDetails: aggregate.players.map((player) => ({
        name: player.name,
        phoneNumber: player.phone_number,
      })),
      pricing: {
        grandTotal: this.toNumber(aggregate.booking.total_amount),
        currency: CURRENCY,
      },
      holdExpiresAt: aggregate.booking.hold_expires_at,
      createdAt: aggregate.booking.created_at,
    };
  }

  async fetchBookingList(mode: ListMode, pagination: { page: number; pageSize: number }) {
    const bookings = await this.getBookingRowsForList();
    const aggregates = await Promise.all(
      bookings.map((booking) => this.buildBookingAggregate(booking)),
    );

    const now = Date.now();
    const filtered = aggregates.filter((aggregate) => {
      if (this.getDisplayStatus(aggregate.booking) === 'expired') {
        return false;
      }

      const slotTime = new Date(aggregate.slot.start_at).getTime();
      return mode === 'upcoming' ? slotTime >= now : slotTime < now;
    });

    const items = filtered
      .sort(
        (left, right) =>
          new Date(left.slot.start_at).getTime() - new Date(right.slot.start_at).getTime(),
      )
      .map((aggregate) => ({
        bookingRef: aggregate.booking.booking_ref,
        status: this.getDisplayStatus(aggregate.booking),
        golfClubName: aggregate.facility?.facility_name ?? aggregate.organization.name,
        bookingDate: this.extractDate(aggregate.slot.start_at),
        teeTimeSlot: this.formatTeeTime(aggregate.slot.start_at),
        grandTotal: this.toNumber(aggregate.booking.total_amount),
        currency: CURRENCY,
      }));

    const startIndex = (pagination.page - 1) * pagination.pageSize;
    return {
      page: pagination.page,
      pageSize: pagination.pageSize,
      total: items.length,
      items: items.slice(startIndex, startIndex + pagination.pageSize),
    };
  }

  async updateBookingDetails(bookingRef: string, updates: UpdateBookingRequest) {
    const aggregate = await this.getBookingAggregateByRef(bookingRef);

    if (updates.hostName && aggregate.booking.user_id) {
      await this.updateAppUser(aggregate.booking.user_id, { name: updates.hostName });
    }

    if (updates.playerDetails) {
      await this.replaceBookingPlayers(
        aggregate.booking.booking_id,
        updates.playerDetails.map((player) => ({
          name: player.name,
          phone_number: this.normalizePhoneNumber(player.phoneNumber),
        })),
      );
    }

    const now = new Date().toISOString();
    await this.updateBookingRow(aggregate.booking.booking_id, { updated_at: now });

    return {
      bookingRef: aggregate.booking.booking_ref,
      status: this.getDisplayStatus(aggregate.booking),
      updatedAt: now,
    };
  }

  async cancelBooking(bookingRef: string, reason: string) {
    const aggregate = await this.getBookingAggregateByRef(bookingRef);
    const oldStatus = this.getDisplayStatus(aggregate.booking);
    const now = new Date().toISOString();

    await this.updateBookingRow(aggregate.booking.booking_id, {
      status: 'cancelled',
      cancelled_at: now,
      cancellation_reason: reason,
      hold_expires_at: null,
      updated_at: now,
    });
    await this.insertBookingStatusHistory(
      aggregate.booking.booking_id,
      oldStatus === 'expired' ? 'held' : oldStatus,
      'cancelled',
    );

    return {
      bookingRef: aggregate.booking.booking_ref,
      status: 'cancelled',
      cancelledAt: now,
    };
  }

  private async getGolfSport() {
    const primary = await this.supabase.client
      .from('sport')
      .select('sport_id, sport_code, sport_name')
      .eq('sport_code', 'golf')
      .maybeSingle<GolfSport>();

    if (primary.error) {
      this.throwSupabaseError(primary.error.message);
    }

    if (primary.data) {
      return primary.data;
    }

    const fallback = await this.supabase.client
      .from('sport')
      .select('sport_id, sport_code, sport_name')
      .ilike('sport_name', '%golf%')
      .maybeSingle<GolfSport>();

    if (fallback.error) {
      this.throwSupabaseError(fallback.error.message);
    }

    if (!fallback.data) {
      throw new NotFoundException('Golf sport configuration not found');
    }

    return fallback.data;
  }

  private async getOrganizationSportsBySportId(sportId: string) {
    const result = await this.supabase.client
      .from('organization_sport')
      .select('organization_sport_id, organization_id, sport_id')
      .eq('sport_id', sportId);

    if (result.error) {
      this.throwSupabaseError(result.error.message);
    }

    return (result.data ?? []) as OrganizationSportRow[];
  }

  private async getOrganizationsByIds(organizationIds: string[]) {
    if (organizationIds.length === 0) {
      return new Map<string, OrganizationRow>();
    }

    const result = await this.supabase.client
      .from('organization')
      .select('organization_id, name, address, slug, created_at')
      .in('organization_id', organizationIds);

    if (result.error) {
      this.throwSupabaseError(result.error.message);
    }

    return new Map(
      ((result.data ?? []) as OrganizationRow[]).map((item) => [
        item.organization_id,
        item,
      ]),
    );
  }

  private async getFacilitiesByOrganizationSportIds(organizationSportIds: string[]) {
    if (organizationSportIds.length === 0) {
      return [];
    }

    const result = await this.supabase.client
      .from('facility')
      .select('facility_id, organization_sport_id, facility_name, capacity, no_of_holes')
      .in('organization_sport_id', organizationSportIds);

    if (result.error) {
      this.throwSupabaseError(result.error.message);
    }

    return (result.data ?? []) as FacilityRow[];
  }

  private async getFacilityForOrganizationSport(
    organizationId: string,
    sportId: string,
  ): Promise<FacilityRow | null> {
    const organizationSport = await this.supabase.client
      .from('organization_sport')
      .select('organization_sport_id, organization_id, sport_id')
      .eq('organization_id', organizationId)
      .eq('sport_id', sportId)
      .maybeSingle<OrganizationSportRow>();

    if (organizationSport.error) {
      this.throwSupabaseError(organizationSport.error.message);
    }

    if (!organizationSport.data) {
      return null;
    }

    const facility = await this.supabase.client
      .from('facility')
      .select('facility_id, organization_sport_id, facility_name, capacity, no_of_holes')
      .eq('organization_sport_id', organizationSport.data.organization_sport_id)
      .limit(1)
      .maybeSingle<FacilityRow>();

    if (facility.error) {
      this.throwSupabaseError(facility.error.message);
    }

    return facility.data;
  }

  private async getClubContextBySlug(golfClubSlug: string): Promise<ClubContext> {
    const sport = await this.getGolfSport();
    const organizationResult = await this.supabase.client
      .from('organization')
      .select('organization_id, name, address, slug, created_at')
      .eq('slug', golfClubSlug)
      .maybeSingle<OrganizationRow>();

    if (organizationResult.error) {
      this.throwSupabaseError(organizationResult.error.message);
    }

    const organization = organizationResult.data;
    if (!organization) {
      throw new NotFoundException(`Golf club not found for slug: ${golfClubSlug}`);
    }

    const organizationSportResult = await this.supabase.client
      .from('organization_sport')
      .select('organization_sport_id, organization_id, sport_id')
      .eq('organization_id', organization.organization_id)
      .eq('sport_id', sport.sport_id)
      .maybeSingle<OrganizationSportRow>();

    if (organizationSportResult.error) {
      this.throwSupabaseError(organizationSportResult.error.message);
    }

    const organizationSport = organizationSportResult.data;
    if (!organizationSport) {
      throw new NotFoundException(`Golf configuration not found for slug: ${golfClubSlug}`);
    }

    const facilityResult = await this.supabase.client
      .from('facility')
      .select('facility_id, organization_sport_id, facility_name, capacity, no_of_holes')
      .eq('organization_sport_id', organizationSport.organization_sport_id)
      .limit(1)
      .maybeSingle<FacilityRow>();

    if (facilityResult.error) {
      this.throwSupabaseError(facilityResult.error.message);
    }

    const facility = facilityResult.data;
    if (!facility) {
      throw new NotFoundException(`Facility not found for slug: ${golfClubSlug}`);
    }

    const resourceCatalog = await this.getResourceCatalog(sport.sport_id);
    const teeInstances = await this.getResourceInstancesByResourceIds(
      organization.organization_id,
      resourceCatalog.byType.tee_time.map((item) => item.resource_id),
    );

    return {
      organization,
      organizationSport,
      facility,
      resourceCatalog,
      teeInstancesById: new Map(
        teeInstances.map((instance) => [instance.resource_instance_id, instance]),
      ),
    };
  }

  private async getResourceCatalog(sportId: string): Promise<ResourceCatalog> {
    const result = await this.supabase.client
      .from('bookable_resource')
      .select('resource_id, sport_id, resource_type, name, is_optional')
      .eq('sport_id', sportId)
      .in('resource_type', ['tee_time', 'caddie', 'golf_cart']);

    if (result.error) {
      this.throwSupabaseError(result.error.message);
    }

    const rows = (result.data ?? []) as BookableResourceRow[];
    return {
      byId: new Map(rows.map((row) => [row.resource_id, row])),
      byType: {
        tee_time: rows.filter((row) => row.resource_type === 'tee_time'),
        caddie: rows.filter((row) => row.resource_type === 'caddie'),
        golf_cart: rows.filter((row) => row.resource_type === 'golf_cart'),
      },
    };
  }

  private async getResourceInstancesByResourceIds(
    organizationId: string,
    resourceIds: string[],
  ) {
    if (resourceIds.length === 0) {
      return [];
    }

    const result = await this.supabase.client
      .from('resource_instance')
      .select('resource_instance_id, resource_id, organization_id, identifier')
      .eq('organization_id', organizationId)
      .in('resource_id', resourceIds);

    if (result.error) {
      this.throwSupabaseError(result.error.message);
    }

    return (result.data ?? []) as ResourceInstanceRow[];
  }

  private async getTeeSlots(clubContext: ClubContext, bookingDate?: string) {
    const teeInstanceIds = [...clubContext.teeInstancesById.keys()];
    if (teeInstanceIds.length === 0) {
      return [];
    }

    const rangeStartIso = bookingDate
      ? this.getDayRange(bookingDate).dayStartIso
      : this.getTodayRange().dayStartIso;
    const rangeEndIso = bookingDate ? this.getDayRange(bookingDate).dayEndIso : undefined;

    let query = this.supabase.client
      .from('resource_slot')
      .select('slot_id, resource_instance_id, start_at, end_at, base_price')
      .in('resource_instance_id', teeInstanceIds)
      .gte('start_at', rangeStartIso)
      .order('start_at', { ascending: true });

    if (rangeEndIso) {
      query = query.lt('start_at', rangeEndIso);
    }

    const result = await query;

    if (result.error) {
      this.throwSupabaseError(result.error.message);
    }

    const overrides = await this.getAvailabilityOverrides(
      clubContext.facility.facility_id,
      rangeStartIso,
      rangeEndIso,
    );

    return ((result.data ?? []) as ResourceSlotRow[]).filter(
      (slot) => !this.isOverridden(slot, overrides),
    );
  }

  private async getAvailabilityOverrides(
    facilityId: string,
    rangeStartIso: string,
    rangeEndIso?: string,
  ) {
    let query = this.supabase.client
      .from('availability_override')
      .select('override_id, facility_id, resource_instance_id, start_at, end_at')
      .eq('facility_id', facilityId)
      .gt('end_at', rangeStartIso);

    if (rangeEndIso) {
      query = query.lt('start_at', rangeEndIso);
    }

    const result = await query;

    if (result.error) {
      this.throwSupabaseError(result.error.message);
    }

    return (result.data ?? []) as AvailabilityOverrideRow[];
  }

  private async getSlotContextById(slotId: string): Promise<SlotContext> {
    const slotResult = await this.supabase.client
      .from('resource_slot')
      .select('slot_id, resource_instance_id, start_at, end_at, base_price')
      .eq('slot_id', slotId)
      .maybeSingle<ResourceSlotRow>();

    if (slotResult.error) {
      this.throwSupabaseError(slotResult.error.message);
    }

    const slot = slotResult.data;
    if (!slot) {
      throw new NotFoundException(`Slot not found for id: ${slotId}`);
    }

    const teeInstanceResult = await this.supabase.client
      .from('resource_instance')
      .select('resource_instance_id, resource_id, organization_id, identifier')
      .eq('resource_instance_id', slot.resource_instance_id)
      .maybeSingle<ResourceInstanceRow>();

    if (teeInstanceResult.error) {
      this.throwSupabaseError(teeInstanceResult.error.message);
    }

    const teeInstance = teeInstanceResult.data;
    if (!teeInstance) {
      throw new NotFoundException(`Resource instance not found for slot: ${slotId}`);
    }

    const sport = await this.getGolfSport();
    const resourceCatalog = await this.getResourceCatalog(sport.sport_id);
    const teeResource = resourceCatalog.byId.get(teeInstance.resource_id);

    if (!teeResource || teeResource.resource_type !== 'tee_time') {
      throw new NotFoundException(`Slot is not a tee time resource: ${slotId}`);
    }

    const organizationResult = await this.supabase.client
      .from('organization')
      .select('organization_id, name, address, slug, created_at')
      .eq('organization_id', teeInstance.organization_id)
      .maybeSingle<OrganizationRow>();

    if (organizationResult.error) {
      this.throwSupabaseError(organizationResult.error.message);
    }

    const organization = organizationResult.data;
    if (!organization) {
      throw new NotFoundException(`Organization not found for slot: ${slotId}`);
    }

    const organizationSportResult = await this.supabase.client
      .from('organization_sport')
      .select('organization_sport_id, organization_id, sport_id')
      .eq('organization_id', organization.organization_id)
      .eq('sport_id', sport.sport_id)
      .maybeSingle<OrganizationSportRow>();

    if (organizationSportResult.error) {
      this.throwSupabaseError(organizationSportResult.error.message);
    }

    const organizationSport = organizationSportResult.data;
    if (!organizationSport) {
      throw new NotFoundException(`Organization sport not found for slot: ${slotId}`);
    }

    const facilityResult = await this.supabase.client
      .from('facility')
      .select('facility_id, organization_sport_id, facility_name, capacity, no_of_holes')
      .eq('organization_sport_id', organizationSport.organization_sport_id)
      .limit(1)
      .maybeSingle<FacilityRow>();

    if (facilityResult.error) {
      this.throwSupabaseError(facilityResult.error.message);
    }

    const facility = facilityResult.data;
    if (!facility) {
      throw new NotFoundException(`Facility not found for slot: ${slotId}`);
    }

    return {
      organization,
      organizationSport,
      facility,
      slot,
      teeResource,
      teeInstance,
      resourceCatalog,
    };
  }

  private async getSlotAvailability(
    slotContext: SlotContext,
    bookingDate = this.extractDate(slotContext.slot.start_at),
  ): Promise<SlotAvailabilitySummary> {
    const { dayStartIso, dayEndIso } = this.getDayRange(bookingDate);
    const overrides = await this.getAvailabilityOverrides(
      slotContext.facility.facility_id,
      dayStartIso,
      dayEndIso,
    );

    if (this.isOverridden(slotContext.slot, overrides)) {
      throw new ConflictException('Selected slot is not available');
    }

    const supportInstances = await this.getResourceInstancesByResourceIds(
      slotContext.organization.organization_id,
      [
        ...slotContext.resourceCatalog.byType.caddie.map((item) => item.resource_id),
        ...slotContext.resourceCatalog.byType.golf_cart.map((item) => item.resource_id),
      ],
    );

    const supportSlots = await this.getSupportResourceSlots(
      supportInstances,
      slotContext.resourceCatalog,
      slotContext.slot.start_at,
      slotContext.slot.end_at,
    );
    const activeBookings = await this.getActiveBookingsForSlotIds([slotContext.slot.slot_id]);
    const lineItems = await this.getBookingLineItemsByBookingIds(
      activeBookings.map((item) => item.booking_id),
    );
    const counts = this.extractCountsFromLineItems(lineItems, slotContext.resourceCatalog);

    return {
      playerCapacity: Math.max(
        0,
        this.toNumber(slotContext.facility.capacity) - counts.playerCount,
      ),
      caddieCapacity: Math.max(
        0,
        this.countUsableCapacity(supportSlots.caddie, overrides) - counts.caddieCount,
      ),
      golfCartCapacity: Math.max(
        0,
        this.countUsableCapacity(supportSlots.golf_cart, overrides) - counts.golfCartCount,
      ),
      teeTimeUnitPrice: this.toNumber(slotContext.slot.base_price),
      caddieUnitPrice: this.pickUnitPrice(
        supportSlots.caddie.map((item) => item.slot.base_price),
      ),
      golfCartUnitPrice: this.pickUnitPrice(
        supportSlots.golf_cart.map((item) => item.slot.base_price),
      ),
    };
  }

  private async getSupportResourceSlots(
    instances: ResourceInstanceRow[],
    resourceCatalog: ResourceCatalog,
    slotStartIso: string,
    slotEndIso: string,
  ) {
    if (instances.length === 0) {
      return {
        caddie: [] as Array<{ slot: ResourceSlotRow; instance: ResourceInstanceRow }>,
        golf_cart: [] as Array<{ slot: ResourceSlotRow; instance: ResourceInstanceRow }>,
      };
    }

    const result = await this.supabase.client
      .from('resource_slot')
      .select('slot_id, resource_instance_id, start_at, end_at, base_price')
      .in(
        'resource_instance_id',
        instances.map((instance) => instance.resource_instance_id),
      )
      .lte('start_at', slotStartIso)
      .gte('end_at', slotEndIso);

    if (result.error) {
      this.throwSupabaseError(result.error.message);
    }

    const instanceById = new Map(
      instances.map((instance) => [instance.resource_instance_id, instance]),
    );

    return ((result.data ?? []) as ResourceSlotRow[]).reduce(
      (accumulator, slot) => {
        const instance = instanceById.get(slot.resource_instance_id);
        if (!instance) {
          return accumulator;
        }

        const resource = resourceCatalog.byId.get(instance.resource_id);
        if (!resource) {
          return accumulator;
        }

        if (resource.resource_type === 'caddie') {
          accumulator.caddie.push({ slot, instance });
        } else if (resource.resource_type === 'golf_cart') {
          accumulator.golf_cart.push({ slot, instance });
        }

        return accumulator;
      },
      {
        caddie: [] as Array<{ slot: ResourceSlotRow; instance: ResourceInstanceRow }>,
        golf_cart: [] as Array<{ slot: ResourceSlotRow; instance: ResourceInstanceRow }>,
      },
    );
  }

  private async getActiveBookingsForSlotIds(slotIds: string[]) {
    if (slotIds.length === 0) {
      return [];
    }

    const result = await this.supabase.client
      .from('booking')
      .select(
        'booking_id, user_id, organization_id, sport_id, status, total_amount, created_at, booking_ref, visitor_id, slot_id, is_phone_verified, booking_source, confirmed_at, cancelled_at, cancellation_reason, updated_at, hold_expires_at',
      )
      .in('slot_id', slotIds)
      .in('status', ['held', 'confirmed']);

    if (result.error) {
      this.throwSupabaseError(result.error.message);
    }

    return ((result.data ?? []) as BookingRow[]).filter(
      (booking) =>
        booking.status === 'confirmed' ||
        (booking.status === 'held' && !this.isHoldExpired(booking)),
    );
  }

  private async getBookingLineItemsByBookingIds(bookingIds: string[]) {
    if (bookingIds.length === 0) {
      return [];
    }

    const result = await this.supabase.client
      .from('booking_line_item')
      .select(
        'booking_line_item_id, booking_id, resource_id, resource_instance_id, slot_id, quantity, unit_price, total_price, metadata',
      )
      .in('booking_id', bookingIds);

    if (result.error) {
      this.throwSupabaseError(result.error.message);
    }

    return (result.data ?? []) as BookingLineItemRow[];
  }

  private extractCountsFromLineItems(
    lineItems: BookingLineItemRow[],
    resourceCatalog: ResourceCatalog,
  ) {
    return lineItems.reduce(
      (totals, lineItem) => {
        const resource = resourceCatalog.byId.get(lineItem.resource_id);
        const quantity = this.toNumber(lineItem.quantity);

        if (!resource) {
          return totals;
        }

        if (resource.resource_type === 'tee_time') {
          totals.playerCount += quantity;
        } else if (resource.resource_type === 'caddie') {
          totals.caddieCount += quantity;
        } else if (resource.resource_type === 'golf_cart') {
          totals.golfCartCount += quantity;
        }

        return totals;
      },
      { playerCount: 0, caddieCount: 0, golfCartCount: 0 },
    );
  }

  private ensureCapacityAvailable(
    request: BookingCounts,
    availability: SlotAvailabilitySummary,
  ) {
    if (request.playerCount > availability.playerCapacity) {
      throw new ConflictException('Selected slot has insufficient player capacity');
    }
    if (request.caddieCount > availability.caddieCapacity) {
      throw new ConflictException('Selected slot has insufficient caddie capacity');
    }
    if (request.golfCartCount > availability.golfCartCapacity) {
      throw new ConflictException('Selected slot has insufficient golf cart capacity');
    }
  }

  private calculatePriceBreakdown(
    availability: SlotAvailabilitySummary,
    request: BookingCounts,
  ) {
    const greenFeeTotal = availability.teeTimeUnitPrice * request.playerCount;
    const caddieTotal = availability.caddieUnitPrice * request.caddieCount;
    const golfCartTotal = availability.golfCartUnitPrice * request.golfCartCount;

    return {
      greenFeePerPerson: availability.teeTimeUnitPrice,
      greenFeeTotal,
      caddieTotal,
      golfCartTotal,
      grandTotal: greenFeeTotal + caddieTotal + golfCartTotal,
      currency: CURRENCY,
    };
  }

  private async getExistingIdempotency(idempotencyKey: string) {
    const result = await this.supabase.client
      .from('booking_idempotency')
      .select('idempotency_key, visitor_id, user_id, booking_id, request_type, created_at')
      .eq('idempotency_key', idempotencyKey)
      .maybeSingle<IdempotencyRow>();

    if (result.error) {
      this.throwSupabaseError(result.error.message);
    }

    return result.data;
  }

  private async findOrCreateAppUser(
    name: string,
    rawPhoneNumber: string,
    normalizedPhoneNumber: string,
  ) {
    const existing = await this.supabase.client
      .from('app_user')
      .select('user_id, name, phone, phone_normalized, is_phone_verified')
      .eq('phone_normalized', normalizedPhoneNumber)
      .maybeSingle<AppUserRow>();

    if (existing.error) {
      this.throwSupabaseError(existing.error.message);
    }

    if (existing.data) {
      return existing.data;
    }

    const now = new Date().toISOString();
    const inserted = await this.supabase.client
      .from('app_user')
      .insert({
        user_id: randomUUID(),
        name,
        phone: rawPhoneNumber,
        phone_normalized: normalizedPhoneNumber,
        is_phone_verified: false,
        created_at: now,
        updated_at: now,
      })
      .select('user_id, name, phone, phone_normalized, is_phone_verified')
      .single<AppUserRow>();

    if (inserted.error) {
      this.throwSupabaseError(inserted.error.message);
    }

    return inserted.data;
  }

  private async resolveVisitorId(deviceId?: string) {
    if (!deviceId) {
      return null;
    }

    const result = await this.supabase.client
      .from('visitors')
      .select('id')
      .eq('id', deviceId)
      .maybeSingle<{ id: string }>();

    if (result.error) {
      this.throwSupabaseError(result.error.message);
    }

    return result.data?.id ?? null;
  }

  private async insertBooking(payload: Record<string, unknown>) {
    const result = await this.supabase.client.from('booking').insert(payload);
    if (result.error) {
      this.throwSupabaseError(result.error.message);
    }
  }

  private async insertBookingLineItems(
    bookingId: string,
    slotContext: SlotContext,
    availability: SlotAvailabilitySummary,
    counts: BookingCounts,
  ) {
    const items: Record<string, unknown>[] = [
      {
        booking_line_item_id: randomUUID(),
        booking_id: bookingId,
        resource_id: slotContext.teeResource.resource_id,
        resource_instance_id: slotContext.teeInstance.resource_instance_id,
        slot_id: slotContext.slot.slot_id,
        quantity: counts.playerCount,
        unit_price: availability.teeTimeUnitPrice,
        total_price: availability.teeTimeUnitPrice * counts.playerCount,
        metadata: { resourceType: 'tee_time' },
      },
    ];

    if (counts.caddieCount > 0 && slotContext.resourceCatalog.byType.caddie[0]) {
      items.push({
        booking_line_item_id: randomUUID(),
        booking_id: bookingId,
        resource_id: slotContext.resourceCatalog.byType.caddie[0].resource_id,
        resource_instance_id: null,
        slot_id: slotContext.slot.slot_id,
        quantity: counts.caddieCount,
        unit_price: availability.caddieUnitPrice,
        total_price: availability.caddieUnitPrice * counts.caddieCount,
        metadata: { resourceType: 'caddie' },
      });
    }

    if (counts.golfCartCount > 0 && slotContext.resourceCatalog.byType.golf_cart[0]) {
      items.push({
        booking_line_item_id: randomUUID(),
        booking_id: bookingId,
        resource_id: slotContext.resourceCatalog.byType.golf_cart[0].resource_id,
        resource_instance_id: null,
        slot_id: slotContext.slot.slot_id,
        quantity: counts.golfCartCount,
        unit_price: availability.golfCartUnitPrice,
        total_price: availability.golfCartUnitPrice * counts.golfCartCount,
        metadata: { resourceType: 'golf_cart' },
      });
    }

    const result = await this.supabase.client.from('booking_line_item').insert(items);
    if (result.error) {
      this.throwSupabaseError(result.error.message);
    }
  }

  private async insertBookingStatusHistory(
    bookingId: string,
    oldStatus: string | null,
    newStatus: string,
  ) {
    const result = await this.supabase.client.from('booking_status_history').insert({
      history_id: randomUUID(),
      booking_id: bookingId,
      old_status: oldStatus,
      new_status: newStatus,
      changed_by: null,
      changed_at: new Date().toISOString(),
    });

    if (result.error) {
      this.throwSupabaseError(result.error.message);
    }
  }

  private async insertBookingIdempotency(
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
      this.throwSupabaseError(result.error.message);
    }
  }

  private async getBookingAggregateByRef(bookingRef: string) {
    const result = await this.supabase.client
      .from('booking')
      .select(
        'booking_id, user_id, organization_id, sport_id, status, total_amount, created_at, booking_ref, visitor_id, slot_id, is_phone_verified, booking_source, confirmed_at, cancelled_at, cancellation_reason, updated_at, hold_expires_at',
      )
      .eq('booking_ref', bookingRef)
      .maybeSingle<BookingRow>();

    if (result.error) {
      this.throwSupabaseError(result.error.message);
    }

    if (!result.data) {
      throw new NotFoundException(`Booking not found for ref: ${bookingRef}`);
    }

    return this.buildBookingAggregate(result.data);
  }

  private async getBookingAggregateById(bookingId: string) {
    const result = await this.supabase.client
      .from('booking')
      .select(
        'booking_id, user_id, organization_id, sport_id, status, total_amount, created_at, booking_ref, visitor_id, slot_id, is_phone_verified, booking_source, confirmed_at, cancelled_at, cancellation_reason, updated_at, hold_expires_at',
      )
      .eq('booking_id', bookingId)
      .maybeSingle<BookingRow>();

    if (result.error) {
      this.throwSupabaseError(result.error.message);
    }

    if (!result.data) {
      throw new NotFoundException(`Booking not found for id: ${bookingId}`);
    }

    return this.buildBookingAggregate(result.data);
  }

  private async buildBookingAggregate(booking: BookingRow): Promise<BookingAggregate> {
    const organizationPromise = this.supabase.client
      .from('organization')
      .select('organization_id, name, address, slug, created_at')
      .eq('organization_id', booking.organization_id)
      .maybeSingle<OrganizationRow>();

    const slotPromise = this.supabase.client
      .from('resource_slot')
      .select('slot_id, resource_instance_id, start_at, end_at, base_price')
      .eq('slot_id', booking.slot_id)
      .maybeSingle<ResourceSlotRow>();

    const hostUserPromise = booking.user_id
      ? this.supabase.client
          .from('app_user')
          .select('user_id, name, phone, phone_normalized, is_phone_verified')
          .eq('user_id', booking.user_id)
          .maybeSingle<AppUserRow>()
      : Promise.resolve({ data: null, error: null } as const);

    const playersPromise = this.supabase.client
      .from('booking_player')
      .select('booking_player_id, booking_id, name, phone_number, category, handicap, created_at')
      .eq('booking_id', booking.booking_id);

    const lineItemsPromise = this.supabase.client
      .from('booking_line_item')
      .select(
        'booking_line_item_id, booking_id, resource_id, resource_instance_id, slot_id, quantity, unit_price, total_price, metadata',
      )
      .eq('booking_id', booking.booking_id);

    const [organizationResult, slotResult, hostUserResult, playersResult, lineItemsResult] =
      await Promise.all([
        organizationPromise,
        slotPromise,
        hostUserPromise,
        playersPromise,
        lineItemsPromise,
      ]);

    if (organizationResult.error) {
      this.throwSupabaseError(organizationResult.error.message);
    }
    if (slotResult.error) {
      this.throwSupabaseError(slotResult.error.message);
    }
    if (hostUserResult.error) {
      this.throwSupabaseError(hostUserResult.error.message);
    }
    if (playersResult.error) {
      this.throwSupabaseError(playersResult.error.message);
    }
    if (lineItemsResult.error) {
      this.throwSupabaseError(lineItemsResult.error.message);
    }

    if (!organizationResult.data || !slotResult.data) {
      throw new NotFoundException(`Booking references incomplete data: ${booking.booking_ref}`);
    }

    return {
      booking,
      organization: organizationResult.data,
      facility: await this.getFacilityForOrganizationSport(
        booking.organization_id,
        booking.sport_id,
      ),
      slot: slotResult.data,
      hostUser: hostUserResult.data,
      players: (playersResult.data ?? []) as BookingPlayerRow[],
      lineItems: (lineItemsResult.data ?? []) as BookingLineItemRow[],
      resourceCatalog: await this.getResourceCatalog(booking.sport_id),
    };
  }

  private async replaceBookingPlayers(
    bookingId: string,
    players: Array<{ name: string; phone_number: string }>,
  ) {
    const deleted = await this.supabase.client
      .from('booking_player')
      .delete()
      .eq('booking_id', bookingId);

    if (deleted.error) {
      this.throwSupabaseError(deleted.error.message);
    }

    if (players.length === 0) {
      return;
    }

    const result = await this.supabase.client.from('booking_player').insert(
      players.map((player) => ({
        booking_player_id: randomUUID(),
        booking_id: bookingId,
        name: player.name,
        phone_number: player.phone_number,
        category: null,
        handicap: null,
        created_at: new Date().toISOString(),
      })),
    );

    if (result.error) {
      this.throwSupabaseError(result.error.message);
    }
  }

  private async updateBookingRow(bookingId: string, patch: Record<string, unknown>) {
    const result = await this.supabase.client
      .from('booking')
      .update(patch)
      .eq('booking_id', bookingId);

    if (result.error) {
      this.throwSupabaseError(result.error.message);
    }
  }

  private async updateAppUser(userId: string, patch: Record<string, unknown>) {
    const result = await this.supabase.client
      .from('app_user')
      .update({
        ...patch,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId);

    if (result.error) {
      this.throwSupabaseError(result.error.message);
    }
  }

  private async getBookingRowsForList() {
    const result = await this.supabase.client
      .from('booking')
      .select(
        'booking_id, user_id, organization_id, sport_id, status, total_amount, created_at, booking_ref, visitor_id, slot_id, is_phone_verified, booking_source, confirmed_at, cancelled_at, cancellation_reason, updated_at, hold_expires_at',
      )
      .order('created_at', { ascending: false });

    if (result.error) {
      this.throwSupabaseError(result.error.message);
    }

    return (result.data ?? []) as BookingRow[];
  }

  private buildHoldResponse(aggregate: BookingAggregate) {
    const counts = this.extractCountsFromLineItems(
      aggregate.lineItems,
      aggregate.resourceCatalog,
    );
    const pricing = this.calculatePricingFromLineItems(
      aggregate.lineItems,
      aggregate.resourceCatalog,
    );

    return {
      bookingId: aggregate.booking.booking_id,
      bookingRef: aggregate.booking.booking_ref,
      status: aggregate.booking.status,
      holdDurationSeconds: HOLD_DURATION_SECONDS,
      holdExpiresAt: aggregate.booking.hold_expires_at,
      isPhoneVerified: aggregate.booking.is_phone_verified ?? false,
      hostUser: {
        userId: aggregate.hostUser?.user_id ?? '',
        name: aggregate.hostUser?.name ?? '',
        phoneNumber:
          aggregate.hostUser?.phone_normalized ?? aggregate.hostUser?.phone ?? '',
      },
      bookingSummary: {
        golfClubName: aggregate.facility?.facility_name ?? aggregate.organization.name,
        golfClubSlug: aggregate.organization.slug,
        bookingDate: this.extractDate(aggregate.slot.start_at),
        teeTimeSlot: this.formatTeeTime(aggregate.slot.start_at),
        playerCount: counts.playerCount,
        caddieCount: counts.caddieCount,
        golfCartCount: counts.golfCartCount,
        priceBreakdown: pricing,
      },
    };
  }

  private calculatePricingFromLineItems(
    lineItems: BookingLineItemRow[],
    resourceCatalog: ResourceCatalog,
  ) {
    let greenFeePerPerson = 0;
    let greenFeeTotal = 0;
    let caddieTotal = 0;
    let golfCartTotal = 0;

    for (const lineItem of lineItems) {
      const resource = resourceCatalog.byId.get(lineItem.resource_id);
      if (!resource) {
        continue;
      }

      const quantity = this.toNumber(lineItem.quantity);
      const unitPrice = this.toNumber(lineItem.unit_price);
      const totalPrice = this.toNumber(lineItem.total_price);

      if (resource.resource_type === 'tee_time') {
        greenFeePerPerson = quantity > 0 ? unitPrice : greenFeePerPerson;
        greenFeeTotal += totalPrice;
      } else if (resource.resource_type === 'caddie') {
        caddieTotal += totalPrice;
      } else if (resource.resource_type === 'golf_cart') {
        golfCartTotal += totalPrice;
      }
    }

    return {
      greenFeePerPerson,
      greenFeeTotal,
      caddieTotal,
      golfCartTotal,
      grandTotal: greenFeeTotal + caddieTotal + golfCartTotal,
      currency: CURRENCY,
    };
  }

  private getDisplayStatus(booking: BookingRow): BookingStatus {
    if (booking.status === 'held' && this.isHoldExpired(booking)) {
      return 'expired';
    }

    return booking.status as BookingStatus;
  }

  private isHoldExpired(booking: BookingRow) {
    return (
      booking.status === 'held' &&
      booking.hold_expires_at !== null &&
      new Date(booking.hold_expires_at).getTime() <= Date.now()
    );
  }

  private normalizePhoneNumber(phoneNumber: string) {
    const trimmed = phoneNumber.trim();
    const digits = trimmed.replace(/[^\d]/g, '');

    if (trimmed.startsWith('+')) {
      return `+${digits}`;
    }

    if (digits.startsWith('60')) {
      return `+${digits}`;
    }

    return digits;
  }

  private generateBookingRef() {
    return `BK-${randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase()}`;
  }

  private getDayRange(bookingDate: string) {
    const start = new Date(`${bookingDate}T00:00:00+08:00`);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);

    return {
      dayStartIso: start.toISOString(),
      dayEndIso: end.toISOString(),
    };
  }

  private getTodayRange() {
    const todayInMalaysia = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kuala_Lumpur',
    }).format(new Date());

    return this.getDayRange(todayInMalaysia);
  }

  private formatTeeTime(isoDateTime: string) {
    return new Intl.DateTimeFormat('en-MY', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
      timeZone: 'Asia/Kuala_Lumpur',
    }).format(new Date(isoDateTime));
  }

  private extractDate(isoDateTime: string) {
    return new Date(isoDateTime).toISOString().slice(0, 10);
  }

  private isOverridden(slot: ResourceSlotRow, overrides: AvailabilityOverrideRow[]) {
    return overrides.some((override) => {
      const overlaps =
        new Date(override.start_at).getTime() < new Date(slot.end_at).getTime() &&
        new Date(override.end_at).getTime() > new Date(slot.start_at).getTime();

      return (
        overlaps &&
        (override.resource_instance_id === null ||
          override.resource_instance_id === slot.resource_instance_id)
      );
    });
  }

  private countUsableCapacity(
    resourceSlots: Array<{ slot: ResourceSlotRow; instance: ResourceInstanceRow }>,
    overrides: AvailabilityOverrideRow[],
  ) {
    return resourceSlots.filter(
      ({ slot, instance }) =>
        !overrides.some((override) => {
          const overlaps =
            new Date(override.start_at).getTime() < new Date(slot.end_at).getTime() &&
            new Date(override.end_at).getTime() > new Date(slot.start_at).getTime();

          return (
            overlaps &&
            (override.resource_instance_id === null ||
              override.resource_instance_id === instance.resource_instance_id)
          );
        }),
    ).length;
  }

  private pickUnitPrice(prices: Array<number | string | null>) {
    return (
      prices.map((value) => this.toNumber(value)).find((value) => value > 0) ?? 0
    );
  }

  private toNumber(value: number | string | null | undefined) {
    if (value === null || value === undefined) {
      return 0;
    }

    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  private throwSupabaseError(message: string): never {
    throw new InternalServerErrorException(message);
  }
}
