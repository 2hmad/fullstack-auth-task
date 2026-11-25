import { Body, Controller, HttpCode, HttpStatus, Inject, Post, Req, Res } from '@nestjs/common';
import { Public } from '@nestjs/authentication';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  accessTokenSchema,
  apiErrorSchema,
  authSessionSchema,
  signInSchema,
  signUpSchema,
  type AccessToken,
  type AuthSession,
  type SignInPayload,
  type SignUpPayload,
} from '@auth-app/shared';
import type { Request, Response } from 'express';
import { CredentialsThrottle } from '../rate-limit/credentials-throttle.decorator.js';
import { toUserProfile } from '../users/user-profile.mapper.js';
import { AuthService, type SignedIn } from './auth.service.js';
import {
  clearRefreshCookie,
  readRefreshCookie,
  setRefreshCookie,
  type RefreshCookieSettings,
} from './refresh-token.cookie.js';

export const REFRESH_COOKIE_SETTINGS = Symbol('REFRESH_COOKIE_SETTINGS');

const errorResponse = (status: number, description: string) =>
  ApiResponse({ status, description, standardSchema: apiErrorSchema });

@ApiTags('auth')
@Public()
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    @Inject(REFRESH_COOKIE_SETTINGS) private readonly cookie: RefreshCookieSettings,
  ) {}

  @Post('signup')
  @HttpCode(HttpStatus.CREATED)
  @CredentialsThrottle()
  @ApiOperation({ summary: 'Create an account and sign in' })
  @ApiResponse({
    status: 201,
    description: 'Signed up. Sets the refresh_token cookie.',
    standardSchema: authSessionSchema,
  })
  @errorResponse(400, 'A field breaks a rule')
  @errorResponse(409, 'The email is already registered')
  @errorResponse(429, 'Too many attempts')
  async signUp(
    @Body({ schema: signUpSchema }) body: SignUpPayload,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthSession> {
    return this.startSession(await this.auth.signUp(body), res);
  }

  @Post('signin')
  @HttpCode(HttpStatus.OK)
  @CredentialsThrottle()
  @ApiOperation({ summary: 'Sign in with email and password' })
  @ApiResponse({
    status: 200,
    description: 'Signed in. Sets the refresh_token cookie.',
    standardSchema: authSessionSchema,
  })
  @errorResponse(400, 'Malformed request')
  @errorResponse(401, 'Invalid email or password')
  @errorResponse(429, 'Too many attempts')
  async signIn(
    @Body({ schema: signInSchema }) body: SignInPayload,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthSession> {
    return this.startSession(await this.auth.signIn(body), res);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Exchange the refresh_token cookie for a new access token',
    description: 'Single use: rotates the cookie. Reusing a spent token revokes the session.',
  })
  @ApiResponse({
    status: 200,
    description: 'Rotated. Sets a new refresh_token cookie.',
    standardSchema: accessTokenSchema,
  })
  @errorResponse(401, 'No session, or the refresh token is invalid, expired or reused')
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AccessToken> {
    try {
      const { refreshToken, accessToken, expiresIn } = await this.auth.refresh(
        readRefreshCookie(req),
      );
      setRefreshCookie(res, refreshToken, this.cookie);
      return { accessToken, expiresIn };
    } catch (error) {
      clearRefreshCookie(res, this.cookie); // a dead cookie is useless: stop the browser sending it
      throw error;
    }
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke the session and clear the refresh_token cookie' })
  @ApiResponse({ status: 204, description: 'Signed out (also when there was no session)' })
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    await this.auth.signOut(readRefreshCookie(req));
    clearRefreshCookie(res, this.cookie);
  }

  private startSession({ tokens, user }: SignedIn, res: Response): AuthSession {
    setRefreshCookie(res, tokens.refreshToken, this.cookie);
    return {
      accessToken: tokens.accessToken,
      expiresIn: tokens.expiresIn,
      user: toUserProfile(user),
    };
  }
}
