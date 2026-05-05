declare global {
  namespace App {
    interface Locals {
      session?: {
        id: string;
        displayName: string;
      };
      admin?: boolean;
    }
  }
}

export {};
