import { safeStorage } from "electron";
import { SecretEncryption } from "./CredentialStore";

export class ElectronSecretEncryption implements SecretEncryption {
  encrypt(value: string): Promise<Buffer> {
    return safeStorage.encryptStringAsync(value);
  }

  async decrypt(value: Buffer): Promise<string> {
    const decrypted = await safeStorage.decryptStringAsync(value);
    return decrypted.result;
  }
}
