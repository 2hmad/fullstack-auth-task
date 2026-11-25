import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { isValidObjectId, Model, mongo } from 'mongoose';
import {
  EmailAlreadyRegisteredError,
  type NewUser,
  type User,
  type UserCredentials,
} from './user.model.js';
import { UserEntity } from './user.schema.js';

const DUPLICATE_KEY = 11000;

type StoredUser = Pick<UserEntity, 'email' | 'name' | 'createdAt'> & {
  _id: { toString(): string };
};

function toUser(doc: StoredUser): User {
  return { id: doc._id.toString(), email: doc.email, name: doc.name, createdAt: doc.createdAt };
}

/** The only place that touches the users collection, and the only one that sees password hashes. */
@Injectable()
export class UsersRepository {
  constructor(@InjectModel(UserEntity.name) private readonly users: Model<UserEntity>) {}

  async create(data: NewUser): Promise<User> {
    try {
      const doc = await this.users.create(data);
      return toUser(doc);
    } catch (error) {
      if (error instanceof mongo.MongoServerError && error.code === DUPLICATE_KEY) {
        throw new EmailAlreadyRegisteredError();
      }
      throw error;
    }
  }

  async findById(id: string): Promise<User | null> {
    if (!isValidObjectId(id)) return null;
    const doc = await this.users.findById(id).lean<StoredUser>().exec();
    return doc ? toUser(doc) : null;
  }

  async findCredentialsByEmail(email: string): Promise<UserCredentials | null> {
    const doc = await this.users
      .findOne({ email: email.trim().toLowerCase() })
      .select('+passwordHash')
      .lean<StoredUser & { passwordHash: string }>()
      .exec();
    return doc ? { user: toUser(doc), passwordHash: doc.passwordHash } : null;
  }

  async updatePasswordHash(id: string, passwordHash: string): Promise<void> {
    await this.users.updateOne({ _id: id }, { $set: { passwordHash } }).exec();
  }
}
