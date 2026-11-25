import { Controller, Get } from '@nestjs/common';
import { Public } from '../auth/auth.decorators.js';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { HealthCheck, HealthCheckService, MongooseHealthIndicator } from '@nestjs/terminus';
import { SkipThrottle } from '@nestjs/throttler';

@ApiTags('health')
@Public()
@SkipThrottle()
@Controller()
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly mongoose: MongooseHealthIndicator,
  ) {}

  /** Liveness: the process answers. Never checks dependencies (a restart doesn't fix a database). */
  @Get('health')
  @ApiOperation({ summary: 'Liveness probe' })
  live() {
    return { status: 'ok' };
  }

  /** Readiness: the app can serve requests. 503 while MongoDB is unreachable. */
  @Get('ready')
  @HealthCheck()
  @ApiOperation({ summary: 'Readiness probe (checks MongoDB)' })
  ready() {
    return this.health.check([() => this.mongoose.pingCheck('mongodb', { timeout: 1000 })]);
  }
}
