// Inert test stub — see vitest.config.ts. Tests inject their own storage.
export default {
  async getItem(): Promise<string | null> {
    return null;
  },
  async setItem(): Promise<void> {},
  async removeItem(): Promise<void> {},
};
