import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { VisitorsService } from './visitors.service';
import { SupabaseJwtGuard } from '../auth/jwt.guard';
import { z } from 'zod';

const HeartbeatSchema = z.object({
  visitor_id: z.string().uuid(),
  platform: z.enum(['web', 'ios', 'android']),
});

const LinkSchema = z.object({
  visitor_id: z.string().uuid(),
});

@Controller('visitors')
export class VisitorsController {
  constructor(private visitors: VisitorsService) {}

  // Public endpoint (no auth): create/update visitor
  @Post('heartbeat')
  async heartbeat(@Body() body: unknown) {
    const data = HeartbeatSchema.parse(body);
    return this.visitors.heartbeat(data.visitor_id, data.platform);
  }

  // Protected endpoint: link visitor to logged-in Supabase user
  @UseGuards(SupabaseJwtGuard)
  @Post('link')
  async link(@Body() body: unknown, @Req() req: any) {
    const data = LinkSchema.parse(body);
    const userId = req.user?.sub; // Supabase user id
    return this.visitors.linkToUser(data.visitor_id, userId);
  }
}
