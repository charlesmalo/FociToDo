import { randomUUID } from 'node:crypto';

export interface IdGenerator {
  next(): string;
}

export const uuidGenerator: IdGenerator = {
  next: () => randomUUID(),
};
