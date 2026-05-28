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
type BookingStatus =
  | 'hold'
  | 'held'
  | 'pending_payment'
  | 'confirmed'
  | 'completed'
  | 'cancelled'
  | 'expired';
type ResourceType = 'tee_time' | 'caddie' | 'golf_cart' | 'buggy';
type PlayType = '9_holes' | '18_holes';
type PlayerCategory = 'adult' | 'normal' | 'senior' | 'junior';
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
  selectedNine?: string | null;
  caddieArrangement: CaddieArrangement;
  buggyType?: BuggyType;
  buggyQuantity?: number;
  buggySharingPreference?: BuggySharingPreference;
  playerDetails: PlayerDetail[];
};

type UpdateBookingRequest = {
  hostName?: string;
  hostPhoneNumber?: string;
  caddieArrangement?: CaddieArrangement;
  buggyType?: BuggyType;
  buggyQuantity?: number;
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
  buggyQuantity: number;
  singleRiderCount: number;
  buggySharingPreference: BuggySharingPreference | null;
  paymentMethod: PaymentMethod;
};

type BookingPricing = {
  greenFeeTotal: number;
  caddieTotal: number;
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
  email: string | null;
  address: string | null;
  slug: string;
  latitude: number | string | null;
  longitude: number | string | null;
  created_at: string | null;
};

type OrganizationMediaRow = {
  organization_media_id: string;
  organization_id: string;
  media_type: string;
  bucket_id: string;
  object_path: string;
  alt_text: string | null;
  caption: string | null;
  sort_order: number | string | null;
  is_primary: boolean | null;
  is_active: boolean | null;
  created_at: string | null;
  updated_at: string | null;
};

type GolfClubImage = {
  url: string;
  path: string;
  altText: string;
  caption?: string | null;
  sortOrder?: number;
};

type GolfClubImages = {
  logo: GolfClubImage | null;
  cover: GolfClubImage | null;
  thumbnail: GolfClubImage | null;
  gallery: GolfClubImage[];
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
  min_players: number | string | null;
  max_players: number | string | null;
  base_price: number | string | null;
  senior_junior_price: number | string | null;
  unit_price: number | string | null;
  pricing_category: string | null;
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
  subtotal_amount: number | string | null;
  discount_amount: number | string | null;
  voucher_id: string | null;
  voucher_code: string | null;
  final_amount: number | string | null;
  pricing_snapshot: PricingSnapshot | null;
};

type PricingSnapshot = {
  slot: {
    slotId: string;
    resourceInstanceId: string;
    identifier: string | null;
    playType: string | null;
    pricingCategory: string | null;
    startAt: string;
    endAt: string;
  };
  rules: {
    minPlayers: number;
    maxPlayers: number;
  };
  prices: {
    basePrice: number;
    seniorJuniorPrice: number;
    caddyFee: number;
  };
  calculation?: {
    adultPlayers: number;
    seniorJuniorPlayers: number;
    caddyQuantity: number;
    greenFeeTotal: number;
    caddyTotal: number;
    estimatedTotal: number;
  };
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
  publishedRateUnitPrice: number;
  teeTimeUnitPrice: number;
  seniorJuniorUnitPrice: number;
  caddieUnitPrice: number;
  golfCartUnitPrice: number;
  activeBookingCount: number;
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

type GolfClubListItem = {
  id: string;
  slug: string;
  name: string;
  address: string;
  email: string | null;
  isBookable: boolean;
  availabilityLabel: string;
  latitude: number | null;
  longitude: number | null;
  noOfHoles: number;
  buggyPolicy: 'required';
  paymentMethods: Array<'pay_counter'>;
  images: GolfClubImages;
  updatedAt: string;
};

const HOLD_DURATION_SECONDS = 300;
const CURRENCY = 'MYR';
const BUGGY_FEE_PER_PLAYER = 40;
const BUGGY_SINGLE_RIDER_SURCHARGE = 43.2;
const INSURANCE_FEE_PER_PLAYER = 5;
const SST_RATE = 0.08;

@Injectable()
export class BookingService {
  constructor(private readonly supabase: SupabaseService) {}

  async fetchGolfClubList() {
    const sport = await this.getGolfSport();
    const organizations = await this.getGolfOrganizations();
    const organizationSports = await this.getOrganizationSportsBySportId(
      sport.sport_id,
    );
    const facilities = await this.getFacilitiesByOrganizationSportIds(
      organizationSports.map((item) => item.organization_sport_id),
    );
    const mediaByOrganizationId = await this.getOrganizationMediaByIds(
      organizations.map((item) => item.organization_id),
    );
    const organizationSportByOrganizationId = new Map(
      organizationSports.map((item) => [item.organization_id, item]),
    );
    const facilityByOrganizationSportId = new Map(
      facilities.map((item) => [item.organization_sport_id, item]),
    );

    return organizations.map((organization) => {
      const organizationSport = organizationSportByOrganizationId.get(
        organization.organization_id,
      );
      const facility = organizationSport
        ? (facilityByOrganizationSportId.get(
            organizationSport.organization_sport_id,
          ) ?? null)
        : null;

      return this.buildGolfClubSummaryFromRows(
        organization,
        organizationSport ?? null,
        facility,
        mediaByOrganizationId.get(organization.organization_id) ?? [],
      );
    });
  }

  async fetchGolfClubDetails(golfClubSlug: string) {
    const sport = await this.getGolfSport();
    const organization = await this.getOrganizationBySlug(golfClubSlug);
    const organizationSport = await this.getOrganizationSportForOrganization(
      organization.organization_id,
      sport.sport_id,
    );
    const facility = organizationSport
      ? await this.getFacilityByOrganizationSportId(
          organizationSport.organization_sport_id,
        )
      : null;
    const mediaRows = await this.getOrganizationMediaByOrganizationId(
      organization.organization_id,
    );
    const club = this.buildGolfClubSummaryFromRows(
      organization,
      organizationSport,
      facility,
      mediaRows,
    );

    let nextAvailableSlot: Awaited<
      ReturnType<BookingService['getNextAvailableSlotForClub']>
    > = null;

    if (organizationSport && facility) {
      const resourceCatalog = await this.getResourceCatalog(sport.sport_id);
      const teeInstances = await this.getResourceInstancesByResourceIds(
        organization.organization_id,
        resourceCatalog.byType.tee_time.map((item) => item.resource_id),
      );

      nextAvailableSlot = await this.getNextAvailableSlotForClub({
        organization,
        organizationSport,
        facility,
        resourceCatalog,
        teeInstancesById: new Map(
          teeInstances.map((instance) => [
            instance.resource_instance_id,
            instance,
          ]),
        ),
      });
    }

    return {
      club: {
        ...club,
        organizationId: organization.organization_id,
        organizationSportId: organizationSport?.organization_sport_id ?? null,
        facilityId: facility?.facility_id ?? null,
        facilityCapacity: this.toNumber(facility?.capacity),
      },
      bookingConfig: {
        supportedPlayTypes: ['18_holes'],
        buggyPolicy: club.buggyPolicy,
        paymentMethods: club.paymentMethods,
      },
      todayQuickBookPreview: {
        bookingDate: this.getTodayDateInMalaysia(),
        nextSlot: nextAvailableSlot,
      },
    };
  }

  async fetchQuickBook({
    golfClubSlug,
    latitude,
    longitude,
    maxResults = 3,
    searchDays = 2,
  }: {
    golfClubSlug?: string;
    latitude?: number;
    longitude?: number;
    maxResults?: number;
    searchDays?: number;
  }) {
    const clubs = golfClubSlug
      ? [await this.getClubContextBySlug(golfClubSlug)]
      : (await this.getAllClubContexts()).filter((clubContext) =>
          this.isBookableClub(clubContext.organization.slug),
        );

    const recommendations = (
      await Promise.all(
        clubs.map(async (clubContext) => {
          const nextSlot = await this.getNextAvailableSlotForClub(
            clubContext,
            searchDays,
          );
          if (!nextSlot) {
            return null;
          }

          const club = this.buildGolfClubSummary(clubContext);

          return {
            club,
            distanceInKm: this.calculateDistanceInKm(
              latitude,
              longitude,
              club.latitude,
              club.longitude,
            ),
            nextSlot,
          };
        }),
      )
    )
      .filter((item): item is NonNullable<typeof item> => item !== null)
      .sort((left, right) => {
        const leftDistance = left.distanceInKm ?? Number.POSITIVE_INFINITY;
        const rightDistance = right.distanceInKm ?? Number.POSITIVE_INFINITY;

        if (
          latitude !== undefined &&
          longitude !== undefined &&
          leftDistance !== rightDistance
        ) {
          return leftDistance - rightDistance;
        }

        return (
          new Date(left.nextSlot.startAt).getTime() -
          new Date(right.nextSlot.startAt).getTime()
        );
      })
      .slice(0, maxResults);

    return {
      bookingDate: this.getDateInMalaysia(),
      ranking: {
        requestedCoordinates:
          latitude !== undefined && longitude !== undefined
            ? { latitude, longitude }
            : null,
        strategy:
          latitude !== undefined && longitude !== undefined
            ? 'nearest_club_then_next_time_slot'
            : 'next_time_slot_across_days',
        locationRankingApplied:
          latitude !== undefined &&
          longitude !== undefined &&
          recommendations.some((item) => item.distanceInKm !== null),
      },
      searchWindow: {
        startDate: this.getDateInMalaysia(),
        searchDays,
      },
      recommendation: recommendations[0] ?? null,
      alternatives: recommendations.slice(1),
    };
  }

  async fetchAvailableSlots({
    golfClubSlug,
    bookingDate,
    playType,
  }: {
    golfClubSlug: string;
    bookingDate: string;
    playType: PlayType;
    selectedNine?: string;
  }) {
    const clubContext = await this.getClubContextBySlug(golfClubSlug);
    const teeSlots = await this.getTeeSlots(clubContext, bookingDate, playType);

    const slots = await Promise.all(
      teeSlots.map(async (slot) => {
        const teeInstance = clubContext.teeInstancesById.get(
          slot.resource_instance_id,
        );
        if (!teeInstance) {
          return null;
        }

        const teeResource = clubContext.resourceCatalog.byId.get(
          teeInstance.resource_id,
        );
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

        if (availability.activeBookingCount > 0) {
          return null;
        }

        return {
          slotId: slot.slot_id,
          teeTimeSlot: this.formatTeeTime(slot.start_at),
          localTime: this.formatLocalTime(slot.start_at),
          startAt: slot.start_at,
          endAt: slot.end_at,
          playType: this.getSlotPlayType(teeInstance, slot),
          pricingCategory: teeInstance.pricing_category,
          minPlayers: this.getMinPlayers(teeInstance),
          maxPlayers: this.getMaxPlayers(teeInstance),
          price: {
            adult: availability.teeTimeUnitPrice,
            seniorJunior: availability.seniorJuniorUnitPrice,
          },
          currency: CURRENCY,
          fromPrice: availability.publishedRateUnitPrice,
          pricingLabel: `From ${CURRENCY} ${availability.publishedRateUnitPrice}`,
          remainingPlayerCapacity: availability.playerCapacity,
          available: availability.playerCapacity > 0,
          buggyPolicy: 'required',
          isAvailable: availability.playerCapacity > 0,
        };
      }),
    );

    return {
      club: {
        slug: clubContext.organization.slug,
        name:
          clubContext.facility.facility_name || clubContext.organization.name,
      },
      bookingDate,
      playType,
      slots: slots.filter(
        (item): item is NonNullable<typeof item> => item !== null,
      ),
    };
  }

  async fetchBookingDetails(bookingRef: string) {
    const aggregate = await this.getBookingAggregateByRef(bookingRef);
    const config = this.getReadableBookingConfig(
      aggregate.booking,
      aggregate.lineItems,
    );
    const pricing =
      aggregate.lineItems.length > 0
        ? this.calculatePricingFromLineItems(
            aggregate.lineItems,
            aggregate.resourceCatalog,
          )
        : {
            greenFeeTotal: 0,
            caddieTotal: 0,
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
      golfClubName:
        aggregate.facility?.facility_name ?? aggregate.organization.name,
      golfClubSlug: aggregate.organization.slug,
      bookingDate: this.extractDate(aggregate.slot.start_at),
      teeTimeSlot: this.formatTeeTime(aggregate.slot.start_at),
      playType: config.playType,
      selectedNine: null,
      hostName: aggregate.hostUser?.name ?? '',
      hostPhoneNumber:
        aggregate.hostUser?.phone_normalized ?? aggregate.hostUser?.phone ?? '',
      playerCount: config.playerCount,
      normalPlayerCount: config.normalPlayerCount,
      seniorPlayerCount: config.seniorPlayerCount,
      caddieArrangement: config.caddieArrangement,
      buggyType: config.buggyType,
      buggyQuantity: config.buggyQuantity,
      buggySharingPreference: config.buggySharingPreference,
      paymentMethod: config.paymentMethod,
      playerDetails: aggregate.players.map((player) => ({
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
      })),
      subtotalAmount: this.toNumber(
        aggregate.booking.subtotal_amount ?? aggregate.booking.total_amount,
      ),
      discountAmount: this.toNumber(aggregate.booking.discount_amount),
      finalAmount: this.toNumber(
        aggregate.booking.final_amount ?? aggregate.booking.total_amount,
      ),
      voucherCode: aggregate.booking.voucher_code,
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

  private async getGolfOrganizations() {
    const result = await this.supabase.client
      .from('organization')
      .select(
        'organization_id, name, email, address, slug, latitude, longitude, created_at',
      )
      .not('slug', 'is', null)
      .neq('slug', '')
      .order('name', { ascending: true });

    if (result.error) {
      this.throwSupabaseError(result.error.message);
    }

    return (result.data ?? []) as OrganizationRow[];
  }

  private async getOrganizationsByIds(organizationIds: string[]) {
    if (organizationIds.length === 0) {
      return new Map<string, OrganizationRow>();
    }

    const result = await this.supabase.client
      .from('organization')
      .select(
        'organization_id, name, email, address, slug, latitude, longitude, created_at',
      )
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

  private async getOrganizationMediaByIds(organizationIds: string[]) {
    if (organizationIds.length === 0) {
      return new Map<string, OrganizationMediaRow[]>();
    }

    const result = await this.supabase.client
      .from('organization_media')
      .select(
        'organization_media_id, organization_id, media_type, bucket_id, object_path, alt_text, caption, sort_order, is_primary, is_active, created_at, updated_at',
      )
      .in('organization_id', organizationIds)
      .eq('is_active', true)
      .order('sort_order', { ascending: true });

    if (result.error) {
      this.throwSupabaseError(result.error.message);
    }

    return ((result.data ?? []) as OrganizationMediaRow[]).reduce(
      (grouped, item) => {
        const rows = grouped.get(item.organization_id) ?? [];
        rows.push(item);
        grouped.set(item.organization_id, rows);
        return grouped;
      },
      new Map<string, OrganizationMediaRow[]>(),
    );
  }

  private async getOrganizationMediaByOrganizationId(organizationId: string) {
    const mediaByOrganizationId = await this.getOrganizationMediaByIds([
      organizationId,
    ]);
    return mediaByOrganizationId.get(organizationId) ?? [];
  }

  private async getFacilitiesByOrganizationSportIds(
    organizationSportIds: string[],
  ) {
    if (organizationSportIds.length === 0) {
      return [];
    }

    const result = await this.supabase.client
      .from('facility')
      .select(
        'facility_id, organization_sport_id, facility_name, capacity, no_of_holes',
      )
      .in('organization_sport_id', organizationSportIds);

    if (result.error) {
      this.throwSupabaseError(result.error.message);
    }

    return (result.data ?? []) as FacilityRow[];
  }

  private async getOrganizationBySlug(golfClubSlug: string) {
    const result = await this.supabase.client
      .from('organization')
      .select(
        'organization_id, name, email, address, slug, latitude, longitude, created_at',
      )
      .eq('slug', golfClubSlug)
      .maybeSingle<OrganizationRow>();

    if (result.error) {
      this.throwSupabaseError(result.error.message);
    }

    if (!result.data) {
      throw new NotFoundException(
        `Golf club not found for slug: ${golfClubSlug}`,
      );
    }

    return result.data;
  }

  private async getOrganizationSportForOrganization(
    organizationId: string,
    sportId: string,
  ) {
    const result = await this.supabase.client
      .from('organization_sport')
      .select('organization_sport_id, organization_id, sport_id')
      .eq('organization_id', organizationId)
      .eq('sport_id', sportId)
      .maybeSingle<OrganizationSportRow>();

    if (result.error) {
      this.throwSupabaseError(result.error.message);
    }

    return result.data ?? null;
  }

  private async getFacilityByOrganizationSportId(organizationSportId: string) {
    const result = await this.supabase.client
      .from('facility')
      .select(
        'facility_id, organization_sport_id, facility_name, capacity, no_of_holes',
      )
      .eq('organization_sport_id', organizationSportId)
      .limit(1)
      .maybeSingle<FacilityRow>();

    if (result.error) {
      this.throwSupabaseError(result.error.message);
    }

    return result.data ?? null;
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
      .select(
        'facility_id, organization_sport_id, facility_name, capacity, no_of_holes',
      )
      .eq('organization_sport_id', organizationSport.data.organization_sport_id)
      .limit(1)
      .maybeSingle<FacilityRow>();

    if (facility.error) {
      this.throwSupabaseError(facility.error.message);
    }

    return facility.data;
  }

  private async getAllClubContexts() {
    const golfClubs = (await this.fetchGolfClubList()).filter(
      (club) => club.isBookable,
    );

    return Promise.all(
      golfClubs.map((club) => this.getClubContextBySlug(club.slug)),
    );
  }

  private async getClubContextBySlug(
    golfClubSlug: string,
  ): Promise<ClubContext> {
    const sport = await this.getGolfSport();
    const organizationResult = await this.supabase.client
      .from('organization')
      .select(
        'organization_id, name, email, address, slug, latitude, longitude, created_at',
      )
      .eq('slug', golfClubSlug)
      .maybeSingle<OrganizationRow>();

    if (organizationResult.error) {
      this.throwSupabaseError(organizationResult.error.message);
    }

    const organization = organizationResult.data;
    if (!organization) {
      throw new NotFoundException(
        `Golf club not found for slug: ${golfClubSlug}`,
      );
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
      throw new NotFoundException(
        `Golf configuration not found for slug: ${golfClubSlug}`,
      );
    }

    const facilityResult = await this.supabase.client
      .from('facility')
      .select(
        'facility_id, organization_sport_id, facility_name, capacity, no_of_holes',
      )
      .eq('organization_sport_id', organizationSport.organization_sport_id)
      .limit(1)
      .maybeSingle<FacilityRow>();

    if (facilityResult.error) {
      this.throwSupabaseError(facilityResult.error.message);
    }

    const facility = facilityResult.data;
    if (!facility) {
      throw new NotFoundException(
        `Facility not found for slug: ${golfClubSlug}`,
      );
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
        teeInstances.map((instance) => [
          instance.resource_instance_id,
          instance,
        ]),
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
          (row) =>
            row.resource_type === 'golf_cart' || row.resource_type === 'buggy',
        ),
      },
    };
  }

  private buildGolfClubSummary(clubContext: ClubContext): GolfClubListItem {
    return this.buildGolfClubSummaryFromRows(
      clubContext.organization,
      clubContext.organizationSport,
      clubContext.facility,
      [],
    );
  }

  private buildGolfClubSummaryFromRows(
    organization: OrganizationRow,
    organizationSport: OrganizationSportRow | null,
    facility: FacilityRow | null,
    mediaRows: OrganizationMediaRow[],
  ): GolfClubListItem {
    const hasBookingSetup = Boolean(organizationSport && facility);
    const isBookable =
      hasBookingSetup && this.isBookableClub(organization.slug);

    return {
      id: facility?.facility_id ?? organization.organization_id,
      slug: organization.slug,
      name: facility?.facility_name || organization.name,
      address: organization.address ?? '',
      email: organization.email,
      isBookable,
      availabilityLabel: isBookable ? 'Booking available' : 'Coming soon',
      latitude: this.toNullableNumber(organization.latitude),
      longitude: this.toNullableNumber(organization.longitude),
      noOfHoles: this.toNumber(facility?.no_of_holes),
      buggyPolicy: 'required',
      paymentMethods: ['pay_counter'],
      images: this.buildGolfClubImages(organization, mediaRows),
      updatedAt: organization.created_at ?? new Date().toISOString(),
    };
  }

  private buildGolfClubImages(
    organization: OrganizationRow,
    mediaRows: OrganizationMediaRow[],
  ): GolfClubImages {
    const rowsByType = mediaRows.reduce((grouped, row) => {
      const type = row.media_type.toLowerCase();
      const rows = grouped.get(type) ?? [];
      rows.push(row);
      grouped.set(type, rows);
      return grouped;
    }, new Map<string, OrganizationMediaRow[]>());

    const pickImage = (type: string, fallbackLabel: string) => {
      const rows = rowsByType.get(type) ?? [];
      const row = rows.find((item) => item.is_primary) ?? rows[0];
      return row
        ? this.buildGolfClubImage(organization, row, fallbackLabel)
        : null;
    };

    return {
      logo: pickImage('logo', `${organization.name} logo`),
      cover: pickImage('cover', `${organization.name} cover image`),
      thumbnail: pickImage('thumbnail', `${organization.name} thumbnail`),
      gallery: (rowsByType.get('gallery') ?? []).map((row, index) =>
        this.buildGolfClubImage(
          organization,
          row,
          `${organization.name} gallery image ${index + 1}`,
          true,
        ),
      ),
    };
  }

  private buildGolfClubImage(
    organization: OrganizationRow,
    mediaRow: OrganizationMediaRow,
    fallbackAltText: string,
    includeCaption = false,
  ): GolfClubImage {
    const publicUrl = this.supabase.client.storage
      .from(mediaRow.bucket_id)
      .getPublicUrl(mediaRow.object_path).data.publicUrl;

    return {
      url: publicUrl,
      path: mediaRow.object_path,
      altText: mediaRow.alt_text ?? fallbackAltText,
      ...(includeCaption ? { caption: mediaRow.caption } : {}),
      sortOrder: this.toNumber(mediaRow.sort_order),
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
        'resource_instance_id, resource_id, organization_id, identifier, status, play_type, min_players, max_players, base_price, senior_junior_price, unit_price, pricing_category',
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

        return true;
      })
      .map((instance) => instance.resource_instance_id);

    if (teeInstanceIds.length === 0) {
      return [];
    }

    const rangeStartIso = bookingDate
      ? this.getDayRange(bookingDate).dayStartIso
      : this.getTodayRange().dayStartIso;
    const rangeEndIso = bookingDate
      ? this.getDayRange(bookingDate).dayEndIso
      : undefined;

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
      .select(
        'override_id, facility_id, resource_instance_id, start_at, end_at',
      )
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
        'resource_instance_id, resource_id, organization_id, identifier, status, play_type, min_players, max_players, base_price, senior_junior_price, unit_price, pricing_category',
      )
      .eq('resource_instance_id', slot.resource_instance_id)
      .maybeSingle<ResourceInstanceRow>();

    if (teeInstanceResult.error) {
      this.throwSupabaseError(teeInstanceResult.error.message);
    }

    const teeInstance = teeInstanceResult.data;
    if (!teeInstance) {
      throw new NotFoundException(
        `Resource instance not found for slot: ${slotId}`,
      );
    }
    if (teeInstance.status !== 'active') {
      throw new ConflictException('Selected slot is not active');
    }
    this.getBasePrice(teeInstance);
    this.getMaxPlayers(teeInstance);

    const sport = await this.getGolfSport();
    const resourceCatalog = await this.getResourceCatalog(sport.sport_id);
    const teeResource = resourceCatalog.byId.get(teeInstance.resource_id);

    if (!teeResource || teeResource.resource_type !== 'tee_time') {
      throw new NotFoundException(`Slot is not a tee time resource: ${slotId}`);
    }

    const organizationResult = await this.supabase.client
      .from('organization')
      .select(
        'organization_id, name, email, address, slug, latitude, longitude, created_at',
      )
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
      throw new NotFoundException(
        `Organization sport not found for slot: ${slotId}`,
      );
    }

    const facilityResult = await this.supabase.client
      .from('facility')
      .select(
        'facility_id, organization_sport_id, facility_name, capacity, no_of_holes',
      )
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
        ...slotContext.resourceCatalog.byType.caddie.map(
          (item) => item.resource_id,
        ),
        ...slotContext.resourceCatalog.byType.golf_cart.map(
          (item) => item.resource_id,
        ),
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
    const counts = this.extractCountsFromLineItems(
      lineItems,
      slotContext.resourceCatalog,
    );

    return {
      playerCapacity: Math.max(
        0,
        this.getMaxPlayers(slotContext.teeInstance) - counts.playerCount,
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
      publishedRateUnitPrice: this.getBasePrice(slotContext.teeInstance),
      teeTimeUnitPrice: this.getBasePrice(slotContext.teeInstance),
      seniorJuniorUnitPrice: this.getSeniorJuniorPrice(slotContext.teeInstance),
      caddieUnitPrice: await this.getCaddieUnitPrice(
        slotContext.organization.organization_id,
      ),
      golfCartUnitPrice: BUGGY_FEE_PER_PLAYER,
      activeBookingCount: activeBookings.length,
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
        caddie: [] as Array<{
          slot: ResourceSlotRow;
          instance: ResourceInstanceRow;
        }>,
        golf_cart: [] as Array<{
          slot: ResourceSlotRow;
          instance: ResourceInstanceRow;
        }>,
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
        caddie: [] as Array<{
          slot: ResourceSlotRow;
          instance: ResourceInstanceRow;
        }>,
        golf_cart: [] as Array<{
          slot: ResourceSlotRow;
          instance: ResourceInstanceRow;
        }>,
      },
    );
  }

  private async getNextAvailableSlotForClub(
    clubContext: ClubContext,
    searchDays = 2,
  ) {
    const now = Date.now();

    for (let offset = 0; offset < searchDays; offset += 1) {
      const bookingDate = this.getDateInMalaysia(offset);
      const teeSlots = await this.getTeeSlots(clubContext, bookingDate);

      for (const slot of teeSlots) {
        if (new Date(slot.start_at).getTime() <= now) {
          continue;
        }

        const teeInstance = clubContext.teeInstancesById.get(
          slot.resource_instance_id,
        );
        if (!teeInstance) {
          continue;
        }

        const teeResource = clubContext.resourceCatalog.byId.get(
          teeInstance.resource_id,
        );
        if (!teeResource) {
          continue;
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

        if (
          availability.activeBookingCount > 0 ||
          availability.playerCapacity <= 0
        ) {
          continue;
        }

        return {
          bookingDate,
          slotId: slot.slot_id,
          teeTimeSlot: this.formatTeeTime(slot.start_at),
          startAt: slot.start_at,
          endAt: slot.end_at,
          playType: this.getSlotPlayType(teeInstance, slot),
          remainingPlayerCapacity: availability.playerCapacity,
          fromPrice: availability.publishedRateUnitPrice,
          price: {
            adult: availability.teeTimeUnitPrice,
            seniorJunior: availability.seniorJuniorUnitPrice,
          },
          currency: CURRENCY,
          buggyPolicy: 'required' as const,
          isAvailable: true,
        };
      }
    }

    return null;
  }

  private getSupportResourceCapacity(
    instances: ResourceInstanceRow[],
    resourceSlots: Array<{
      slot: ResourceSlotRow;
      instance: ResourceInstanceRow;
    }>,
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
        resource.resource_type === 'golf_cart' ||
        resource.resource_type === 'buggy'
      );
    }).length;
  }

  async getActiveBookingsForSlotIds(
    slotIds: string[],
    excludedBookingId?: string,
  ) {
    if (slotIds.length === 0) {
      return [];
    }

    const result = await this.supabase.client
      .from('booking')
      .select(
        'booking_id, user_id, organization_id, sport_id, status, total_amount, created_at, booking_ref, visitor_id, slot_id, is_phone_verified, booking_source, confirmed_at, cancelled_at, cancellation_reason, updated_at, hold_expires_at, play_type, selected_nine, buggy_type, buggy_sharing_preference, caddy_arrangement, payment_method, estimated_total_amount, subtotal_amount, discount_amount, voucher_id, voucher_code, final_amount, pricing_snapshot',
      )
      .in('slot_id', slotIds)
      .in('status', [
        'hold',
        'held',
        'pending_payment',
        'confirmed',
        'completed',
      ]);

    if (result.error) {
      this.throwSupabaseError(result.error.message);
    }

    return ((result.data ?? []) as BookingRow[])
      .filter((booking) => booking.booking_id !== excludedBookingId)
      .filter(
        (booking) =>
          booking.status === 'confirmed' ||
          booking.status === 'completed' ||
          booking.status === 'pending_payment' ||
          ((booking.status === 'held' || booking.status === 'hold') &&
            !this.isHoldExpired(booking)),
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
      throw new ConflictException(
        'Selected slot has insufficient player capacity',
      );
    }
    if (request.caddieCount > availability.caddieCapacity) {
      throw new ConflictException(
        'Selected slot has insufficient caddie capacity',
      );
    }
  }

  ensurePlayerCountAllowed(
    playerCount: number,
    teeInstance: ResourceInstanceRow,
  ) {
    const minPlayers = this.getMinPlayers(teeInstance);
    const maxPlayers = this.getMaxPlayers(teeInstance);

    if (playerCount < minPlayers || playerCount > maxPlayers) {
      throw new ConflictException(
        `Player count must be between ${minPlayers} and ${maxPlayers} for this slot`,
      );
    }
  }

  ensureSlotCanBeHeld(availability: SlotAvailabilitySummary) {
    if (availability.activeBookingCount > 0) {
      throw new ConflictException('Selected slot is already booked');
    }

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
    const items: Record<string, unknown>[] = [];
    const adultQuantity = bookingConfig.normalPlayerCount;
    const seniorJuniorQuantity = bookingConfig.seniorPlayerCount;
    const adultRateBreakdown = this.calculatePublishedRateBreakdown(
      availability.teeTimeUnitPrice,
    );
    const seniorJuniorRateBreakdown = this.calculatePublishedRateBreakdown(
      availability.seniorJuniorUnitPrice,
    );

    if (adultQuantity > 0) {
      items.push({
        booking_line_item_id: randomUUID(),
        booking_id: bookingId,
        resource_id: slotContext.teeResource.resource_id,
        resource_instance_id: slotContext.teeInstance.resource_instance_id,
        slot_id: slotContext.slot.slot_id,
        quantity: adultQuantity,
        unit_price: adultRateBreakdown.greenFee,
        total_price: this.roundCurrency(
          adultRateBreakdown.greenFee * adultQuantity,
        ),
        metadata: {
          type: 'green_fee',
          resourceType: 'tee_time',
          pricingCategory: slotContext.teeInstance.pricing_category,
          playerCategory: 'adult',
          source: 'resource_instance',
          publishedRate: availability.teeTimeUnitPrice,
          bookingConfig,
          pricing,
        },
      });
    }

    if (seniorJuniorQuantity > 0) {
      items.push({
        booking_line_item_id: randomUUID(),
        booking_id: bookingId,
        resource_id: slotContext.teeResource.resource_id,
        resource_instance_id: slotContext.teeInstance.resource_instance_id,
        slot_id: slotContext.slot.slot_id,
        quantity: seniorJuniorQuantity,
        unit_price: seniorJuniorRateBreakdown.greenFee,
        total_price: this.roundCurrency(
          seniorJuniorRateBreakdown.greenFee * seniorJuniorQuantity,
        ),
        metadata: {
          type: 'green_fee',
          resourceType: 'tee_time',
          pricingCategory: slotContext.teeInstance.pricing_category,
          playerCategory: 'senior_junior',
          source: 'resource_instance',
          publishedRate: availability.seniorJuniorUnitPrice,
          bookingConfig,
          pricing,
        },
      });
    }

    const caddieInstance =
      counts.caddieCount > 0
        ? await this.getCaddieResourceInstance(
            slotContext.organization.organization_id,
          )
        : null;
    const caddieResource = caddieInstance
      ? slotContext.resourceCatalog.byId.get(caddieInstance.resource_id)
      : slotContext.resourceCatalog.byType.caddie[0];

    if (counts.caddieCount > 0 && !caddieInstance) {
      throw new ConflictException('Caddy pricing configuration is missing.');
    }
    if (counts.caddieCount > 0 && !caddieResource) {
      throw new ConflictException('Caddy resource configuration is missing.');
    }

    if (counts.caddieCount > 0 && caddieResource) {
      items.push({
        booking_line_item_id: randomUUID(),
        booking_id: bookingId,
        resource_id: caddieResource.resource_id,
        resource_instance_id: caddieInstance?.resource_instance_id ?? null,
        slot_id: slotContext.slot.slot_id,
        quantity: counts.caddieCount,
        unit_price: availability.caddieUnitPrice,
        total_price: this.roundCurrency(
          availability.caddieUnitPrice * counts.caddieCount,
        ),
        metadata: {
          type: 'caddy_fee',
          resourceType: 'caddie',
          source: 'resource_instance',
        },
      });
    }

    if (
      counts.golfCartCount > 0 &&
      slotContext.resourceCatalog.byType.golf_cart[0]
    ) {
      const golfCartUnitPrice =
        counts.golfCartCount > 0
          ? this.roundCurrency(
              pricing.buggyEstimatedTotal / counts.golfCartCount,
            )
          : 0;
      items.push({
        booking_line_item_id: randomUUID(),
        booking_id: bookingId,
        resource_id:
          slotContext.resourceCatalog.byType.golf_cart[0].resource_id,
        resource_instance_id: null,
        slot_id: slotContext.slot.slot_id,
        quantity: counts.golfCartCount,
        unit_price: golfCartUnitPrice,
        total_price: pricing.buggyEstimatedTotal,
        metadata: {
          resourceType: 'golf_cart',
          type: 'buggy_fee',
          buggyQuantity: bookingConfig.buggyQuantity,
          singleRiderCount: bookingConfig.singleRiderCount,
          singleRiderSurcharge: BUGGY_SINGLE_RIDER_SURCHARGE,
        },
      });
    }

    const result = await this.supabase.client
      .from('booking_line_item')
      .insert(items);
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
    const result = await this.supabase.client
      .from('booking_status_history')
      .insert({
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
        'booking_id, user_id, organization_id, sport_id, status, total_amount, created_at, booking_ref, visitor_id, slot_id, is_phone_verified, booking_source, confirmed_at, cancelled_at, cancellation_reason, updated_at, hold_expires_at, play_type, selected_nine, buggy_type, buggy_sharing_preference, caddy_arrangement, payment_method, estimated_total_amount, subtotal_amount, discount_amount, voucher_id, voucher_code, final_amount, pricing_snapshot',
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
        'booking_id, user_id, organization_id, sport_id, status, total_amount, created_at, booking_ref, visitor_id, slot_id, is_phone_verified, booking_source, confirmed_at, cancelled_at, cancellation_reason, updated_at, hold_expires_at, play_type, selected_nine, buggy_type, buggy_sharing_preference, caddy_arrangement, payment_method, estimated_total_amount, subtotal_amount, discount_amount, voucher_id, voucher_code, final_amount, pricing_snapshot',
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
      .select(
        'organization_id, name, email, address, slug, latitude, longitude, created_at',
      )
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
      .select(
        'booking_player_id, booking_id, name, phone_number, category, handicap, created_at',
      )
      .eq('booking_id', booking.booking_id);

    const lineItemsPromise = this.supabase.client
      .from('booking_line_item')
      .select(
        'booking_line_item_id, booking_id, resource_id, resource_instance_id, slot_id, quantity, unit_price, total_price, metadata',
      )
      .eq('booking_id', booking.booking_id);

    const [
      organizationResult,
      slotResult,
      hostUserResult,
      playersResult,
      lineItemsResult,
    ] = await Promise.all([
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
      throw new NotFoundException(
        `Booking references incomplete data: ${booking.booking_ref}`,
      );
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
    players: Array<{
      name: string;
      phone_number: string;
      category: PlayerCategory;
    }>,
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
        'booking_id, user_id, organization_id, sport_id, status, total_amount, created_at, booking_ref, visitor_id, slot_id, is_phone_verified, booking_source, confirmed_at, cancelled_at, cancellation_reason, updated_at, hold_expires_at, play_type, selected_nine, buggy_type, buggy_sharing_preference, caddy_arrangement, payment_method, estimated_total_amount, subtotal_amount, discount_amount, voucher_id, voucher_code, final_amount, pricing_snapshot',
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
        'booking_id, user_id, organization_id, sport_id, status, total_amount, created_at, booking_ref, visitor_id, slot_id, is_phone_verified, booking_source, confirmed_at, cancelled_at, cancellation_reason, updated_at, hold_expires_at, play_type, selected_nine, buggy_type, buggy_sharing_preference, caddy_arrangement, payment_method, estimated_total_amount, subtotal_amount, discount_amount, voucher_id, voucher_code, final_amount, pricing_snapshot',
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
          aggregate.hostUser?.phone_normalized ??
          aggregate.hostUser?.phone ??
          '',
      },
      bookingSummary: {
        clubName:
          aggregate.facility?.facility_name ?? aggregate.organization.name,
        golfClubName:
          aggregate.facility?.facility_name ?? aggregate.organization.name,
        golfClubSlug: aggregate.organization.slug,
        bookingDate: this.extractDate(aggregate.slot.start_at),
        teeTime: this.formatLocalTime(aggregate.slot.start_at),
        teeTimeSlot: this.formatTeeTime(aggregate.slot.start_at),
        playType:
          aggregate.booking.play_type === '9_holes' ? '9_holes' : '18_holes',
        pricingCategory:
          aggregate.booking.pricing_snapshot?.slot.pricingCategory ?? null,
        playerCount:
          (aggregate.booking.pricing_snapshot?.calculation?.adultPlayers ?? 0) +
          (aggregate.booking.pricing_snapshot?.calculation
            ?.seniorJuniorPlayers ?? 0),
        minPlayers: aggregate.booking.pricing_snapshot?.rules.minPlayers ?? 1,
        maxPlayers: aggregate.booking.pricing_snapshot?.rules.maxPlayers ?? 4,
        estimatedTotalAmount: this.toNumber(
          aggregate.booking.final_amount ??
            aggregate.booking.estimated_total_amount,
        ),
      },
      pricing: {
        subtotalAmount: this.toNumber(
          aggregate.booking.subtotal_amount ??
            aggregate.booking.estimated_total_amount,
        ),
        discountAmount: this.toNumber(aggregate.booking.discount_amount),
        finalAmount: this.toNumber(
          aggregate.booking.final_amount ??
            aggregate.booking.estimated_total_amount,
        ),
        currency: 'MYR',
        voucher: aggregate.booking.voucher_code
          ? {
              code: aggregate.booking.voucher_code,
              name:
                aggregate.booking.voucher_code === 'FIRST10'
                  ? 'RM10 First Booking Discount'
                  : aggregate.booking.voucher_code,
              discountType:
                aggregate.booking.voucher_code === 'FIRST10'
                  ? 'fixed_amount'
                  : null,
              discountValue:
                aggregate.booking.voucher_code === 'FIRST10' ? 10 : null,
              autoApplied: true,
            }
          : null,
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
      selectedNine: null,
      playerCount: 0,
      normalPlayerCount: 0,
      seniorPlayerCount: 0,
      caddieArrangement:
        booking.caddy_arrangement === 'shared' ||
        booking.caddy_arrangement === 'per_player'
          ? booking.caddy_arrangement
          : 'none',
      buggyType: booking.buggy_type === 'jumbo' ? 'jumbo' : 'normal',
      buggyQuantity: 0,
      singleRiderCount: 0,
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
    let caddieTotal = 0;
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
      } else if (resource.resource_type === 'caddie') {
        caddieTotal += totalPrice;
      } else if (
        resource.resource_type === 'golf_cart' ||
        resource.resource_type === 'buggy'
      ) {
        buggyEstimatedTotal += totalPrice;
      }
    }

    const insuranceTotal = this.calculateInsuranceTotal(
      this.extractBookingConfig(lineItems).playerCount,
    );
    const sstTotal = this.calculateSstTotal(
      greenFeeTotal + caddieTotal + buggyEstimatedTotal + insuranceTotal,
    );

    return {
      greenFeeTotal,
      buggyEstimatedTotal,
      insuranceTotal,
      sstTotal,
      grandTotal: this.roundCurrency(
        greenFeeTotal +
          caddieTotal +
          buggyEstimatedTotal +
          insuranceTotal +
          sstTotal,
      ),
      currency: CURRENCY,
      caddieTotal,
      pendingCounterConfirmation: [],
    };
  }

  getSlotPlayType(
    teeInstance: ResourceInstanceRow,
    slot: ResourceSlotRow,
  ): PlayType {
    if (
      teeInstance.play_type === '9_holes' ||
      teeInstance.play_type === '18_holes'
    ) {
      return teeInstance.play_type;
    }

    const inferredPlayType = this.getInstancePlayType(teeInstance);
    if (inferredPlayType) {
      return inferredPlayType;
    }

    return '18_holes';
  }

  private getInstancePlayType(
    teeInstance: ResourceInstanceRow,
  ): PlayType | null {
    if (
      teeInstance.play_type === '9_holes' ||
      teeInstance.play_type === '18_holes'
    ) {
      return teeInstance.play_type;
    }

    const identifier = teeInstance.identifier?.toLowerCase() ?? '';
    if (!identifier) {
      return null;
    }

    if (identifier.includes('_18_') || identifier.includes('18_main')) {
      return '18_holes';
    }

    if (identifier.includes('_9_')) {
      return '9_holes';
    }

    return null;
  }

  buildBookingConfigFromSubmit(request: SubmitBookingRequest): BookingConfig {
    const playerCount = request.playerDetails.length;
    const normalPlayerCount = request.playerDetails.filter(
      (player) => player.category === 'normal' || player.category === 'adult',
    ).length;
    const seniorPlayerCount = request.playerDetails.filter(
      (player) => player.category === 'senior' || player.category === 'junior',
    ).length;

    if (playerCount !== normalPlayerCount + seniorPlayerCount) {
      throw new ConflictException(
        'Player category totals must match playerDetails',
      );
    }

    if (request.playerDetails.filter((player) => player.isHost).length !== 1) {
      throw new ConflictException(
        'Exactly one player must be marked as the host',
      );
    }

    const buggyQuantity = Math.ceil(playerCount / 2);
    const singleRiderCount = playerCount % 2;

    return {
      playType: request.playType,
      selectedNine: null,
      playerCount,
      normalPlayerCount,
      seniorPlayerCount,
      caddieArrangement: request.caddieArrangement,
      buggyType: 'normal',
      buggyQuantity,
      singleRiderCount,
      buggySharingPreference: singleRiderCount > 0 ? 'single' : 'shared',
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
            ? Math.ceil(config.playerCount / 2)
            : 0,
      golfCartCount: config.buggyQuantity,
    };
  }

  calculateBookingPricing(
    availability: SlotAvailabilitySummary,
    config: BookingConfig,
    counts: BookingCounts,
  ): BookingPricing {
    const adultRateBreakdown = this.calculatePublishedRateBreakdown(
      availability.teeTimeUnitPrice,
    );
    const seniorJuniorRateBreakdown = this.calculatePublishedRateBreakdown(
      availability.seniorJuniorUnitPrice,
    );
    const greenFeeTotal = this.roundCurrency(
      adultRateBreakdown.greenFee * config.normalPlayerCount +
        seniorJuniorRateBreakdown.greenFee * config.seniorPlayerCount,
    );
    const caddieTotal = this.roundCurrency(
      availability.caddieUnitPrice * counts.caddieCount,
    );
    if (counts.caddieCount > 0 && availability.caddieUnitPrice <= 0) {
      throw new ConflictException('Caddy pricing configuration is missing.');
    }
    const buggyBaseTotal = BUGGY_FEE_PER_PLAYER * config.playerCount;
    const buggySurchargeTotal =
      this.calculateTaxExclusiveAmount(BUGGY_SINGLE_RIDER_SURCHARGE) *
      config.singleRiderCount;
    const buggyEstimatedTotal = this.roundCurrency(
      buggyBaseTotal + buggySurchargeTotal,
    );
    const insuranceTotal = this.calculateInsuranceTotal(config.playerCount);
    const sstTotal = this.roundCurrency(
      adultRateBreakdown.sst * config.normalPlayerCount +
        seniorJuniorRateBreakdown.sst * config.seniorPlayerCount +
        this.calculateTaxAmountFromInclusive(BUGGY_SINGLE_RIDER_SURCHARGE) *
          config.singleRiderCount,
    );

    return {
      greenFeeTotal,
      caddieTotal,
      buggyEstimatedTotal,
      insuranceTotal,
      sstTotal,
      grandTotal: this.roundCurrency(
        greenFeeTotal +
          caddieTotal +
          buggyEstimatedTotal +
          insuranceTotal +
          sstTotal,
      ),
      currency: CURRENCY,
      pendingCounterConfirmation: [],
    };
  }

  private calculateInsuranceTotal(playerCount: number) {
    return this.roundCurrency(playerCount * INSURANCE_FEE_PER_PLAYER);
  }

  private calculatePublishedRateBreakdown(publishedRate: number) {
    const netSellingPrice = this.calculateTaxExclusiveAmount(publishedRate);
    const sst = this.roundCurrency(publishedRate - netSellingPrice);
    const greenFee = this.roundCurrency(
      netSellingPrice - BUGGY_FEE_PER_PLAYER - INSURANCE_FEE_PER_PLAYER,
    );

    return {
      greenFee,
      sst,
    };
  }

  private calculateTaxExclusiveAmount(taxInclusiveAmount: number) {
    return this.roundCurrency(taxInclusiveAmount / (1 + SST_RATE));
  }

  private calculateTaxAmountFromInclusive(taxInclusiveAmount: number) {
    return this.roundCurrency(
      taxInclusiveAmount - this.calculateTaxExclusiveAmount(taxInclusiveAmount),
    );
  }

  private calculateSstTotal(taxableSubtotal: number) {
    return this.roundCurrency(taxableSubtotal * SST_RATE);
  }

  extractBookingConfig(lineItems: BookingLineItemRow[]): BookingConfig {
    const teeLineItem = lineItems.find(
      (lineItem) => lineItem.metadata?.resourceType === 'tee_time',
    );
    const metadata = teeLineItem?.metadata?.bookingConfig as
      | Partial<BookingConfig>
      | undefined;
    const playerCount = this.toNumber(teeLineItem?.quantity ?? 0);

    return {
      playType: metadata?.playType === '9_holes' ? '9_holes' : '18_holes',
      selectedNine: metadata?.selectedNine ?? null,
      playerCount: metadata?.playerCount ?? playerCount,
      normalPlayerCount: metadata?.normalPlayerCount ?? playerCount,
      seniorPlayerCount: metadata?.seniorPlayerCount ?? 0,
      caddieArrangement: metadata?.caddieArrangement ?? 'none',
      buggyType: metadata?.buggyType ?? 'normal',
      buggyQuantity:
        metadata?.buggyQuantity ??
        Math.ceil((metadata?.playerCount ?? playerCount) / 2),
      singleRiderCount:
        metadata?.singleRiderCount ??
        (metadata?.playerCount ?? playerCount) % 2,
      buggySharingPreference: metadata?.buggySharingPreference ?? 'shared',
      paymentMethod: metadata?.paymentMethod ?? 'pay_counter',
    };
  }

  private extractStoredPricing(
    lineItems: BookingLineItemRow[],
  ): BookingPricing | null {
    const teeLineItem = lineItems.find(
      (lineItem) => lineItem.metadata?.resourceType === 'tee_time',
    );
    const pricing = teeLineItem?.metadata?.pricing as
      | BookingPricing
      | undefined;
    return pricing ?? null;
  }

  async updateBookingConfig(
    bookingId: string,
    currentConfig: BookingConfig,
    updates: UpdateBookingRequest,
  ) {
    const nextConfig: BookingConfig = {
      ...currentConfig,
      caddieArrangement:
        updates.caddieArrangement ?? currentConfig.caddieArrangement,
      buggyType: 'normal',
      buggyQuantity: Math.ceil(currentConfig.playerCount / 2),
      singleRiderCount: currentConfig.playerCount % 2,
      buggySharingPreference:
        currentConfig.playerCount % 2 > 0 ? 'single' : 'shared',
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
      (booking.status === 'held' || booking.status === 'hold') &&
      booking.hold_expires_at !== null &&
      new Date(booking.hold_expires_at).getTime() <= Date.now()
    );
  }

  generateBookingRef() {
    return `GK-${randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase()}`;
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

  private getTodayDateInMalaysia() {
    return this.getDateInMalaysia();
  }

  private getDateInMalaysia(offsetDays = 0) {
    const now = new Date();
    const malaysiaNow = new Date(
      now.toLocaleString('en-US', { timeZone: 'Asia/Kuala_Lumpur' }),
    );
    malaysiaNow.setDate(malaysiaNow.getDate() + offsetDays);

    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kuala_Lumpur',
    }).format(malaysiaNow);
  }

  private toNullableNumber(value: number | string | null | undefined) {
    if (value === null || value === undefined || value === '') {
      return null;
    }

    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  private calculateDistanceInKm(
    userLatitude?: number,
    userLongitude?: number,
    clubLatitude?: number | null,
    clubLongitude?: number | null,
  ) {
    if (
      userLatitude === undefined ||
      userLongitude === undefined ||
      clubLatitude === null ||
      clubLatitude === undefined ||
      clubLongitude === null ||
      clubLongitude === undefined
    ) {
      return null;
    }

    const earthRadiusKm = 6371;
    const latitudeDelta = this.toRadians(clubLatitude - userLatitude);
    const longitudeDelta = this.toRadians(clubLongitude - userLongitude);
    const startLatitude = this.toRadians(userLatitude);
    const endLatitude = this.toRadians(clubLatitude);

    const haversine =
      Math.sin(latitudeDelta / 2) * Math.sin(latitudeDelta / 2) +
      Math.cos(startLatitude) *
        Math.cos(endLatitude) *
        Math.sin(longitudeDelta / 2) *
        Math.sin(longitudeDelta / 2);

    const arc = 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
    return Number((earthRadiusKm * arc).toFixed(2));
  }

  private toRadians(value: number) {
    return (value * Math.PI) / 180;
  }

  private isBookableClub(clubSlug: string) {
    return clubSlug === 'kinrara-golf-club';
  }

  formatTeeTime(isoDateTime: string) {
    return new Intl.DateTimeFormat('en-MY', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
      timeZone: 'Asia/Kuala_Lumpur',
    }).format(new Date(isoDateTime));
  }

  formatLocalTime(isoDateTime: string) {
    return new Intl.DateTimeFormat('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: 'Asia/Kuala_Lumpur',
    }).format(new Date(isoDateTime));
  }

  extractDate(isoDateTime: string) {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kuala_Lumpur',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date(isoDateTime));

    const year = parts.find((part) => part.type === 'year')?.value ?? '0000';
    const month = parts.find((part) => part.type === 'month')?.value ?? '00';
    const day = parts.find((part) => part.type === 'day')?.value ?? '00';

    return `${year}-${month}-${day}`;
  }

  private isOverridden(
    slot: ResourceSlotRow,
    overrides: AvailabilityOverrideRow[],
  ) {
    return overrides.some((override) => {
      const overlaps =
        new Date(override.start_at).getTime() <
          new Date(slot.end_at).getTime() &&
        new Date(override.end_at).getTime() > new Date(slot.start_at).getTime();

      return (
        overlaps &&
        (override.resource_instance_id === null ||
          override.resource_instance_id === slot.resource_instance_id)
      );
    });
  }

  private countUsableCapacity(
    resourceSlots: Array<{
      slot: ResourceSlotRow;
      instance: ResourceInstanceRow;
    }>,
    overrides: AvailabilityOverrideRow[],
  ) {
    return resourceSlots.filter(
      ({ slot, instance }) =>
        !overrides.some((override) => {
          const overlaps =
            new Date(override.start_at).getTime() <
              new Date(slot.end_at).getTime() &&
            new Date(override.end_at).getTime() >
              new Date(slot.start_at).getTime();

          return (
            overlaps &&
            (override.resource_instance_id === null ||
              override.resource_instance_id === instance.resource_instance_id)
          );
        }),
    ).length;
  }

  private getMinPlayers(teeInstance: ResourceInstanceRow) {
    const minPlayers = this.toNumber(teeInstance.min_players);
    return minPlayers > 0 ? minPlayers : 1;
  }

  private getMaxPlayers(teeInstance: ResourceInstanceRow) {
    const maxPlayers = this.toNumber(teeInstance.max_players);
    if (maxPlayers <= 0) {
      throw new ConflictException('Slot pricing configuration is missing.');
    }
    return maxPlayers;
  }

  private getBasePrice(teeInstance: ResourceInstanceRow) {
    const basePrice = this.toNumber(teeInstance.base_price);
    if (basePrice <= 0) {
      throw new ConflictException('Slot pricing configuration is missing.');
    }
    return basePrice;
  }

  private getSeniorJuniorPrice(teeInstance: ResourceInstanceRow) {
    const seniorJuniorPrice = this.toNumber(teeInstance.senior_junior_price);
    return seniorJuniorPrice > 0
      ? seniorJuniorPrice
      : this.getBasePrice(teeInstance);
  }

  async getCaddieResourceInstance(organizationId: string) {
    const result = await this.supabase.client
      .from('resource_instance')
      .select(
        'resource_instance_id, resource_id, organization_id, identifier, status, play_type, min_players, max_players, base_price, senior_junior_price, unit_price, pricing_category',
      )
      .eq('organization_id', organizationId)
      .eq('status', 'active')
      .eq('play_type', 'caddy')
      .limit(1)
      .maybeSingle<ResourceInstanceRow>();

    if (result.error) {
      this.throwSupabaseError(result.error.message);
    }

    return result.data ?? null;
  }

  private async getCaddieUnitPrice(organizationId: string) {
    const caddieInstance = await this.getCaddieResourceInstance(organizationId);
    return this.toNumber(caddieInstance?.unit_price);
  }

  async buildPricingSnapshot(
    slotContext: SlotContext,
    availability: SlotAvailabilitySummary,
    config?: BookingConfig,
    counts?: BookingCounts,
    pricing?: BookingPricing,
  ): Promise<PricingSnapshot> {
    const adultPlayers = config?.normalPlayerCount ?? 0;
    const seniorJuniorPlayers = config?.seniorPlayerCount ?? 0;
    const caddyQuantity = counts?.caddieCount ?? 0;
    const caddyTotal = pricing?.caddieTotal ?? 0;
    const greenFeeTotal = pricing?.greenFeeTotal ?? 0;
    const estimatedTotal = pricing?.grandTotal ?? 0;

    return {
      slot: {
        slotId: slotContext.slot.slot_id,
        resourceInstanceId: slotContext.teeInstance.resource_instance_id,
        identifier: slotContext.teeInstance.identifier,
        playType: this.getSlotPlayType(
          slotContext.teeInstance,
          slotContext.slot,
        ),
        pricingCategory: slotContext.teeInstance.pricing_category,
        startAt: slotContext.slot.start_at,
        endAt: slotContext.slot.end_at,
      },
      rules: {
        minPlayers: this.getMinPlayers(slotContext.teeInstance),
        maxPlayers: this.getMaxPlayers(slotContext.teeInstance),
      },
      prices: {
        basePrice: availability.teeTimeUnitPrice,
        seniorJuniorPrice: availability.seniorJuniorUnitPrice,
        caddyFee: availability.caddieUnitPrice,
      },
      ...(config
        ? {
            calculation: {
              adultPlayers,
              seniorJuniorPlayers,
              caddyQuantity,
              greenFeeTotal,
              caddyTotal,
              estimatedTotal,
            },
          }
        : {}),
    };
  }

  applyPricingSnapshotToAvailability(
    availability: SlotAvailabilitySummary,
    snapshot: PricingSnapshot | null,
  ): SlotAvailabilitySummary {
    if (!snapshot) {
      return availability;
    }

    return {
      ...availability,
      publishedRateUnitPrice: snapshot.prices.basePrice,
      teeTimeUnitPrice: snapshot.prices.basePrice,
      seniorJuniorUnitPrice: snapshot.prices.seniorJuniorPrice,
      caddieUnitPrice: snapshot.prices.caddyFee,
    };
  }

  private roundCurrency(value: number) {
    return Math.round(value * 100) / 100;
  }

  toNumber(value: number | string | null | undefined) {
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
