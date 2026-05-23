import { Body, Controller, Post } from '@nestjs/common';
import { VisitorsService } from './visitors.service';
import { z } from 'zod';

const HeartbeatSchema = z.object({
  visitor_id: z.string().uuid(),
  platform: z.enum(['web', 'ios', 'android']),
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
}
