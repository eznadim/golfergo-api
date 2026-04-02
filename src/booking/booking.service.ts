import {
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { SupabaseService } from '../supabase/supabase.service';

type SourcePlatform = 'web' | 'ios' | 'android';
type BookingStatus = 'held' | 'confirmed' | 'completed' | 'cancelled' | 'expired';
type ResourceType = 'tee_time' | 'caddie' | 'golf_cart' | 'buggy';
type PlayType = '9_holes' | '18_holes';
type PlayerCategory = 'normal' | 'senior';
type CaddieArrangement = 'none' | 'shared' | 'per_player';
type BuggyType = 'jumbo' | 'normal';
type BuggySharingPreference = 'shared' | 'mixed' | 'single';
type PaymentMethod = 'pay_counter';

type PlayerDetail = {
  name: string;
  phoneNumber: string;
  category: PlayerCategory;
  isHost: boolean;
};

type CreateHoldRequest = {
  slotId: string;
  hostName: string;
  hostPhoneNumber: string;
  source: SourcePlatform;
};

type SubmitBookingRequest = {
  playType: PlayType;
  selectedNine: string | null;
  caddieArrangement: CaddieArrangement;
  buggyType: BuggyType;
  buggySharingPreference?: BuggySharingPreference;
  playerDetails: PlayerDetail[];
};

type UpdateBookingRequest = {
  hostName?: string;
  hostPhoneNumber?: string;
  caddieArrangement?: CaddieArrangement;
  buggyType?: BuggyType;
  buggySharingPreference?: BuggySharingPreference;
  playerDetails?: PlayerDetail[];
};

type BookingCounts = {
  playerCount: number;
  caddieCount: number;
  golfCartCount: number;
};

type BookingConfig = {
  playType: PlayType;
  selectedNine: string | null;
  playerCount: number;
  normalPlayerCount: number;
  seniorPlayerCount: number;
  caddieArrangement: CaddieArrangement;
  buggyType: BuggyType;
  buggySharingPreference: BuggySharingPreference | null;
  paymentMethod: PaymentMethod;
};

type BookingPricing = {
  greenFeeTotal: number;
  buggyEstimatedTotal: number;
  insuranceTotal: number;
  sstTotal: number;
  grandTotal: number;
  currency: string;
  pendingCounterConfirmation: string[];
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
  status: string | null;
  play_type: string | null;
  nine_type: string | null;
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
  play_type: string | null;
  selected_nine: string | null;
  buggy_type: string | null;
  buggy_sharing_preference: string | null;
  caddy_arrangement: string | null;
  payment_method: string | null;
  estimated_total_amount: number | string | null;
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
          supportsNineHoles: this.toNumber(facility.no_of_holes) >= 18,
          supportedNines: this.getSupportedNines(organization.slug),
          buggyPolicy: 'required',
          paymentMethods: ['pay_counter'],
          updatedAt: organization.created_at ?? new Date().toISOString(),
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);
  }

  async fetchAvailableSlots({
    golfClubSlug,
    bookingDate,
    playType,
    selectedNine,
  }: {
    golfClubSlug: string;
    bookingDate: string;
    playType: PlayType;
    selectedNine?: string;
  }) {
    this.assertSelectedNine(playType, selectedNine);
    const clubContext = await this.getClubContextBySlug(golfClubSlug);
    const teeSlots = await this.getTeeSlots(
      clubContext,
      bookingDate,
      playType,
      selectedNine,
    );

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
          currency: CURRENCY,
          fromPrice: availability.teeTimeUnitPrice,
          pricingLabel: `From ${CURRENCY} ${availability.teeTimeUnitPrice} nett`,
          remainingPlayerCapacity: availability.playerCapacity,
          buggyPolicy: 'required',
          isAvailable: availability.playerCapacity > 0,
        };
      }),
    );

    return {
      club: {
        slug: clubContext.organization.slug,
        name: clubContext.facility.facility_name || clubContext.organization.name,
      },
      bookingDate,
      playType,
      selectedNine: playType === '9_holes' ? selectedNine ?? null : null,
      slots: slots.filter((item): item is NonNullable<typeof item> => item !== null),
    };
  }

  async fetchBookingDetails(bookingRef: string) {
    const aggregate = await this.getBookingAggregateByRef(bookingRef);
    const config = this.getReadableBookingConfig(aggregate.booking, aggregate.lineItems);
    const pricing =
      aggregate.lineItems.length > 0
        ? this.calculatePricingFromLineItems(aggregate.lineItems, aggregate.resourceCatalog)
        : {
            greenFeeTotal: 0,
            buggyEstimatedTotal: 0,
            insuranceTotal: 0,
            sstTotal: 0,
            grandTotal: 0,
            currency: CURRENCY,
            pendingCounterConfirmation: [],
          };

    return {
      bookingRef: aggregate.booking.booking_ref,
      status: this.getDisplayStatus(aggregate.booking),
      isPhoneVerified: aggregate.booking.is_phone_verified ?? false,
      golfClubName: aggregate.facility?.facility_name ?? aggregate.organization.name,
      golfClubSlug: aggregate.organization.slug,
      bookingDate: this.extractDate(aggregate.slot.start_at),
      teeTimeSlot: this.formatTeeTime(aggregate.slot.start_at),
      playType: config.playType,
      selectedNine: config.selectedNine,
      hostName: aggregate.hostUser?.name ?? '',
      hostPhoneNumber:
        aggregate.hostUser?.phone_normalized ?? aggregate.hostUser?.phone ?? '',
      playerCount: config.playerCount,
      normalPlayerCount: config.normalPlayerCount,
      seniorPlayerCount: config.seniorPlayerCount,
      caddieArrangement: config.caddieArrangement,
      buggyType: config.buggyType,
      buggySharingPreference: config.buggySharingPreference,
      paymentMethod: config.paymentMethod,
      playerDetails: aggregate.players.map((player) => ({
        name: player.name,
        phoneNumber: player.phone_number,
        category: player.category === 'senior' ? 'senior' : 'normal',
        isHost:
          (aggregate.hostUser?.phone_normalized ?? aggregate.hostUser?.phone ?? '') ===
          player.phone_number,
      })),
      pricing,
      holdExpiresAt: aggregate.booking.hold_expires_at,
      createdAt: aggregate.booking.created_at,
      updatedAt: aggregate.booking.updated_at,
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
      .in('resource_type', ['tee_time', 'caddie', 'golf_cart', 'buggy']);

    if (result.error) {
      this.throwSupabaseError(result.error.message);
    }

    const rows = (result.data ?? []) as BookableResourceRow[];
    return {
      byId: new Map(rows.map((row) => [row.resource_id, row])),
      byType: {
        tee_time: rows.filter((row) => row.resource_type === 'tee_time'),
        caddie: rows.filter((row) => row.resource_type === 'caddie'),
        buggy: rows.filter((row) => row.resource_type === 'buggy'),
        golf_cart: rows.filter(
          (row) => row.resource_type === 'golf_cart' || row.resource_type === 'buggy',
        ),
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
      .select(
        'resource_instance_id, resource_id, organization_id, identifier, status, play_type, nine_type',
      )
      .eq('organization_id', organizationId)
      .eq('status', 'active')
      .in('resource_id', resourceIds);

    if (result.error) {
      this.throwSupabaseError(result.error.message);
    }

    return (result.data ?? []) as ResourceInstanceRow[];
  }

  private async getTeeSlots(
    clubContext: ClubContext,
    bookingDate?: string,
    playType?: PlayType,
    selectedNine?: string,
  ) {
    const teeInstanceIds = [...clubContext.teeInstancesById.values()]
      .filter((instance) => {
        if (!playType) {
          return true;
        }

        const instancePlayType = this.getInstancePlayType(instance);
        if (instancePlayType && instancePlayType !== playType) {
          return false;
        }

        if (playType === '9_holes' && selectedNine) {
          const instanceNine = this.getInstanceSelectedNine(instance);
          if (instanceNine && instanceNine !== selectedNine) {
            return false;
          }
        }

        return true;
      })
      .map((instance) => instance.resource_instance_id);

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

  async getSlotContextById(slotId: string): Promise<SlotContext> {
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
      .select(
        'resource_instance_id, resource_id, organization_id, identifier, status, play_type, nine_type',
      )
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

  async getSlotAvailability(
    slotContext: SlotContext,
    bookingDate = this.extractDate(slotContext.slot.start_at),
    excludedBookingId?: string,
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
    const activeBookings = await this.getActiveBookingsForSlotIds(
      [slotContext.slot.slot_id],
      excludedBookingId,
    );
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
        this.getSupportResourceCapacity(
          supportInstances,
          supportSlots.caddie,
          overrides,
          slotContext.resourceCatalog,
          'caddie',
        ) - counts.caddieCount,
      ),
      golfCartCapacity: Math.max(
        0,
        this.getSupportResourceCapacity(
          supportInstances,
          supportSlots.golf_cart,
          overrides,
          slotContext.resourceCatalog,
          'golf_cart',
        ) - counts.golfCartCount,
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
        } else if (
          resource.resource_type === 'golf_cart' ||
          resource.resource_type === 'buggy'
        ) {
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

  private getSupportResourceCapacity(
    instances: ResourceInstanceRow[],
    resourceSlots: Array<{ slot: ResourceSlotRow; instance: ResourceInstanceRow }>,
    overrides: AvailabilityOverrideRow[],
    resourceCatalog: ResourceCatalog,
    resourceType: 'caddie' | 'golf_cart',
  ) {
    if (resourceSlots.length > 0) {
      return this.countUsableCapacity(resourceSlots, overrides);
    }

    return instances.filter((instance) => {
      const resource = resourceCatalog.byId.get(instance.resource_id);
      if (!resource) {
        return false;
      }

      if (resourceType === 'caddie') {
        return resource.resource_type === 'caddie';
      }

      return (
        resource.resource_type === 'golf_cart' || resource.resource_type === 'buggy'
      );
    }).length;
  }

  private async getActiveBookingsForSlotIds(
    slotIds: string[],
    excludedBookingId?: string,
  ) {
    if (slotIds.length === 0) {
      return [];
    }

    const result = await this.supabase.client
      .from('booking')
      .select(
        'booking_id, user_id, organization_id, sport_id, status, total_amount, created_at, booking_ref, visitor_id, slot_id, is_phone_verified, booking_source, confirmed_at, cancelled_at, cancellation_reason, updated_at, hold_expires_at, play_type, selected_nine, buggy_type, buggy_sharing_preference, caddy_arrangement, payment_method, estimated_total_amount',
      )
      .in('slot_id', slotIds)
      .in('status', ['held', 'confirmed']);

    if (result.error) {
      this.throwSupabaseError(result.error.message);
    }

    return ((result.data ?? []) as BookingRow[])
      .filter((booking) => booking.booking_id !== excludedBookingId)
      .filter(
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
        } else if (
          resource.resource_type === 'golf_cart' ||
          resource.resource_type === 'buggy'
        ) {
          totals.golfCartCount += quantity;
        }

        return totals;
      },
      { playerCount: 0, caddieCount: 0, golfCartCount: 0 },
    );
  }

  ensureCapacityAvailable(
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

  ensureSlotCanBeHeld(availability: SlotAvailabilitySummary) {
    if (availability.playerCapacity <= 0) {
      throw new ConflictException('Selected slot is fully booked');
    }
  }

  async findOrCreateAppUser(
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

  async getAppUserById(userId: string) {
    const result = await this.supabase.client
      .from('app_user')
      .select('user_id, name, phone, phone_normalized, is_phone_verified')
      .eq('user_id', userId)
      .maybeSingle<AppUserRow>();

    if (result.error) {
      this.throwSupabaseError(result.error.message);
    }

    if (!result.data) {
      throw new NotFoundException('App user not found');
    }

    return result.data;
  }

  assertBookingOwnedByUser(booking: BookingRow, userId: string) {
    if (booking.user_id !== userId) {
      throw new ForbiddenException('You do not have access to this booking');
    }
  }

  async resolveVisitorId(deviceId?: string) {
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

  async insertBooking(payload: Record<string, unknown>) {
    const result = await this.supabase.client.from('booking').insert(payload);
    if (result.error) {
      this.throwSupabaseError(result.error.message);
    }
  }

  async insertBookingLineItems(
    bookingId: string,
    slotContext: SlotContext,
    availability: SlotAvailabilitySummary,
    counts: BookingCounts,
    bookingConfig: BookingConfig,
    pricing: BookingPricing,
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
        metadata: {
          resourceType: 'tee_time',
          bookingConfig,
          pricing,
        },
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

  async replaceBookingLineItems(
    bookingId: string,
    slotContext: SlotContext,
    availability: SlotAvailabilitySummary,
    counts: BookingCounts,
    bookingConfig: BookingConfig,
    pricing: BookingPricing,
  ) {
    const deleted = await this.supabase.client
      .from('booking_line_item')
      .delete()
      .eq('booking_id', bookingId);

    if (deleted.error) {
      this.throwSupabaseError(deleted.error.message);
    }

    await this.insertBookingLineItems(
      bookingId,
      slotContext,
      availability,
      counts,
      bookingConfig,
      pricing,
    );
  }

  async insertBookingStatusHistory(
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

  async getBookingAggregateByRef(bookingRef: string) {
    const result = await this.supabase.client
      .from('booking')
      .select(
        'booking_id, user_id, organization_id, sport_id, status, total_amount, created_at, booking_ref, visitor_id, slot_id, is_phone_verified, booking_source, confirmed_at, cancelled_at, cancellation_reason, updated_at, hold_expires_at, play_type, selected_nine, buggy_type, buggy_sharing_preference, caddy_arrangement, payment_method, estimated_total_amount',
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

  async getBookingAggregateById(bookingId: string) {
    const result = await this.supabase.client
      .from('booking')
      .select(
        'booking_id, user_id, organization_id, sport_id, status, total_amount, created_at, booking_ref, visitor_id, slot_id, is_phone_verified, booking_source, confirmed_at, cancelled_at, cancellation_reason, updated_at, hold_expires_at, play_type, selected_nine, buggy_type, buggy_sharing_preference, caddy_arrangement, payment_method, estimated_total_amount',
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

  async buildBookingAggregate(booking: BookingRow): Promise<BookingAggregate> {
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

  async replaceBookingPlayers(
    bookingId: string,
    players: Array<{ name: string; phone_number: string; category: PlayerCategory }>,
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
        category: player.category,
        handicap: null,
        created_at: new Date().toISOString(),
      })),
    );

    if (result.error) {
      this.throwSupabaseError(result.error.message);
    }
  }

  async updateBookingRow(bookingId: string, patch: Record<string, unknown>) {
    const result = await this.supabase.client
      .from('booking')
      .update(patch)
      .eq('booking_id', bookingId);

    if (result.error) {
      this.throwSupabaseError(result.error.message);
    }
  }

  async updateAppUser(userId: string, patch: Record<string, unknown>) {
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

  async getBookingRowsForList() {
    const result = await this.supabase.client
      .from('booking')
      .select(
        'booking_id, user_id, organization_id, sport_id, status, total_amount, created_at, booking_ref, visitor_id, slot_id, is_phone_verified, booking_source, confirmed_at, cancelled_at, cancellation_reason, updated_at, hold_expires_at, play_type, selected_nine, buggy_type, buggy_sharing_preference, caddy_arrangement, payment_method, estimated_total_amount',
      )
      .order('created_at', { ascending: false });

    if (result.error) {
      this.throwSupabaseError(result.error.message);
    }

    return (result.data ?? []) as BookingRow[];
  }

  async getBookingRowsForUser(userId: string) {
    const result = await this.supabase.client
      .from('booking')
      .select(
        'booking_id, user_id, organization_id, sport_id, status, total_amount, created_at, booking_ref, visitor_id, slot_id, is_phone_verified, booking_source, confirmed_at, cancelled_at, cancellation_reason, updated_at, hold_expires_at, play_type, selected_nine, buggy_type, buggy_sharing_preference, caddy_arrangement, payment_method, estimated_total_amount',
      )
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (result.error) {
      this.throwSupabaseError(result.error.message);
    }

    return (result.data ?? []) as BookingRow[];
  }

  buildHoldResponse(aggregate: BookingAggregate) {
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
        playType:
          aggregate.booking.play_type === '9_holes' ? '9_holes' : '18_holes',
        selectedNine: aggregate.booking.selected_nine,
      },
    };
  }

  getReadableBookingConfig(
    booking: BookingRow,
    lineItems: BookingLineItemRow[],
  ): BookingConfig {
    if (lineItems.length > 0) {
      return this.extractBookingConfig(lineItems);
    }

    return {
      playType: booking.play_type === '9_holes' ? '9_holes' : '18_holes',
      selectedNine: booking.selected_nine,
      playerCount: 0,
      normalPlayerCount: 0,
      seniorPlayerCount: 0,
      caddieArrangement:
        booking.caddy_arrangement === 'shared' || booking.caddy_arrangement === 'per_player'
          ? booking.caddy_arrangement
          : 'none',
      buggyType: booking.buggy_type === 'jumbo' ? 'jumbo' : 'normal',
      buggySharingPreference:
        booking.buggy_sharing_preference === 'shared' ||
        booking.buggy_sharing_preference === 'mixed' ||
        booking.buggy_sharing_preference === 'single'
          ? booking.buggy_sharing_preference
          : null,
      paymentMethod: 'pay_counter',
    };
  }

  calculatePricingFromLineItems(
    lineItems: BookingLineItemRow[],
    resourceCatalog: ResourceCatalog,
  ): BookingPricing {
    const storedPricing = this.extractStoredPricing(lineItems);
    if (storedPricing) {
      return storedPricing;
    }

    let greenFeeTotal = 0;
    let buggyEstimatedTotal = 0;

    for (const lineItem of lineItems) {
      const resource = resourceCatalog.byId.get(lineItem.resource_id);
      if (!resource) {
        continue;
      }

      const quantity = this.toNumber(lineItem.quantity);
      const unitPrice = this.toNumber(lineItem.unit_price);
      const totalPrice = this.toNumber(lineItem.total_price);

      if (resource.resource_type === 'tee_time') {
        greenFeeTotal += totalPrice;
      } else if (resource.resource_type === 'golf_cart') {
        buggyEstimatedTotal += totalPrice;
      }
    }

    const insuranceTotal = this.calculateInsuranceTotal(
      this.extractBookingConfig(lineItems).playerCount,
    );
    const sstTotal = this.calculateSstTotal(greenFeeTotal);

    return {
      greenFeeTotal,
      buggyEstimatedTotal,
      insuranceTotal,
      sstTotal,
      grandTotal: greenFeeTotal + buggyEstimatedTotal + insuranceTotal + sstTotal,
      currency: CURRENCY,
      pendingCounterConfirmation:
        this.extractBookingConfig(lineItems).caddieArrangement === 'none' ? [] : ['caddie'],
    };
  }

  getSlotPlayType(
    teeInstance: ResourceInstanceRow,
    slot: ResourceSlotRow,
  ): PlayType {
    if (teeInstance.play_type === '9_holes' || teeInstance.play_type === '18_holes') {
      return teeInstance.play_type;
    }

    const inferredPlayType = this.getInstancePlayType(teeInstance);
    if (inferredPlayType) {
      return inferredPlayType;
    }

    if (teeInstance.nine_type) {
      return '9_holes';
    }

    const slotStart = new Date(slot.start_at);
    const malaysiaTime = new Intl.DateTimeFormat('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: 'Asia/Kuala_Lumpur',
    }).format(slotStart);
    const [hour, minute] = malaysiaTime.split(':').map(Number);
    const minutesSinceMidnight = hour * 60 + minute;

    // Morning slots are treated as 18 holes; all later slots are 9 holes.
    if (minutesSinceMidnight >= 7 * 60 && minutesSinceMidnight <= 9 * 60 + 15) {
      return '18_holes';
    }

    return '9_holes';
  }

  getSlotSelectedNine(
    teeInstance: ResourceInstanceRow,
    slot: ResourceSlotRow,
  ): string | null {
    const playType = this.getSlotPlayType(teeInstance, slot);
    if (playType === '18_holes') {
      return null;
    }

    const inferredNine = this.getInstanceSelectedNine(teeInstance);
    if (inferredNine) {
      return inferredNine;
    }

    if (!teeInstance.nine_type) {
      throw new ConflictException('9-hole slot is missing selected nine configuration');
    }

    return teeInstance.nine_type;
  }

  private getInstancePlayType(teeInstance: ResourceInstanceRow): PlayType | null {
    if (teeInstance.play_type === '9_holes' || teeInstance.play_type === '18_holes') {
      return teeInstance.play_type;
    }

    const identifier = teeInstance.identifier?.toLowerCase() ?? '';
    if (!identifier) {
      return null;
    }

    if (identifier.includes('_18_') || identifier.includes('18_main')) {
      return '18_holes';
    }

    if (
      identifier.includes('_9_') ||
      identifier.includes('9_damai') ||
      identifier.includes('9_sutera')
    ) {
      return '9_holes';
    }

    return null;
  }

  private getInstanceSelectedNine(teeInstance: ResourceInstanceRow): string | null {
    if (teeInstance.nine_type) {
      return teeInstance.nine_type;
    }

    const identifier = teeInstance.identifier?.toLowerCase() ?? '';
    if (identifier.includes('damai')) {
      return 'damai';
    }
    if (identifier.includes('sutera')) {
      return 'sutera';
    }

    return null;
  }

  private assertSelectedNine(playType: PlayType, selectedNine?: string | null) {
    if (playType === '9_holes' && !selectedNine) {
      throw new ConflictException('selectedNine is required for 9_holes play type');
    }
  }

  buildBookingConfigFromSubmit(request: SubmitBookingRequest): BookingConfig {
    this.assertSelectedNine(request.playType, request.selectedNine);

    const playerCount = request.playerDetails.length;
    const normalPlayerCount = request.playerDetails.filter(
      (player) => player.category === 'normal',
    ).length;
    const seniorPlayerCount = request.playerDetails.filter(
      (player) => player.category === 'senior',
    ).length;

    if (playerCount !== normalPlayerCount + seniorPlayerCount) {
      throw new ConflictException('Player category totals must match playerDetails');
    }

    if (request.playerDetails.filter((player) => player.isHost).length !== 1) {
      throw new ConflictException('Exactly one player must be marked as the host');
    }

    if (request.buggyType === 'normal' && !request.buggySharingPreference) {
      throw new ConflictException(
        'Buggy sharing preference is required when buggyType is normal',
      );
    }

    return {
      playType: request.playType,
      selectedNine: request.selectedNine,
      playerCount,
      normalPlayerCount,
      seniorPlayerCount,
      caddieArrangement: request.caddieArrangement,
      buggyType: request.buggyType,
      buggySharingPreference:
        request.buggyType === 'jumbo' ? null : request.buggySharingPreference ?? 'shared',
      paymentMethod: 'pay_counter',
    };
  }

  getRequestedBookingCounts(config: BookingConfig) {
    return {
      playerCount: config.playerCount,
      caddieCount:
        config.caddieArrangement === 'per_player'
          ? config.playerCount
          : config.caddieArrangement === 'shared'
            ? 1
            : 0,
      golfCartCount:
        config.buggyType === 'jumbo'
          ? Math.ceil(config.playerCount / 6)
          : config.buggySharingPreference === 'single'
            ? config.playerCount
            : Math.ceil(config.playerCount / 2),
    };
  }

  calculateBookingPricing(
    availability: SlotAvailabilitySummary,
    config: BookingConfig,
    counts: BookingCounts,
  ): BookingPricing {
    const greenFeeTotal = availability.teeTimeUnitPrice * config.playerCount;
    const buggyEstimatedTotal = availability.golfCartUnitPrice * counts.golfCartCount;
    const insuranceTotal = this.calculateInsuranceTotal(config.playerCount);
    const sstTotal = this.calculateSstTotal(greenFeeTotal);

    return {
      greenFeeTotal,
      buggyEstimatedTotal,
      insuranceTotal,
      sstTotal,
      grandTotal: greenFeeTotal + buggyEstimatedTotal + insuranceTotal + sstTotal,
      currency: CURRENCY,
      pendingCounterConfirmation: config.caddieArrangement === 'none' ? [] : ['caddie'],
    };
  }

  private calculateInsuranceTotal(playerCount: number) {
    return playerCount * 3;
  }

  private calculateSstTotal(greenFeeTotal: number) {
    return Math.round(greenFeeTotal * 0.06);
  }

  extractBookingConfig(lineItems: BookingLineItemRow[]): BookingConfig {
    const teeLineItem = lineItems.find(
      (lineItem) => lineItem.metadata?.resourceType === 'tee_time',
    );
    const metadata = teeLineItem?.metadata?.bookingConfig as Partial<BookingConfig> | undefined;
    const playerCount = this.toNumber(teeLineItem?.quantity ?? 0);

    return {
      playType: metadata?.playType === '9_holes' ? '9_holes' : '18_holes',
      selectedNine: metadata?.selectedNine ?? null,
      playerCount: metadata?.playerCount ?? playerCount,
      normalPlayerCount: metadata?.normalPlayerCount ?? playerCount,
      seniorPlayerCount: metadata?.seniorPlayerCount ?? 0,
      caddieArrangement: metadata?.caddieArrangement ?? 'none',
      buggyType: metadata?.buggyType ?? 'normal',
      buggySharingPreference: metadata?.buggySharingPreference ?? 'shared',
      paymentMethod: metadata?.paymentMethod ?? 'pay_counter',
    };
  }

  private extractStoredPricing(lineItems: BookingLineItemRow[]): BookingPricing | null {
    const teeLineItem = lineItems.find(
      (lineItem) => lineItem.metadata?.resourceType === 'tee_time',
    );
    const pricing = teeLineItem?.metadata?.pricing as BookingPricing | undefined;
    return pricing ?? null;
  }

  async updateBookingConfig(
    bookingId: string,
    currentConfig: BookingConfig,
    updates: UpdateBookingRequest,
  ) {
    const nextConfig: BookingConfig = {
      ...currentConfig,
      caddieArrangement: updates.caddieArrangement ?? currentConfig.caddieArrangement,
      buggyType: updates.buggyType ?? currentConfig.buggyType,
      buggySharingPreference:
        updates.buggyType === 'jumbo'
          ? null
          : updates.buggySharingPreference ?? currentConfig.buggySharingPreference,
    };

    const result = await this.supabase.client
      .from('booking_line_item')
      .select(
        'booking_line_item_id, booking_id, resource_id, resource_instance_id, slot_id, quantity, unit_price, total_price, metadata',
      )
      .eq('booking_id', bookingId);

    if (result.error) {
      this.throwSupabaseError(result.error.message);
    }

    const teeLineItem = ((result.data ?? []) as BookingLineItemRow[]).find(
      (lineItem) => lineItem.metadata?.resourceType === 'tee_time',
    );

    if (!teeLineItem) {
      return;
    }

    const updatedMetadata = {
      ...(teeLineItem.metadata ?? {}),
      bookingConfig: nextConfig,
    };

    const updateResult = await this.supabase.client
      .from('booking_line_item')
      .update({ metadata: updatedMetadata })
      .eq('booking_line_item_id', teeLineItem.booking_line_item_id);

    if (updateResult.error) {
      this.throwSupabaseError(updateResult.error.message);
    }
  }

  getDisplayStatus(booking: BookingRow): BookingStatus {
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

  generateBookingRef() {
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

  formatTeeTime(isoDateTime: string) {
    return new Intl.DateTimeFormat('en-MY', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
      timeZone: 'Asia/Kuala_Lumpur',
    }).format(new Date(isoDateTime));
  }

  extractDate(isoDateTime: string) {
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

  toNumber(value: number | string | null | undefined) {
    if (value === null || value === undefined) {
      return 0;
    }

    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  private getSupportedNines(clubSlug: string) {
    const supportedNinesByClub: Record<string, string[]> = {
      'kinrara-golf-club': ['damai', 'sutera'],
    };

    return supportedNinesByClub[clubSlug] ?? ['front-nine', 'back-nine'];
  }

  private throwSupabaseError(message: string): never {
    throw new InternalServerErrorException(message);
  }
}
