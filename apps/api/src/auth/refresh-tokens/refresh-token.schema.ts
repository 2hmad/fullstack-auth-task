import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

/** One refresh token. `_id` is the SHA-256 of the token: the token itself is never stored. */
@Schema({ collection: 'refresh_tokens', versionKey: false })
export class RefreshTokenEntity {
  @Prop({ type: String, required: true })
  _id: string;

  @Prop({ type: String, required: true, index: true })
  familyId: string;

  @Prop({ type: String, required: true, index: true })
  userId: string;

  @Prop({ type: Date, required: true })
  createdAt: Date;

  @Prop({ type: Date, required: true })
  expiresAt: Date;

  /** TTL index: MongoDB deletes the whole family once it can no longer be refreshed. */
  @Prop({ type: Date, required: true, expires: 0 })
  familyExpiresAt: Date;

  @Prop({ type: Date })
  usedAt?: Date;
}

export const RefreshTokenSchema = SchemaFactory.createForClass(RefreshTokenEntity);

/**
 * A revoked family. Kept apart from the tokens so the revocation also covers
 * tokens of the family saved after it (a refresh that lost the race to a reuse).
 */
@Schema({ collection: 'revoked_refresh_token_families', versionKey: false })
export class RevokedRefreshTokenFamilyEntity {
  /** The family id. */
  @Prop({ type: String, required: true })
  _id: string;

  @Prop({ type: Date, required: true })
  revokedAt: Date;

  /** TTL index: outlives every token of the family, then disappears. */
  @Prop({ type: Date, required: true, expires: 0 })
  expiresAt: Date;
}

export const RevokedRefreshTokenFamilySchema = SchemaFactory.createForClass(
  RevokedRefreshTokenFamilyEntity,
);
