import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { apiErrorSchema, userProfileSchema, type UserProfile } from '@auth-app/shared';
import { CurrentUser } from '../auth/auth.decorators.js';
import { toUserProfile } from './user-profile.mapper.js';
import type { User } from './user.model.js';

/** Protected by the global authentication guard: no @Public(). */
@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  @Get('me')
  @ApiOperation({ summary: 'The signed-in user' })
  @ApiResponse({ status: 200, description: 'The profile', standardSchema: userProfileSchema })
  @ApiResponse({
    status: 401,
    description: 'Missing, invalid or expired access token',
    standardSchema: apiErrorSchema,
  })
  me(@CurrentUser() user: User): UserProfile {
    return toUserProfile(user);
  }
}
