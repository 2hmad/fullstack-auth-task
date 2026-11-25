/** A user as the rest of the application sees it: never with the password hash. */
export interface User {
  id: string;
  email: string;
  name: string;
  createdAt: Date;
}

export interface NewUser {
  email: string;
  name: string;
  passwordHash: string;
}

export interface UserCredentials {
  user: User;
  passwordHash: string;
}

/** Raised by the repository when the unique email index rejects an insert. */
export class EmailAlreadyRegisteredError extends Error {
  constructor() {
    super('Email already registered');
    this.name = 'EmailAlreadyRegisteredError';
  }
}
