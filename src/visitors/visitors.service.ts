import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';

@Injectable()
export class VisitorsService {
  constructor(private supabase: SupabaseService) {}

  async heartbeat(visitorId: string, platform: string) {
    const { data, error } = await this.supabase.client
      .from('visitors')
      .upsert({
        id: visitorId,
        platform,
        last_seen_at: new Date().toISOString(),
      }, { onConflict: 'id' })
      .select()
      .single();

    if (error) throw new Error(error.message);

    return { ok: true, visitor: data };
  }
  
  async linkToUser(visitorId: string, userId: string) {
  // Ensure visitor exists
  const { error } = await this.supabase.client
    .from('visitors')
    .update({ linked_user_id: userId, last_seen_at: new Date().toISOString() })
    .eq('id', visitorId);

  if (error) throw new Error(error.message);

  return { ok: true };
}
}
