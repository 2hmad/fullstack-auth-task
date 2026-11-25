import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { HydratedDocument } from 'mongoose';

@Schema({ collection: 'users', timestamps: true, versionKey: false })
export class UserEntity {
  /** Unique index: the database, not a lookup before insert, prevents duplicate accounts. */
  @Prop({ type: String, required: true, unique: true, lowercase: true, trim: true })
  email: string;

  @Prop({ type: String, required: true, trim: true })
  name: string;

  /** Excluded from every query unless explicitly selected. */
  @Prop({ type: String, required: true, select: false })
  passwordHash: string;

  createdAt: Date;
  updatedAt: Date;
}

export type UserDocument = HydratedDocument<UserEntity>;
export const UserSchema = SchemaFactory.createForClass(UserEntity);
