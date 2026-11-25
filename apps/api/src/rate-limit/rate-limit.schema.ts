import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

/** Recent hits on one rate-limited key. `_id` holds a hash of the client or email, never the value. */
@Schema({ collection: 'rate_limits', versionKey: false })
export class RateLimitEntity {
  @Prop({ type: String, required: true })
  _id: string;

  /** At most limit + 1 entries: nothing is added while the key is blocked. */
  @Prop({ type: [Date], required: true, default: undefined })
  hits: Date[];

  @Prop({ type: Date })
  blockedUntil?: Date | null;

  /** The database's clock at the last hit, so instances with skewed clocks agree. */
  @Prop({ type: Date, required: true })
  updatedAt: Date;

  /** TTL index: MongoDB deletes the document once it can no longer limit anything. */
  @Prop({ type: Date, required: true, expires: 0 })
  expiresAt: Date;
}

export const RateLimitSchema = SchemaFactory.createForClass(RateLimitEntity);
