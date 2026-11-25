import { getConnectionToken, MongooseModule } from '@nestjs/mongoose';
import { Test, type TestingModule } from '@nestjs/testing';
import type { Connection } from 'mongoose';
import { isolatedMongoUri } from '../../test/utils/mongo.js';
import { EmailAlreadyRegisteredError } from './user.model.js';
import { UsersModule } from './users.module.js';
import { UsersRepository } from './users.repository.js';

describe('UsersRepository (MongoDB)', () => {
  let moduleRef: TestingModule;
  let users: UsersRepository;

  const ada = { email: 'ada@example.com', name: 'Ada Lovelace', passwordHash: 'hash-1' };

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [MongooseModule.forRoot(isolatedMongoUri()), UsersModule],
    }).compile();
    await moduleRef.init();
    users = moduleRef.get(UsersRepository);
  });

  afterAll(async () => {
    await moduleRef.get<Connection>(getConnectionToken()).dropDatabase();
    await moduleRef.close();
  });

  it('creates a user and returns a profile without the password hash', async () => {
    const user = await users.create(ada);
    expect(user).toEqual({
      id: expect.stringMatching(/^[a-f0-9]{24}$/),
      email: ada.email,
      name: ada.name,
      createdAt: expect.any(Date),
    });
    expect(user).not.toHaveProperty('passwordHash');
  });

  it('rejects a second account for the same email, whatever the letter case', async () => {
    await expect(users.create({ ...ada, email: 'ADA@example.com' })).rejects.toBeInstanceOf(
      EmailAlreadyRegisteredError,
    );
  });

  it('finds credentials by email, the only read that exposes the hash', async () => {
    const found = await users.findCredentialsByEmail(ada.email);
    expect(found?.passwordHash).toBe(ada.passwordHash);
    expect(found?.user.email).toBe(ada.email);
  });

  it('answers null for an unknown email', async () => {
    expect(await users.findCredentialsByEmail('nobody@example.com')).toBeNull();
  });

  it('finds a user by id', async () => {
    const created = await users.create({ ...ada, email: 'grace@example.com', name: 'Grace' });
    expect(await users.findById(created.id)).toEqual(created);
  });

  it('answers null for an unknown or malformed id instead of throwing', async () => {
    expect(await users.findById('64b7f0f0f0f0f0f0f0f0f0f0')).toBeNull();
    expect(await users.findById('not-an-object-id')).toBeNull();
  });

  it('replaces the password hash', async () => {
    const created = await users.create({ ...ada, email: 'linus@example.com', name: 'Linus' });
    await users.updatePasswordHash(created.id, 'hash-2');
    expect((await users.findCredentialsByEmail('linus@example.com'))?.passwordHash).toBe('hash-2');
  });
});
